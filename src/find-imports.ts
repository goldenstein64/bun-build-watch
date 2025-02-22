import type { TSConfig, BunFile, Import } from "bun";
import type { ScanConfig } from "./dep-watcher";
import path from "node:path";

export type ScanOptions = Readonly<{
  /**
   * Use this `tsconfig.json` for the given file when scanning for import paths.
   * If omitted, it will walk up the file system, looking for the nearest
   * `tsconfig.json` for each file.
   */
  findTSConfig?(filePath: string): Promise<string | TSConfig | undefined>;

  /** Don't watch these globs. Defaults to `[ "./node_modules/**" ]`. */
  exclude?: readonly string[];
}>;

async function defaultFindTSConfigOnce(
  filePath: string
): Promise<BunFile | undefined> {
  const tsConfig = Bun.file(path.resolve(filePath, "tsconfig.json"));
  if (await tsConfig.exists()) return tsConfig;

  const jsConfig = Bun.file(path.resolve(filePath, "jsconfig.json"));
  if (await jsConfig.exists()) return jsConfig;
}

export async function defaultFindTSConfig(
  filePath: string
): Promise<string | TSConfig | undefined> {
  let dirPath = path.resolve(filePath, "..");

  // trying to walk up at the root returns the same path
  while (dirPath !== path.resolve(dirPath, "..")) {
    const config = await defaultFindTSConfigOnce(dirPath);
    if (config) return await config.text();

    dirPath = path.resolve(dirPath, "..");
  }

  return undefined;
}

export const DEFAULT_EXCLUDE: string[] = [
  // typically, node_modules doesn't change much when watching builds
  "./node_modules/**",
];

const extRegex = /\.(js|jsx|ts|tsx)$/;

class PathsMap extends Map<string, Set<string>> {}

async function findImportsOnce(
  filePaths: Set<string>,
  { findTSConfig, excludeGlobs }: ScanConfig
): Promise<PathsMap> {
  type ExtCapture = "js" | "jsx" | "ts" | "tsx";

  const childFiles = await Promise.all(
    filePaths
      .values()
      .map(async (parentPath): Promise<[string, Set<string>] | undefined> => {
        const match = parentPath.match(extRegex);
        if (match === null) return undefined;
        const loader = match[0] as ExtCapture;

        const parentFile = Bun.file(parentPath);
        const parentExists = await parentFile.exists();
        if (!parentExists) return undefined;

        const transpiler = new Bun.Transpiler({
          tsconfig: await findTSConfig(parentPath),
          loader,
        });

        let imports: Import[];
        try {
          imports = transpiler.scanImports(await parentFile.bytes());
        } catch (err) {
          if (err instanceof BuildMessage && err.level === "error") {
            // something went wrong when parsing this file, return undefined
            console.error(err);
            return undefined;
          } else {
            throw err;
          }
        }

        const resolvedImports = await Promise.all(
          imports
            .values()
            .map(async ({ path: importPath }): Promise<string | undefined> => {
              // import.meta.resolve seems to take node_modules into account
              // and Bun.resolveSync resolves the URL to a file path
              let resolvedImportPath: string;
              resolvedImportPath = Bun.resolveSync(
                import.meta.resolve(importPath, parentPath),
                parentPath
              );

              const resolvedFile = Bun.file(resolvedImportPath);

              if (
                excludeGlobs.every((glob) => !glob.match(resolvedImportPath)) &&
                (await resolvedFile.exists())
              ) {
                return resolvedImportPath;
              }
            })
        );

        return [
          parentPath,
          new Set<string>(resolvedImports.filter((str) => str !== undefined)),
        ];
      })
  );

  return new PathsMap(childFiles.filter((value) => value !== undefined));
}

function mergePaths(allPaths: PathsMap, foundPaths: PathsMap) {
  for (const [parentPath, childPaths] of foundPaths) {
    const allChildPaths = allPaths.get(parentPath);
    if (!allChildPaths) {
      allPaths.set(parentPath, childPaths);
      continue;
    }

    // If the same link `parent -> child` is found twice, there is a cyclic
    // import.
    if (!allChildPaths.isDisjointFrom(childPaths)) {
      throw new TypeError(
        `Cyclic import detected: ${parentPath}\n\t-> ${[
          ...allChildPaths.intersection(childPaths),
        ].join("\n\t-> ")}`
      );
    }
    allPaths.set(parentPath, allChildPaths.union(childPaths));
  }
}

/** recursively scans the files specified by `paths` for import paths */
export default async function findImports(
  paths: Iterable<string>,
  scanConfig: ScanConfig
): Promise<Set<string>> {
  const allPaths = new PathsMap();
  let foundPaths = new PathsMap().set("", new Set(paths));
  while (foundPaths.size > 0) {
    mergePaths(allPaths, foundPaths);

    foundPaths = await findImportsOnce(
      new Set(foundPaths.values().flatMap((value) => value)),
      scanConfig
    );
  }

  return new Set(allPaths.values().flatMap((value) => value));
}
