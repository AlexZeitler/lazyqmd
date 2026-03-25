import { join } from "node:path";

let _env: Record<string, string> | undefined;

export async function detectLocalIndex(): Promise<boolean> {
  const localQmdDir = join(process.cwd(), ".qmd");
  const hasLocal = await Bun.file(join(localQmdDir, "index.yml")).exists();

  if (hasLocal) {
    _env = {
      QMD_CONFIG_DIR: localQmdDir,
      INDEX_PATH: join(localQmdDir, "index.sqlite"),
    };
    process.stderr.write(`\x1b[2mUsing local qmd index: ${localQmdDir}\x1b[0m\n`);
  }

  return hasLocal;
}

export function spawnEnv(): Record<string, string> {
  return { ...process.env as Record<string, string>, ..._env };
}

export function localConfigDir(): string | undefined {
  return _env?.QMD_CONFIG_DIR;
}
