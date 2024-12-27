import type { BuildConfig } from "bun";

import { describe, it, expect, beforeEach, spyOn, afterAll } from "bun:test";
import path from "node:path";
import { mockListeners } from "../test/mocks";
import DependencyWatcher, { type DepWatchEvents } from "./dep-watcher";

const testFilePath = path.resolve("./test/a-file.ts");
const testDepPath = path.resolve("./test/a-dependency.ts");

const DEP_WATCH_EVENTS = ["watch", "change", "close"] as const;

beforeEach(async () => {
  await Bun.write(testFilePath, "export default true;\n");
  await Bun.write(testDepPath, "export default true;\n");
});

afterAll(async () => {
  await Bun.write(testFilePath, "export default true;\n");
  await Bun.write(testDepPath, "export default true;\n");
});

it("works", async () => {
  const paths = [testFilePath];

  const watcher = new DependencyWatcher(paths);

  const listeners = mockListeners<DepWatchEvents>(watcher, DEP_WATCH_EVENTS);

  await watcher.watch();

  expect(listeners.callCounts()).toEqual({ watch: 1, change: 0, close: 0 });

  await Bun.write(testFilePath, "export default false;\n");

  expect(listeners.callCounts()).toEqual({ watch: 1, change: 1, close: 0 });

  watcher.close();

  expect(listeners.callCounts()).toEqual({ watch: 1, change: 1, close: 1 });
});

it("throws when given an invalid entrypoint", async () => {
  const paths = ["./!not!a!real!file!"];

  const watcher = new DependencyWatcher(paths);

  expect(watcher.watch()).rejects.toEqual(expect.anything());
});

describe("watch()", () => {
  it("does nothing after the first call", async () => {
    const paths = [testFilePath];

    const watcher = new DependencyWatcher(paths);

    const listeners = mockListeners(watcher, DEP_WATCH_EVENTS);

    expect(listeners.callCounts()).toEqual({ watch: 0, change: 0, close: 0 });

    await watcher.watch();
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 0, close: 0 });

    await watcher.watch();
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 0, close: 0 });

    watcher.close();
  });

  it("errors when called after close", async () => {
    const paths = [testFilePath];

    const watcher = new DependencyWatcher(paths);

    watcher.close();

    expect(watcher.watch()).rejects.toEqual(expect.anything());
  });
});

describe("rescan()", () => {
  it("can run multiple times", async () => {
    const paths = [testFilePath];

    const watcher = new DependencyWatcher(paths);

    const listeners = mockListeners(watcher, DEP_WATCH_EVENTS);

    expect(listeners.callCounts()).toEqual({ watch: 0, change: 0, close: 0 });
    await watcher.rescan();
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 0, close: 0 });
    await watcher.rescan();
    expect(listeners.callCounts()).toEqual({ watch: 2, change: 0, close: 0 });

    watcher.close();
  });

  it("errors when called after close", async () => {
    const paths = [testFilePath];

    const watcher = new DependencyWatcher(paths);

    const listeners = mockListeners(watcher, DEP_WATCH_EVENTS);
    expect(listeners.callCounts()).toEqual({ watch: 0, change: 0, close: 0 });

    watcher.close();
    expect(listeners.callCounts()).toEqual({ watch: 0, change: 0, close: 1 });

    expect(watcher.rescan()).rejects.toEqual(
      new Error("cannot watch a closed DependencyWatcher")
    );

    expect(listeners.callCounts()).toEqual({ watch: 0, change: 0, close: 1 });
  });
});

describe("close()", () => {
  it("does nothing after the first call", async () => {
    const paths = [testFilePath];

    const watcher = new DependencyWatcher(paths);

    const listeners = mockListeners(watcher, DEP_WATCH_EVENTS);

    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
  });
});
