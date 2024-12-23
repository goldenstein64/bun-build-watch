import type { BuildConfig } from "bun";

import { it, expect, afterEach } from "bun:test";
import { mockListeners, mockBuild } from "../test/mocks";
import buildWatch from ".";

const testFilePath = "./test/a-file.ts";

afterEach(async () => {
  await Bun.write(testFilePath, "export default true;\r\n", {
    createPath: false,
  });
});

it("works", async () => {
  const buildMock = mockBuild();

  const buildConfig: BuildConfig = {
    entrypoints: [testFilePath],
  };

  const watcher = buildWatch(buildConfig, { quiet: true });

  const listeners = mockListeners(watcher);

  await watcher.watch();

  expect(listeners.build).toBeCalledTimes(1);
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.close).not.toBeCalled();
  expect(listeners.change).not.toBeCalled();
  expect(buildMock).toBeCalledTimes(1);

  await Bun.write(testFilePath, "export default false;");

  watcher.close();

  expect(listeners.build).toBeCalledTimes(2);
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.close).toBeCalledTimes(1);
  expect(listeners.change).toBeCalledTimes(1);
  expect(buildMock).toBeCalledTimes(2);

  buildMock.mockRestore();
});

it("makes calling watch do nothing after calling it once", async () => {
  const buildMock = mockBuild();

  const buildConfig: BuildConfig = {
    entrypoints: [testFilePath],
  };

  const watcher = buildWatch(buildConfig, { quiet: true });

  const listeners = mockListeners(watcher);

  expect(listeners.watch).not.toBeCalled();
  expect(listeners.build).not.toBeCalled();
  expect(buildMock).not.toBeCalled();
  await watcher.watch();
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.build).toBeCalledTimes(1);
  expect(buildMock).toBeCalledTimes(1);
  await watcher.watch();
  expect(listeners.watch).toBeCalledTimes(1);
  expect(listeners.build).toBeCalledTimes(1);
  expect(buildMock).toBeCalledTimes(1);

  buildMock.mockRestore();
});

it("makes calling close do nothing after calling it once", async () => {
  const buildConfig: BuildConfig = {
    entrypoints: [testFilePath],
  };

  const watcher = buildWatch(buildConfig, { quiet: true });

  const listeners = mockListeners(watcher);

  watcher.close();
  expect(listeners.close).toBeCalledTimes(1);
  watcher.close();
  expect(listeners.close).toBeCalledTimes(1);
});

it("errors when calling watch after close", async () => {
  const buildConfig: BuildConfig = {
    entrypoints: [testFilePath],
  };

  const watcher = buildWatch(buildConfig, { quiet: true });

  watcher.close();

  try {
    await watcher.watch();
    expect.unreachable();
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
  }
});
