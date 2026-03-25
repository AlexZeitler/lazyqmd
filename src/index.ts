#!/usr/bin/env bun

import pkg from "../package.json";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`lazyqmd v${pkg.version}`);
  process.exit(0);
}

if (process.argv[2] === "self-update") {
  console.log(`Current version: v${pkg.version}`);
  console.log("Checking for updates...");

  try {
    const res = await fetch("https://api.github.com/repos/AlexZeitler/lazyqmd/releases/latest");
    if (!res.ok) {
      console.error(`Failed to check for updates (HTTP ${res.status})`);
      process.exit(1);
    }
    const release = await res.json() as { tag_name: string };
    const latestVersion = release.tag_name.replace(/^v/, "");

    if (latestVersion === pkg.version) {
      console.log(`Already up to date (v${pkg.version})`);
      process.exit(0);
    }

    console.log(`New version available: v${latestVersion}`);
    console.log("Installing...");

    const proc = Bun.spawnSync({
      cmd: ["bun", "update", "-g", "lazyqmd"],
      stdout: "inherit",
      stderr: "inherit",
    });

    if (proc.exitCode !== 0) {
      console.error("Update failed");
      process.exit(proc.exitCode ?? 1);
    }

    console.log(`Updated lazyqmd v${pkg.version} -> v${latestVersion}`);
  } catch (err) {
    console.error(`Update failed: ${err}`);
    process.exit(1);
  }
  process.exit(0);
}

import { createCliRenderer } from "@opentui/core";
import { loadConfig } from "./config.ts";
import { loadTheme } from "./theme.ts";
import { QmdMcpClient } from "./mcp-client.ts";
import { App } from "./app.ts";
import { detectLocalIndex } from "./local-index.ts";

const config = await loadConfig();
const theme = loadTheme(config.theme);
await detectLocalIndex();

const mcp = new QmdMcpClient(config.mcpPort);

let renderer: Awaited<ReturnType<typeof createCliRenderer>> | null = null;

try {
  await mcp.connect();

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  const app = new App(renderer, mcp, theme);
  await app.start();
} catch (err) {
  if (renderer) {
    renderer.destroy();
  }
  console.error("Failed to start lazyqmd:", err);
  await mcp.disconnect();
  process.exit(1);
}
