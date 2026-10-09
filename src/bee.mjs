// Single place that knows how to construct a working Bee client.
//
// @beeai/cli's library shells out to the `bee` binary. On Windows the global
// install is bee.cmd, and Node refuses to spawn .cmd without a shell, so
// `createBeeClient()` with defaults fails with ENOENT on every call.
// Pointing `command` at Node and `baseArgs` at the package's own bin entry
// bypasses the shim. See docs/friction-log.md.

import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createBeeClient } from "@beeai/cli/lib";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const beeEntry = path.join(
  repoRoot,
  "node_modules",
  "@beeai",
  "cli",
  "bin",
  "bee.js"
);

export function makeClient() {
  if (process.platform === "win32") {
    if (!existsSync(beeEntry)) {
      throw new Error(`Bee CLI entry not found at ${beeEntry}`);
    }
    return createBeeClient({
      command: process.execPath,
      baseArgs: [beeEntry],
    });
  }
  return createBeeClient();
}