import { join, dirname, basename } from "node:path";
import { readdir } from "node:fs/promises";
import YAML from "yaml";

export type Collection = {
  name: string;
  uri: string;
  path: string;
  pattern: string;
  files: number;
  updated: string;
};

type QmdConfig = {
  collections: Record<string, { path: string; pattern: string }>;
};

async function run(args: string[]): Promise<string> {
  const proc = Bun.spawn(["qmd", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, errText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(errText.trim() || `qmd exited with code ${exitCode}`);
  }
  return text;
}

async function loadQmdConfig(): Promise<QmdConfig> {
  const configDir =
    process.env.XDG_CONFIG_HOME || join(process.env.HOME!, ".config");
  const configPath = join(configDir, "qmd", "index.yml");
  try {
    const file = Bun.file(configPath);
    const content = await file.text();
    return YAML.parse(content) as QmdConfig;
  } catch {
    return { collections: {} };
  }
}

export async function listCollections(): Promise<Collection[]> {
  const [output, config] = await Promise.all([
    run(["collection", "list"]),
    loadQmdConfig(),
  ]);
  const collections: Collection[] = [];
  const blocks = output.split(/\n(?=\S)/);

  for (const block of blocks) {
    const headerMatch = block.match(/^(\S+)\s+\(qmd:\/\/(\S+?)\/?\)/);
    if (!headerMatch) continue;

    const name = headerMatch[1]!;
    const uri = `qmd://${headerMatch[2]!}/`;
    const patternMatch = block.match(/Pattern:\s+(.+)/);
    const filesMatch = block.match(/Files:\s+(\d+)/);
    const updatedMatch = block.match(/Updated:\s+(.+)/);
    const collConfig = config.collections[name];

    collections.push({
      name,
      uri,
      path: collConfig?.path ?? "",
      pattern: patternMatch?.[1]?.trim() ?? "**/*.md",
      files: parseInt(filesMatch?.[1] ?? "0", 10),
      updated: updatedMatch?.[1]?.trim() ?? "unknown",
    });
  }

  return collections;
}

export async function resolveQmdUri(
  uri: string,
  collections: Collection[],
): Promise<string | null> {
  // qmd://collectionName/relative/path.md → /absolute/path.md
  const match = uri.match(/^qmd:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const collName = match[1]!;
  const relativePath = match[2]!;
  const col = collections.find((c) => c.name === collName);
  if (!col || !col.path) return null;

  const candidate = join(col.path, relativePath);

  // Check if exact path exists
  if (await Bun.file(candidate).exists()) return candidate;

  // qmd stores lowercase paths — resolve case-insensitively
  return resolveCaseInsensitive(col.path, relativePath);
}

async function resolveCaseInsensitive(
  basePath: string,
  relativePath: string,
): Promise<string | null> {
  const parts = relativePath.split("/");
  let current = basePath;

  for (const part of parts) {
    try {
      const entries = await readdir(current);
      const found = entries.find(
        (e) => e.toLowerCase() === part.toLowerCase(),
      );
      if (!found) return null;
      current = join(current, found);
    } catch {
      return null;
    }
  }

  return current;
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(process.env.HOME!, p.slice(1));
  }
  return p;
}

export async function addCollection(
  path: string,
  name: string,
  mask?: string,
): Promise<void> {
  const resolved = expandHome(path);
  const args = ["collection", "add", resolved, "--name", name];
  if (mask) args.push("--mask", mask);
  await run(args);
}

export async function removeCollection(name: string): Promise<void> {
  await run(["collection", "remove", name]);
}

export async function renameCollection(
  oldName: string,
  newName: string,
): Promise<void> {
  await run(["collection", "rename", oldName, newName]);
}

export async function listFiles(collection: string): Promise<string[]> {
  const output = await run(["ls", collection]);
  return output.split("\n").filter(Boolean);
}

export async function embed(): Promise<void> {
  await run(["embed"]);
}
