import type { TSConfig, Glob, BunFile } from "bun";
import type { WatchEventType, FSWatcher } from "node:fs";

import EventEmitter from "node:events";
import { watch } from "node:fs";
import path from "node:path";

import findImports from "./find-imports";

const USES_WIN32_SEP = path.sep === path.win32.sep;
const CURRENT_DIR = process.cwd();

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

export type ScanConfig = {
  findTSConfig(filePath: string): Promise<string | TSConfig | undefined>;
  excludeGlobs: readonly Glob[];
};

export type ScanOptions = Readonly<{
  /**
   * Use this `tsconfig.json` for the given file when scanning for import paths.
   * If omitted, it will walk up the file system, looking for the nearest
   * `tsconfig.json` for each file.
   */
  findTSConfig?(filePath: string): Promise<string | TSConfig | undefined>;

  /** Don't watch these globs. Defaults to `[ "./node_modules/**" ]`. */
  exclude?: readonly string[];
}>;

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

export interface DepWatchEvents
  extends Record<string, unknown[]>,
    Record<symbol, never> {
  watch: [paths: string[]];
  change: [event: WatchEventType, filename: string | null];
  close: [];
}

export interface EventEmitter2<
  Events extends Record<string | symbol, unknown[]>,
> {
  emit<E extends keyof Events>(eventName: E, ...args: Events[E]): boolean;
  on<E extends keyof Events>(
    eventName: E,
    listener: (...args: Events[E]) => void
  ): this;
  once<E extends keyof Events>(
    eventName: E,
    listener: (...args: Events[E]) => void
  ): this;
  off<E extends keyof Events>(
    eventName: E,
    listener: (...args: Events[E]) => void
  ): this;
  prependListener<E extends keyof Events>(
    eventName: E,
    listener: (...args: Events[E]) => void
  ): this;
  prependOnceListener<E extends keyof Events>(
    eventName: E,
    listener: (...args: Events[E]) => void
  ): this;
}

export class EventEmitter2<
  Events extends Record<string | symbol, unknown[]>,
> extends EventEmitter {}

export default class DependencyWatcher<
  Events extends DepWatchEvents = DepWatchEvents,
> extends EventEmitter2<Events> {
  readonly fullPaths: string[];
  readonly scanConfig: ScanConfig;
  watchers: FSWatcher[] = [];
  state: "ready" | "watching" | "closed" = "ready";

  constructor(
    fullPaths: Iterable<string>,
    {
      findTSConfig = defaultFindTSConfig,
      exclude = DEFAULT_EXCLUDE,
    }: ScanOptions = {}
  ) {
    super();
    const excludeGlobs = exclude
      .values()
      .map((filePath) => resolveGlob(CURRENT_DIR, filePath))
      .map((glob) => new Bun.Glob(glob))
      .toArray();

    this.fullPaths = [...fullPaths];
    this.scanConfig = { findTSConfig, excludeGlobs };
  }

  #emitFileChanges(event: WatchEventType, filename: string | null) {
    this.emit("change", event, filename);
  }

  /** starts watching files, doing nothing if already watching */
  async watch(): Promise<string[] | undefined> {
    if (this.state === "watching") return undefined;
    return await this.rescan();
  }

  /** starts watching files and forcefully re-scans the dependency tree */
  async rescan(): Promise<string[]> {
    if (this.state === "closed")
      throw new Error("cannot watch a closed DependencyWatcher");

    for (const watcher of this.watchers) watcher.close();

    this.state = "watching";
    const emitFileChanges = this.#emitFileChanges.bind(this);
    const paths = await findImports(this.fullPaths, this.scanConfig);
    this.watchers = Iterator.from(paths)
      .map((filePath) => watch(filePath, emitFileChanges))
      .toArray();
    this.once("close", () => {
      for (const watcher of this.watchers) watcher.close();
    });

    const pathsArray = [...paths];
    this.emit("watch", pathsArray);
    return pathsArray;
  }

  /** stops watching files */
  close(): void {
    if (this.state === "closed") return;

    for (const watcher of this.watchers) watcher.close();

    this.state = "closed";
    this.emit("close");
    this.removeAllListeners();
  }
}
