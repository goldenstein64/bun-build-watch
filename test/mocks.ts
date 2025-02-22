import type { Mock } from "bun:test";

import { mock } from "bun:test";
import type { EventEmitter2 } from "../src/dep-watcher";

export function mockListeners<
  Events extends Record<string | symbol, unknown[]>,
>(source: EventEmitter2<Events>, events: readonly (keyof Events)[]) {
  const listeners = Object.fromEntries(
    events.values().map((evt) => {
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

    cleanup() {
      for (const [evt, listener] of Object.entries(listeners)) {
        source.off(evt, listener);
      }
    },
  } as const;
}
