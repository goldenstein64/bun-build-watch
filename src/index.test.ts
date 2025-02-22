import type { BuildConfig, BunFile } from "bun";

import { describe, it, expect, beforeEach, spyOn, afterAll } from "bun:test";
import { mockListeners } from "../test/mocks";
import {
  getTestFile,
  cleanCurrentFiles,
  cleanAllFiles,
} from "../test/test-file-gen";
import { once } from "node:events";
import path from "node:path";

import BuildWatcher from ".";

const EXPORT_TRUE_TEXT = "export default true;\n";
const EXPORT_FALSE_TEXT = "export default false;\n";

const importDepText = (dep: string) =>
  `import bool from "${dep}";\nexport default !bool;\n`;

let mockedBuild = spyOn(Bun, "build").mockImplementation(async () => {
  return Promise.resolve({ success: true, outputs: [], logs: [] });
});

const BUILD_WATCHER_EVENTS = ["watch", "build", "change", "close"] as const;

beforeEach(async () => {
  await cleanCurrentFiles();
  mockedBuild = mockedBuild.mockClear();
});

afterAll(async () => {
  await cleanAllFiles();
});

it("works", async () => {
  const testFile = await getTestFile(EXPORT_TRUE_TEXT);
  const buildConfig: BuildConfig = {
    entrypoints: [testFile.name!],
  };

  const watcher = new BuildWatcher(buildConfig, { quiet: true });
  watcher.testId = "works";

  const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

  await watcher.watch();
  await once(watcher, "build");
  expect(listeners.callCounts()).toEqual({
    build: 1,
    watch: 1,
    change: 0,
    close: 0,
  });
  expect(mockedBuild).toBeCalledTimes(1);

  await testFile.write(EXPORT_FALSE_TEXT);

  expect(listeners.callCounts()).toEqual({
    build: 2,
    watch: 1,
    change: 1,
    close: 0,
  });
  expect(mockedBuild).toBeCalledTimes(2);

  watcher.close();

  expect(listeners.callCounts()).toEqual({
    build: 2,
    watch: 1,
    change: 1,
    close: 1,
  });
  expect(mockedBuild).toBeCalledTimes(2);

  listeners.cleanup();
});

it("throws when given an invalid entrypoint", async () => {
  const buildConfig: BuildConfig = {
    entrypoints: ["./!not!a!real!file!"],
  };

  const watcher = new BuildWatcher(buildConfig, { quiet: true });

  try {
    expect(watcher.watch()).rejects.toEqual(expect.anything());
  } finally {
    watcher.close();
  }
});

describe("options", () => {
  describe("rescan: true", () => {
    it("works", async () => {
      const testFile = await getTestFile(EXPORT_TRUE_TEXT);
      const testDepFile = await getTestFile(EXPORT_TRUE_TEXT);
      const buildConfig: BuildConfig = {
        entrypoints: [testFile.name!],
        outdir: "./out",
      };

      const watcher = new BuildWatcher(buildConfig, {
        quiet: true,
        rescan: true,
      });
      watcher.testId = "options rescan: true works";

      const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

      try {
        expect(listeners.callCounts()).toEqual({
          build: 0,
          watch: 0,
          change: 0,
          close: 0,
        });

        await watcher.watch();
        expect(mockedBuild).toBeCalledTimes(1);
        await once(watcher, "build");
        expect(listeners.callCounts()).toEqual({
          build: 1,
          watch: 1,
          change: 0,
          close: 0,
        });

        await testFile.write(
          importDepText(`./${path.basename(testDepFile.name!)}`)
        );
        expect(mockedBuild).toBeCalledTimes(1);
        expect(listeners.callCounts()).toEqual({
          build: 1,
          watch: 1,
          change: 1,
          close: 0,
        });
      } finally {
        watcher.close();
        listeners.cleanup();
      }
      console.log("test finished");
    });
  });
});

describe("watch()", () => {
  it("does nothing after the first call", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const buildConfig: BuildConfig = {
      entrypoints: [testFile.name!],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });
    watcher.testId = "watch() does nothing after first call";
    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);
    try {
      expect(listeners.callCounts()).toEqual({
        build: 0,
        watch: 0,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).not.toBeCalled();

      await watcher.watch();
      await once(watcher, "build");
      expect(listeners.callCounts()).toEqual({
        build: 1,
        watch: 1,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).toBeCalledTimes(1);

      await watcher.watch();
      expect(listeners.callCounts()).toEqual({
        build: 1,
        watch: 1,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).toBeCalledTimes(1);
    } finally {
      watcher.close();
      listeners.cleanup();
    }
  });

  it("errors when called after close", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const buildConfig: BuildConfig = {
      entrypoints: [testFile.name!],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    watcher.close();

    expect(watcher.watch()).rejects.toEqual(expect.anything());
  });
});

describe("rescan()", () => {
  it("can run multiple times", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const buildConfig: BuildConfig = {
      entrypoints: [testFile.name!],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });
    watcher.testId = "rescan() can run multiple times";

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

    try {
      expect(listeners.callCounts()).toEqual({
        build: 0,
        watch: 0,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).not.toBeCalled();
      await watcher.rescan();
      await once(watcher, "build");
      expect(listeners.callCounts()).toEqual({
        build: 1,
        watch: 1,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).toBeCalledTimes(1);
      await watcher.rescan();
      expect(listeners.callCounts()).toEqual({
        build: 1,
        watch: 2,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).toBeCalledTimes(1);
    } finally {
      watcher.close();
      listeners.cleanup();
    }
  });

  it("errors when called after close", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const buildConfig: BuildConfig = {
      entrypoints: [testFile.name!],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);
    try {
      expect(listeners.callCounts()).toEqual({
        build: 0,
        watch: 0,
        change: 0,
        close: 0,
      });
      expect(mockedBuild).not.toBeCalled();

      watcher.close();
      expect(listeners.callCounts()).toEqual({
        build: 0,
        watch: 0,
        change: 0,
        close: 1,
      });
      expect(mockedBuild).not.toBeCalled();

      expect(watcher.rescan()).rejects.toEqual(
        new Error("cannot watch a closed DependencyWatcher")
      );

      expect(listeners.callCounts()).toEqual({
        build: 0,
        watch: 0,
        change: 0,
        close: 1,
      });
      expect(mockedBuild).not.toBeCalled();
    } finally {
      watcher.close();
      listeners.cleanup();
    }
  });
});

describe("close()", () => {
  it("does nothing after the first call", async () => {
    const testFile = await getTestFile(EXPORT_TRUE_TEXT);
    const buildConfig: BuildConfig = {
      entrypoints: [testFile.name!],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
    listeners.cleanup();
  });
});
