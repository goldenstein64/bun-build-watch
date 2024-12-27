import { expect, type Mock } from "bun:test";

function isMockFunction(
  value: unknown
): value is Mock<(...args: any[]) => any> {
  return (
    typeof value === "function" &&
    "_isMockFunction" in value &&
    value._isMockFunction === true
  );
}

declare module "bun:test" {
  interface Matchers<T> {
    toBeCalledAtLeast(min: number): void;
    toBeCalledAtMost(max: number): void;
    toBeCalledBetween(min: number, max: number): void;
  }
}

expect.extend({
  toBeCalledAtLeast(expected: unknown, min: number) {
    if (!isMockFunction(expected)) {
      throw new Error("expected value is not a mock function");
    }
    const callCount = expected.mock.calls.length;
    return { pass: min <= callCount };
  },

  toBeCalledAtMost(expected: unknown, max: number) {
    if (!isMockFunction(expected)) {
      throw new Error("expected value is not a mock function");
    }
    const callCount = expected.mock.calls.length;
    return { pass: callCount <= max };
  },

  toBeCalledBetween(expected: unknown, min: number, max: number) {
    if (!isMockFunction(expected)) {
      throw new Error("expected value is not a mock function");
    }
    const callCount = expected.mock.calls.length;
    return { pass: min <= callCount && callCount <= max };
  },
});
