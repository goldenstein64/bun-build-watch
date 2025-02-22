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

import { type BuildConfig, type BuildOutput, type TSConfig } from "bun";
import EventEmitter from "node:events";

import path from "node:path";

import DependencyWatcher, { type DepWatchEvents } from "./dep-watcher";

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

type Log = { display: "log" | "error"; message: string };

export function formatBuildOutput(buildOutput: BuildOutput): Log[] {
  const display = buildOutput.success ? "log" : "error";
  const logs = buildOutput.logs
    .values()
    .map((msg) => ({ display, message: String(msg) }) as const);

  if (buildOutput.success) {
    const message = Bun.inspect.table(
      buildOutput.outputs.map(({ path: outPath, size }) => {
        const pathFormatted = path.relative(CURRENT_DIR, outPath);
        const sizeFormatted =
          size >= 1_000_000 ? `${(size / 1_000_000).toFixed(2)} MB`
          : size >= 1_000 ? `${(size / 1_000).toFixed(2)} KB`
          : `${size} B`;

        return { path: pathFormatted, size: sizeFormatted };
      })
    );
    return [{ display: "log", message }, ...logs];
  } else {
    return [...logs];
  }
}

export function formatWatchOutput(paths: Iterable<string>): Log[] {
  return [
    {
      display: "log",
      message: Bun.inspect.table(
        Iterator.from(paths)
          .map((filePath) => ({
            watching: path.relative(CURRENT_DIR, filePath),
          }))
          .toArray()
      ),
    },
  ];
}

function logToConsole(logs: Log[]): void {
  for (const log of logs) {
    switch (log.display) {
      case "log":
        console.log(log.message);
        break;
      case "error":
        console.error(log.message);
        break;
    }
  }
}

export function logBuildOutput(buildOutput: BuildOutput): void {
  logToConsole(formatBuildOutput(buildOutput));
}

export function logWatchOutput(paths: Iterable<string>): void {
  logToConsole(formatWatchOutput(paths));
}

export interface BuildWatchEvents extends DepWatchEvents {
  build: [buildOutput: BuildOutput];
}

export default class BuildWatcher<
  Events extends BuildWatchEvents = BuildWatchEvents,
> extends DependencyWatcher<Events> {
  testId: string | undefined;

  constructor(
    buildConfig: BuildConfig,
    {
      clearScreen = true,
      quiet = false,
      rescan = false,
      ...scanOptions
    }: BuildWatchOptions = {}
  ) {
    super(
      buildConfig.entrypoints.map((entrypoint) =>
        path.resolve(CURRENT_DIR, entrypoint)
      ),
      scanOptions
    );

    this.once("watch", async (...args) => {
      const buildOutput = await Bun.build(buildConfig);
      this.emit("build", buildOutput);
    });
    this.on("change", async (...args) => {
      const buildOutput = await Bun.build(buildConfig);
      this.emit("build", buildOutput);
    });

    if (rescan) {
      this.on("build", () => this.rescan());
    }

    if (!quiet) {
      if (clearScreen) {
        this.on("build", (output) => {
          console.clear();
          logBuildOutput(output);
        });
      } else {
        this.on("build", logBuildOutput);
      }

      this.on("watch", logWatchOutput);
    }
  }
}
