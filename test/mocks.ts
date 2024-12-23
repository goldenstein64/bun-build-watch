import type { BuildWatcher } from "../src";

import { mock, spyOn } from "bun:test";

export function mockListeners(watcher: BuildWatcher) {
  const watchListener = mock(() => {});
  const buildListener = mock(() => {});
  const changeListener = mock(() => {});
  const closeListener = mock(() => {});

  watcher.on("watch", watchListener);
  watcher.on("build", buildListener);
  watcher.on("change", changeListener);
  watcher.on("close", closeListener);

  return {
    watch: watchListener,
    build: buildListener,
    change: changeListener,
    close: closeListener,
  } as const;
}

export function mockBuild() {
  const buildMock = spyOn(Bun, "build");
  buildMock.mockImplementation(() =>
    Promise.resolve({ success: true, outputs: [], logs: [] })
  );
  return buildMock;
}
