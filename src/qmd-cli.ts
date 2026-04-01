import { join, dirname, basename } from "node:path";
import { readdir } from "node:fs/promises";
import YAML from "yaml";
import { spawnEnv, localConfigDir } from "./local-index.ts";

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
    env: spawnEnv(),
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
  const localDir = localConfigDir();
  const configPath = localDir
    ? join(localDir, "index.yml")
    : join(process.env.XDG_CONFIG_HOME || join(process.env.HOME!, ".config"), "qmd", "index.yml");
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
    const headerMatch = block.match(/^(.+?)\s+\(qmd:\/\/(.+?)\/?\)/);
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

// Normalize a path segment the same way qmd does: lowercase, strip
// non-alphanumeric (except hyphens/dots/spaces), collapse runs of hyphens.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]/g, "-")
    .replace(/[^a-z0-9.\-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveCaseInsensitive(
  basePath: string,
  relativePath: string,
): Promise<string | null> {
  const parts = relativePath.split("/");
  return resolveSegments(basePath, parts, 0);
}

async function resolveSegments(
  current: string,
  parts: string[],
  index: number,
): Promise<string | null> {
  if (index >= parts.length) {
    // All segments resolved — verify the file actually exists
    return (await Bun.file(current).exists()) ? current : null;
  }

  const part = parts[index]!;
  let entries: string[];
  try {
    entries = await readdir(current);
  } catch {
    return null;
  }

  // Collect candidates: exact case-insensitive matches first, then slug matches
  const slug = slugify(part);
  const candidates: string[] = [];
  for (const e of entries) {
    if (e.toLowerCase() === part.toLowerCase()) {
      candidates.unshift(e); // prefer exact case-insensitive matches
    } else if (slugify(e) === slug) {
      candidates.push(e);
    }
  }

  // Try each candidate, backtracking if it leads to a dead end
  for (const candidate of candidates) {
    const result = await resolveSegments(
      join(current, candidate),
      parts,
      index + 1,
    );
    if (result) return result;
  }

  return null;
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

export type FileEntry = {
  size: string;
  date: string;
  uri: string;
  path: string; // relative path within collection (extracted from URI)
};

export async function listFiles(collection: string): Promise<FileEntry[]> {
  const output = await run(["ls", collection]);
  const lines = output.split("\n").filter(Boolean);
  return lines
    .map((line) => {
      // Format: "3.2 KB  Sep 24 15:44  qmd://collection/path/file.md"
      const uriMatch = line.match(/(qmd:\/\/\S+)/);
      if (!uriMatch) return null;
      const uri = uriMatch[1]!;
      // Extract relative path from URI: qmd://collection/path → path
      const relPath = uri.replace(`qmd://${collection}/`, "");
      // Everything before the URI is metadata (size + date)
      const meta = line.slice(0, uriMatch.index!).trim();
      const parts = meta.split(/\s{2,}/);
      return {
        size: parts[0] ?? "",
        date: parts[1] ?? "",
        uri,
        path: relPath,
      };
    })
    .filter((e): e is FileEntry => e !== null);
}

export async function embed(): Promise<void> {
  await run(["embed"]);
}
