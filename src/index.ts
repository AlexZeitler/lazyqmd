#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core";
import { loadConfig } from "./config.ts";
import { QmdMcpClient } from "./mcp-client.ts";
import { App } from "./app.ts";

const config = await loadConfig();
const mcp = new QmdMcpClient(config.mcpPort);

let renderer: Awaited<ReturnType<typeof createCliRenderer>> | null = null;

try {
  await mcp.connect();

  renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  const app = new App(renderer, mcp);
  await app.start();
} catch (err) {
  if (renderer) {
    renderer.destroy();
  }
  console.error("Failed to start lazyqmd:", err);
  await mcp.disconnect();
  process.exit(1);
}
