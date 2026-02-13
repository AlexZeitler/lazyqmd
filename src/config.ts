import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export type Config = {
  mcpPort: number;
};

const DEFAULT_CONFIG: Config = {
  mcpPort: 8181,
};

const CONFIG_DIR = join(homedir(), ".config", "lazyqmd");
const CONFIG_PATH = join(CONFIG_DIR, "options.json");

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH);
  if (await file.exists()) {
    const raw = await file.json();
    return { ...DEFAULT_CONFIG, ...raw };
  }

  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  return DEFAULT_CONFIG;
}
