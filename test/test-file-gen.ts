import type { BunFile } from "bun";

let currentId = 0;
let lastCleanedId = 0;
function testFilePathFromId(id: number) {
  return `./test/files/file-${id}.ts`;
}

function getTestFilePath(): string {
  return testFilePathFromId(currentId++);
}

export async function getTestFile(content: string = ""): Promise<BunFile> {
  const filePath = getTestFilePath();
  const file = Bun.file(filePath);
  await file.write(content);
  return file;
}

export async function cleanCurrentFiles() {
  const promises: Promise<void>[] = [];
  for (let id = lastCleanedId; id < currentId; id++) {
    const file = Bun.file(testFilePathFromId(id));
    promises.push(
      file.exists().then((exists) => {
        if (exists) {
          return file.delete();
        }
      })
    );
  }
  await Promise.all(promises);
  lastCleanedId = currentId;
}

export async function cleanAllFiles() {
  const promises: Promise<void>[] = [];
  for (let id = 0; id < currentId; id++) {
    const file = Bun.file(testFilePathFromId(id));
    promises.push(
      file.exists().then((exists) => {
        if (exists) {
          return file.delete();
        }
      })
    );
  }
  await Promise.all(promises);
}
