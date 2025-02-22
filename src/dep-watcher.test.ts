import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mockListeners } from "../test/mocks";
import {
  getTestFile,
  cleanCurrentFiles,
  cleanAllFiles,
} from "../test/test-file-gen";
import DependencyWatcher, { type DepWatchEvents } from "./dep-watcher";

const TEST_FILE_PATH = "./test/files/a-file.ts";

const EXPORT_TRUE_TEXT = "export default true;\n";
const EXPORT_FALSE_TEXT = "export default false;\n";

const DEP_WATCH_EVENTS = ["watch", "change", "close"] as const;

beforeEach(async () => {
  await cleanCurrentFiles();
});

afterAll(async () => {
  await cleanAllFiles();
});

it("works", async () => {
  const testFile = await getTestFile(EXPORT_TRUE_TEXT);
  const paths = [testFile.name!];

  const watcher = new DependencyWatcher(paths);

  const listeners = mockListeners<DepWatchEvents>(watcher, DEP_WATCH_EVENTS);

  try {
    await watcher.watch();
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 0, close: 0 });

    await testFile.write(EXPORT_FALSE_TEXT);
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 1, close: 0 });
  } finally {
    watcher.close();
    expect(listeners.callCounts()).toEqual({ watch: 1, change: 1, close: 1 });
    listeners.cleanup();
  }
});

it("throws when given an invalid entrypoint", async () => {
  const paths = ["./!not!a!real!file!"];

  const watcher = new DependencyWatcher(paths);
  try {
    expect(watcher.watch()).rejects.toEqual(expect.anything());
  } finally {
    watcher.close();
  }
});

describe("watch()", () => {
  it("does nothing after the first call", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const paths = [testFile.name!];

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
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const paths = [testFile.name!];

    const watcher = new DependencyWatcher(paths);

    watcher.close();

    expect(watcher.watch()).rejects.toEqual(expect.anything());
  });
});

describe("rescan()", () => {
  it("can run multiple times", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const paths = [testFile.name!];

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
    const paths = [TEST_FILE_PATH];

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
    const paths = [TEST_FILE_PATH];

    const watcher = new DependencyWatcher(paths);

    const listeners = mockListeners(watcher, DEP_WATCH_EVENTS);

    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
  });
});
