import type { BuildConfig } from "bun";

import { parseArgs } from "node:util";
import buildWatch from "./build-watch";

const BUILD_CONFIG: BuildConfig = {
  entrypoints: ["./test/a-file.ts"],
  outdir: "./out",
  define: {
    "Bun.env.NODE_ENV": `"${Bun.env.NODE_ENV}"`,
  },
};

const {
  values: { watch, rescan, "no-clear-screen": noClearScreen, exclude, quiet },
} = parseArgs({
  args: Bun.argv,
  options: {
    watch: {
      type: "boolean",
      default: false,
    },
    rescan: {
      type: "boolean",
      default: false,
    },
    "no-clear-screen": {
      type: "boolean",
      default: false,
    },
    exclude: {
      type: "string",
      multiple: true,
      short: "x",
      default: ["./node_modules/**"],
    },
    quiet: {
      type: "boolean",
      default: false,
    },
  },
  strict: true,
  allowPositionals: true,
});

if (watch) {
  await buildWatch(BUILD_CONFIG, {
    rescan,
    clearScreen: !noClearScreen,
    exclude,
    quiet,
  });
} else {
  await Bun.build(BUILD_CONFIG);
}
