import type { BuildConfig } from "bun";

import { it, expect, afterEach } from "bun:test";
import { mockListeners, mockBuild } from "./test/mocks";
import buildWatch from "./build-watch";

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
});
