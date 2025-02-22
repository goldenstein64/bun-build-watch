import { watch } from "node:fs";

const filePath = "./test/a-file.ts";

const TRIALS = 1_000;

let failCount = 0;
for (let i = 0; i < TRIALS; i++) {
  let changeCount = 0;

  const watcher = watch(filePath, () => {
    changeCount++;
  });

  await Bun.write(filePath, "a");
  if (changeCount !== 1) {
    failCount++;
    watcher.close();
    continue;
  }

  await Bun.write(filePath, "b");
  // @ts-expect-error
  if (changeCount !== 2) {
    failCount++;
    watcher.close();
    continue;
  }

  await Bun.write(filePath, "c");
  if (changeCount !== 3) {
    failCount++;
    watcher.close();
    continue;
  }

  watcher.close();
}

console.log(failCount / TRIALS);
