import type { BuildConfig } from "bun";

import { parseArgs } from "node:util";
import buildWatch from "./build-watch";

const ARGS_CONFIG = {
  args: Bun.argv.slice(2),
  options: {
    help: {
      type: "boolean",
      default: false,
      description: "Print help text",
    },
    watch: {
      type: "boolean",
      default: false,
      description: "Build after file changes",
    },
    rescan: {
      type: "boolean",
      default: false,
      description: "Rescan the dependency tree after file changes",
    },
    "no-clear-screen": {
      type: "boolean",
      default: false,
      description: "Don't clear the screen after file changes",
    },
    exclude: {
      type: "string",
      multiple: true,
      short: "x",
      default: ["./node_modules/**"] as string | boolean | string[] | boolean[],
      description: "Exclude these globs",
    },
    quiet: {
      type: "boolean",
      default: false,
      description: "Don't print anything",
    },
  },
  allowPositionals: true,
} as const;

const {
  values: {
    help,
    watch,
    rescan,
    "no-clear-screen": noClearScreen,
    exclude,
    quiet,
  },
  positionals,
} = parseArgs(ARGS_CONFIG);

const BUILD_CONFIG: BuildConfig = {
  entrypoints: positionals.length > 0 ? positionals : ["./test/a-file.ts"],
  outdir: "./out",
  define: {
    "Bun.env.NODE_ENV": `"${Bun.env.NODE_ENV}"`,
  },
};

if (help) {
  const flags: string[] = [];
  for (const [longName, info] of Object.entries(ARGS_CONFIG.options)) {
    let cmd: string =
      "short" in info ?
        `  -${info.short}, --${longName}`.padEnd(33)
      : `      --${longName}`.padEnd(33);

    let description = "description" in info ? info.description : "";
    flags.push(`${cmd}${description}`);
  }
  const flagsDisplay = flags.join("\n");
  console.log(
    `Usage: bun example-build.ts [...flags]\n\nFlags:\n${flagsDisplay}`
  );
} else if (watch) {
  const watcher = buildWatch(BUILD_CONFIG, {
    rescan,
    clearScreen: !noClearScreen,
    exclude,
    quiet,
  });
  await watcher.watch();
} else {
  await Bun.build(BUILD_CONFIG);
}
