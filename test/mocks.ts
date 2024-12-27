import type { Mock } from "bun:test";

import { mock } from "bun:test";
import type { EventEmitter2 } from "../src/dep-watcher";

const events = ["watch", "build", "change", "close"] as const;

export function mockListeners<
  Events extends Record<string | symbol, unknown[]>,
>(source: EventEmitter2<Events>, events: readonly (keyof Events)[]) {
  for (const evt of events) {
    const listener = mock(() => {});
    source.on(evt, listener);
  }

  const listeners = Object.fromEntries(
    events.map((evt) => {
      const listener = mock(() => {});
      source.on(evt, listener);
      return [evt, listener] as const;
    })
  ) as Record<keyof Events, Mock<() => void>>;

  return {
    ...listeners,

    callCounts() {
      return Object.fromEntries(
        Object.entries(listeners)
          .values()
          .map(([k, listener]) => [k, listener.mock.calls.length])
      ) as Record<keyof Events, number>;
    },
  } as const;
}
