/**
 * implements a dependency-aware file watcher that calls `Bun.build` whenever a
 * file change occurs
 *
 * - It uses an experimental API, `import.meta.resolve` with two arguments.
 * - It uses these Bun APIs:
 *   - `Bun.build`
 *   - `Bun.file`
 *   - `Bun.Transpiler`
 *   - `Bun.resolveSync`
 *   - `Iterator` extensions
 * @module build-watch
 */

import type { BuildConfig, BuildOutput, BunFile, Glob, TSConfig } from "bun";
import EventEmitter from "node:events";
import type { FSWatcher, WatchEventType } from "node:fs";

import { watch } from "node:fs";
import path from "node:path";

type ScanConfig = {
  findTSConfig(filePath: string): Promise<string | TSConfig | undefined>;
  excludeGlobs: readonly Glob[];
};

type ScanOptions = Readonly<{
  /**
   * Use this `tsconfig.json` for the given file when scanning for import paths.
   * If omitted, it will walk up the file system, looking for the nearest
   * `tsconfig.json` for each file.
   */
  findTSConfig?(filePath: string): Promise<string | TSConfig | undefined>;

  /** Don't watch these globs. Defaults to `[ "./node_modules/**" ]`. */
  exclude?: readonly string[];
}>;

export type BuildWatchOptions = Readonly<{
  /** Disable clearing the terminal screen on change. Defaults to `true`. */
  clearScreen?: boolean;

  /** Disable logging to terminal screen on change. Defaults to `false`. */
  quiet?: boolean;

  /**
   * Refresh the dependency tree every time `Bun.build` is called. Defaults to
   * `false`.
   */
  rescan?: boolean;
}> &
  ScanOptions;

const CURRENT_DIR = process.cwd();

async function defaultFindTSConfigOnce(
  filePath: string
): Promise<BunFile | undefined> {
  const tsConfig = Bun.file(path.resolve(filePath, "tsconfig.json"));
  if (await tsConfig.exists()) return tsConfig;

  const jsConfig = Bun.file(path.resolve(filePath, "jsconfig.json"));
  if (await jsConfig.exists()) return jsConfig;
}

export async function defaultFindTSConfig(
  filePath: string
): Promise<string | TSConfig | undefined> {
  let dirPath = path.resolve(filePath, "..");

  // trying to walk up at the root returns the same path
  while (dirPath !== path.resolve(dirPath, "..")) {
    const config = await defaultFindTSConfigOnce(dirPath);
    if (config) return await config.text();

    dirPath = path.resolve(dirPath, "..");
  }

  return undefined;
}

export const DEFAULT_EXCLUDE: string[] = [
  // typically, node_modules doesn't change much when watching builds
  "./node_modules/**",
];
const USES_WIN32_SEP = path.sep === path.win32.sep;

const extRegex = /\.(js|jsx|ts|tsx)$/;

class PathsMap extends Map<string, Set<string>> {}

async function findImportsOnce(
  filePaths: Set<string>,
  { findTSConfig, excludeGlobs }: ScanConfig
): Promise<PathsMap> {
  type ExtCapture = "js" | "jsx" | "ts" | "tsx";

  const childFiles = await Promise.all(
    filePaths
      .values()
      .map(async (parentPath): Promise<[string, Set<string>] | undefined> => {
        const match = parentPath.match(extRegex);
        if (match === null) return undefined;
        const loader = match[0] as ExtCapture;

        const parentFile = Bun.file(parentPath);
        const parentExists = await parentFile.exists();
        if (!parentExists) return undefined;

        const transpiler = new Bun.Transpiler({
          tsconfig: await findTSConfig(parentPath),
          loader,
        });

        const imports = transpiler.scanImports(await parentFile.bytes());
        const resolvedImports = await Promise.all(
          imports
            .values()
            .map(async ({ path: importPath }): Promise<string | undefined> => {
              // import.meta.resolve seems to take node_modules into account
              // and Bun.resolveSync resolves the URL to a file path
              let resolvedImportPath: string;
              try {
                resolvedImportPath = Bun.resolveSync(
                  import.meta.resolve(importPath, parentPath),
                  parentPath
                );
              } catch (err) {
                return undefined;
              }

              const resolvedFile = Bun.file(resolvedImportPath);

              if (
                excludeGlobs.every((glob) => !glob.match(resolvedImportPath)) &&
                (await resolvedFile.exists())
              ) {
                return resolvedImportPath;
              }
            })
        );

        return [
          parentPath,
          new Set<string>(resolvedImports.filter((str) => str !== undefined)),
        ];
      })
  );

  return new PathsMap(childFiles.filter((value) => value !== undefined));
}

function mergePaths(allPaths: PathsMap, foundPaths: PathsMap) {
  for (const [parentPath, childPaths] of foundPaths) {
    const allChildPaths = allPaths.get(parentPath);
    if (!allChildPaths) {
      allPaths.set(parentPath, childPaths);
      continue;
    }

    // If the same link `parent -> child` is found twice, there is a cyclic
    // import.
    if (!allChildPaths.isDisjointFrom(childPaths)) {
      throw new TypeError(
        `Cyclic import detected: ${parentPath}\n\t-> ${[
          ...allChildPaths.intersection(childPaths),
        ].join("\n\t-> ")}`
      );
    }
    allPaths.set(parentPath, allChildPaths.union(childPaths));
  }
}

/** recursively scans the files specified by `paths` for import paths */
export async function findImports(
  paths: string[],
  scanConfig: ScanConfig
): Promise<Set<string>> {
  const allPaths = new PathsMap();
  let foundPaths = new PathsMap().set("", new Set(paths));
  while (foundPaths.size > 0) {
    mergePaths(allPaths, foundPaths);

    foundPaths = await findImportsOnce(
      new Set(foundPaths.values().flatMap((value) => value)),
      scanConfig
    );
  }

  return new Set(allPaths.values().flatMap((value) => value));
}

export function logBuildOutput(buildOutput: BuildOutput): void {
  if (buildOutput.success) {
    console.table(
      buildOutput.outputs.map(({ path: outPath, size }) => {
        const pathFormatted = path.relative(CURRENT_DIR, outPath);
        const sizeFormatted =
          size >= 1_000_000 ? `${(size / 1_000_000).toFixed(2)} MB`
          : size >= 1_000 ? `${(size / 1_000).toFixed(2)} KB`
          : `${size} B`;

        return { path: pathFormatted, size: sizeFormatted };
      })
    );
  } else {
    for (const log of buildOutput.logs) console.error(log);
  }
}

export function logWatchOutput(paths: Iterable<string>): void {
  console.table(
    Iterator.from(paths)
      .map((filePath) => ({
        watching: path.relative(CURRENT_DIR, filePath),
      }))
      .toArray()
  );
}

function resolveGlob(...paths: [string, ...string[]]) {
  const pathGlob = paths.pop()!;
  let currentDir = path.resolve(...paths);
  if (USES_WIN32_SEP) {
    // a hack to keep the glob valid while making it absolute
    const driveIndex = currentDir.indexOf(":") + 1;
    const driveLtr = currentDir.slice(0, driveIndex);
    currentDir = currentDir
      .slice(driveIndex)
      .replaceAll(path.win32.sep, path.posix.sep);
    return driveLtr + path.posix.resolve(currentDir, pathGlob);
  } else {
    return path.posix.resolve(currentDir, pathGlob);
  }
}

type BuildWatchEvents = {
  change: [event: WatchEventType, filename: string | null];
  build: [buildOutput: BuildOutput];
  watch: [paths: string[]];
  close: [];
};

/**
 * the result of calling `buildWatch`. This is just a thin wrapper over
 * `EventEmitter` with a `close` method. All of the connections are set up when
 * calling `buildWatch`.
 */
export class BuildWatcher extends EventEmitter<BuildWatchEvents> {
  readonly #internal: EventEmitter<BuildWatchEvents>;
  readonly #watch: () => Promise<void>;
  #state: "ready" | "watching" | "closed" = "ready";

  constructor(
    internal: EventEmitter<BuildWatchEvents>,
    watch: () => Promise<void>
  ) {
    super();
    this.#internal = internal;
    this.#watch = watch;
    internal.on("change", (...args) => this.emit("change", ...args));
    internal.on("build", (...args) => this.emit("build", ...args));
    internal.on("watch", (...args) => this.emit("watch", ...args));
    internal.on("close", (...args) => this.emit("close", ...args));
  }

  /** starts building and watching files */
  async watch(): Promise<void> {
    if (this.#state === "closed")
      throw new Error("cannot re-watch a closed BuildWatcher");
    if (this.#state === "watching") return;

    await this.#watch();
    this.#state = "watching";
  }

  /** stops building and watching files */
  close() {
    if (this.#state === "closed") return;

    this.#internal.emit("close");
    this.#state = "closed";
  }
}

/**
 * runs `Bun.build(buildConfig)` every time a file in the `entrypoints`
 * dependency tree changes
 *
 * @param {BuildConfig} buildConfig - the config passed to `Bun.build`
 * @param {BuildWatchOptions} [options] - additional options for modifying scan/watch behavior
 *
 * @returns {BuildWatcher} an object for stopping watch behavior and listening for events
 */
export default function buildWatch(
  buildConfig: BuildConfig,
  {
    clearScreen = true,
    quiet = false,
    rescan: rescanEnabled = false,
    exclude = DEFAULT_EXCLUDE,
    findTSConfig = defaultFindTSConfig,
  }: BuildWatchOptions = {}
): BuildWatcher {
  const excludeGlobs = exclude
    .values()
    .map((filePath) => resolveGlob(CURRENT_DIR, filePath))
    .map((glob) => new Bun.Glob(glob))
    .toArray();

  const entrypointPaths = buildConfig.entrypoints.map((entrypoint) =>
    path.resolve(CURRENT_DIR, entrypoint)
  );

  const internal = new EventEmitter<BuildWatchEvents>();

  const scanOptions: ScanConfig = {
    excludeGlobs: excludeGlobs,
    findTSConfig,
  };

  let watchers: FSWatcher[] = [];

  function onInterrupt() {
    internal.emit("close");
    process.exit(0);
  }

  async function buildAndEmit() {
    const buildOutput = await Bun.build(buildConfig);
    internal.emit("build", buildOutput);
  }

  function emitFileChanges(event: WatchEventType, filename: string | null) {
    internal.emit("change", event, filename);
  }

  function startWatching(paths: Iterable<string>): FSWatcher[] {
    const pathsArray = [...paths];

    const newWatchers = pathsArray.map((filePath) =>
      watch(filePath, emitFileChanges)
    );

    internal.emit("watch", pathsArray);

    return newWatchers;
  }

  if (rescanEnabled) {
    async function rescan() {
      for (const watcher of watchers) watcher.close();

      watchers = startWatching(await findImports(entrypointPaths, scanOptions));
    }

    internal.on("build", rescan);
    internal.once("close", () => internal.off("build", rescan));
  }

  if (!quiet) {
    function logOnBuild(buildOutput: BuildOutput) {
      if (clearScreen) console.clear();
      logBuildOutput(buildOutput);
    }

    function logOnWatch(paths: string[]) {
      logWatchOutput(paths);
    }

    internal.on("build", logOnBuild);
    internal.on("watch", logOnWatch);
    internal.once("close", () => {
      internal.off("build", logOnBuild);
      internal.off("watch", logOnWatch);
    });
  }

  process.once("SIGINT", onInterrupt);
  internal.on("change", buildAndEmit);
  internal.once("close", () => {
    for (const watcher of watchers) watcher.close();
    internal.off("change", buildAndEmit);
  });

  return new BuildWatcher(internal, async () => {
    const entrypointsExist = await Promise.all(
      entrypointPaths.map((path) => Bun.file(path).exists())
    );
    if (!entrypointsExist.every(Boolean)) {
      const invalidPaths = entrypointPaths
        .values()
        .filter((_, i) => !entrypointsExist[i])
        .toArray();
      throw new TypeError(
        `entrypoints don't exist: ${invalidPaths.join(", ")}`
      );
    }

    await buildAndEmit();
    watchers = startWatching(await findImports(entrypointPaths, scanOptions));
  });
}
