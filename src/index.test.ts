import type { BuildConfig } from "bun";

import { describe, it, expect, beforeEach, spyOn, afterAll } from "bun:test";
import { mockListeners } from "../test/mocks";
import BuildWatcher from ".";

const testFilePath = "./test/a-file.ts";
const testDepPath = "./test/a-dependency.ts";

const testFileImportDep = [
  'import bool from "./a-dependency.ts";',
  "export default !bool;",
].join("\n");

let mockedBuild = spyOn(Bun, "build").mockImplementation(async () => {
  return Promise.resolve({ success: true, outputs: [], logs: [] });
});

const BUILD_WATCHER_EVENTS = ["watch", "build", "change", "close"] as const;

beforeEach(async () => {
  await Bun.write(testFilePath, "export default true;\n");
  await Bun.write(testDepPath, "export default true;\n");
  mockedBuild = mockedBuild.mockClear();
});

afterAll(async () => {
  await Bun.write(testFilePath, "export default true;\n");
  await Bun.write(testDepPath, "export default true;\n");
});

it("works", async () => {
  const buildConfig: BuildConfig = {
    entrypoints: [testFilePath],
  };

  const watcher = new BuildWatcher(buildConfig, { quiet: true });

  const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

  await watcher.watch();

  expect(listeners.callCounts()).toEqual({
    build: 1,
    watch: 1,
    change: 0,
    close: 0,
  });

  expect(listeners.build).toBeCalledTimes(1);
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.change).not.toBeCalled();
  expect(listeners.close).not.toBeCalled();
  expect(mockedBuild).toBeCalledTimes(1);

  await Bun.write(testFilePath, "export default false;\n");

  expect(listeners.build).toBeCalledTimes(2);
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.change).toBeCalledTimes(1);
  expect(listeners.close).not.toBeCalled();
  expect(mockedBuild).toBeCalledTimes(2);

  watcher.close();

  expect(listeners.build).toBeCalledTimes(2);
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.change).toBeCalledTimes(1);
  expect(listeners.close).toBeCalledTimes(1);
  expect(mockedBuild).toBeCalledTimes(2);
});

it("throws when given an invalid entrypoint", async () => {
  const buildConfig: BuildConfig = {
    entrypoints: ["./!not!a!real!file!"],
  };

  const watcher = new BuildWatcher(buildConfig, { quiet: true });

  expect(watcher.watch()).rejects.toEqual(expect.anything());
});

describe("options", () => {
  describe("rescan: true", () => {
    it("works", async () => {
      const buildConfig: BuildConfig = {
        entrypoints: [testFilePath],
      };

      const watcher = new BuildWatcher(buildConfig, {
        quiet: true,
        rescan: true,
      });

      const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

      await watcher.watch();

      expect(listeners.build).toBeCalledTimes(1);
      expect(listeners.watch).toBeCalledTimes(1);
      expect(listeners.change).not.toBeCalled();
      expect(listeners.close).not.toBeCalled();
      expect(mockedBuild).toBeCalledTimes(1);

      await Bun.write(testFilePath, testFileImportDep);

      expect(listeners.build).toBeCalledTimes(2);
      expect(listeners.watch).toBeCalledTimes(2);
      expect(listeners.change).toBeCalledTimes(2);
      expect(listeners.close).not.toBeCalled();
      expect(mockedBuild).toBeCalledTimes(2);

      watcher.close();
    });
  });
});

describe("watch()", () => {
  it("does nothing after the first call", async () => {
    const buildConfig: BuildConfig = {
      entrypoints: [testFilePath],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

    expect(listeners.build).not.toBeCalled();
    expect(listeners.watch).not.toBeCalled();
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).not.toBeCalled();

    await watcher.watch();
    expect(listeners.build).toBeCalledTimes(1);
    expect(listeners.watch).toBeCalledTimes(1);
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).toBeCalledTimes(1);

    await watcher.watch();
    expect(listeners.build).toBeCalledTimes(1);
    expect(listeners.watch).toBeCalledTimes(1);
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).toBeCalledTimes(1);

    watcher.close();
  });

  it("errors when called after close", async () => {
    const buildConfig: BuildConfig = {
      entrypoints: [testFilePath],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    watcher.close();

    expect(watcher.watch()).rejects.toEqual(expect.anything());
  });
});

describe("rescan()", () => {
  it("can run multiple times", async () => {
    const buildConfig: BuildConfig = {
      entrypoints: [testFilePath],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

    expect(listeners.build).not.toBeCalled();
    expect(listeners.watch).not.toBeCalled();
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).not.toBeCalled();
    await watcher.rescan();
    expect(listeners.build).toBeCalledTimes(1);
    expect(listeners.watch).toBeCalledTimes(1);
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).toBeCalledTimes(1);
    await watcher.rescan();
    expect(listeners.build).toBeCalledTimes(1);
    expect(listeners.watch).toBeCalledTimes(2);
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).toBeCalledTimes(1);

    watcher.close();
  });

  it("errors when called after close", async () => {
    const buildConfig: BuildConfig = {
      entrypoints: [testFilePath],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);
    expect(listeners.build).not.toBeCalled();
    expect(listeners.watch).not.toBeCalled();
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).not.toBeCalled();
    expect(mockedBuild).not.toBeCalled();

    watcher.close();
    expect(listeners.build).not.toBeCalled();
    expect(listeners.watch).not.toBeCalled();
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).toBeCalledTimes(1);
    expect(mockedBuild).not.toBeCalled();

    expect(watcher.rescan()).rejects.toEqual(
      new Error("cannot watch a closed DependencyWatcher")
    );

    expect(listeners.build).not.toBeCalled();
    expect(listeners.watch).not.toBeCalled();
    expect(listeners.change).not.toBeCalled();
    expect(listeners.close).toBeCalledTimes(1);
    expect(mockedBuild).not.toBeCalled();
  });
});

describe("close()", () => {
  it("does nothing after the first call", async () => {
    const buildConfig: BuildConfig = {
      entrypoints: [testFilePath],
    };

    const watcher = new BuildWatcher(buildConfig, { quiet: true });

    const listeners = mockListeners(watcher, BUILD_WATCHER_EVENTS);

    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
    watcher.close();
    expect(listeners.close).toBeCalledTimes(1);
  });
});
