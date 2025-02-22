import { describe, it, expect, beforeEach, afterAll } from "bun:test";

import { watch } from "node:fs/promises";

const testFilePath = "./test/files/a-file.ts";
const testDepPath = "./test/files/a-dependency.ts";

const IMPORT_DEP_TEXT = `
import bool from "./a-dependency.ts";
export default !bool;
`;
const EXPORT_TRUE_TEXT = "export default true;\n";

beforeEach(async () => {
  await Bun.write(testFilePath, EXPORT_TRUE_TEXT);
  await Bun.write(testDepPath, EXPORT_TRUE_TEXT);
});

afterAll(async () => {
  await Bun.write(testFilePath, EXPORT_TRUE_TEXT);
  await Bun.write(testDepPath, EXPORT_TRUE_TEXT);
});

describe("FSWatcher", () => {
  it.skipIf(process.platform === "win32")("works", async () => {
    let changeCount = 0;

    (async () => {
      for await (const evt of watch(testFilePath)) {
        changeCount++;
      }
    })();

    await Bun.write(testFilePath, IMPORT_DEP_TEXT);
    expect(changeCount).toEqual(1);

    await Bun.write(testFilePath, EXPORT_TRUE_TEXT);
    expect(changeCount).toEqual(2);
  });
});
