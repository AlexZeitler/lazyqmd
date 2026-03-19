export type StatusCollection = {
  name: string;
  path: string;
  pattern: string;
  documents: number;
  lastUpdated: string;
};

export type StatusResult = {
  totalDocuments: number;
  needsEmbedding: number;
  hasVectorIndex: boolean;
  collections: StatusCollection[];
};

export type SearchResult = {
  docid: string;
  file: string;
  title: string;
  score: number;
  context: string | null;
  snippet: string;
  explain?: Record<string, unknown>;
};

export type SearchOptions = {
  limit?: number;
  collection?: string;
  minScore?: number;
  full?: boolean;
  explain?: boolean;
  candidateLimit?: number;
  all?: boolean;
};

export type ContextEntry = {
  uri: string;
  text: string;
};

export type CollectionDetail = {
  name: string;
  path: string;
  pattern: string;
  include: string;
};

async function run(args: string[]): Promise<string> {
  // Use temp file for stdout to avoid pipe buffer truncation with large outputs
  const { openSync, closeSync } = await import("node:fs");
  const { unlink } = await import("node:fs/promises");
  const tmpFile = `/tmp/lazyqmd-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const fd = openSync(tmpFile, "w");

  try {
    const proc = Bun.spawn(["qmd", ...args], {
      stdout: fd,
      stderr: "pipe",
    });
    const errText = await new Response(proc.stderr).text();
    const code = await proc.exited;
    closeSync(fd);

    const text = await Bun.file(tmpFile).text();
    if (code !== 0) {
      throw new Error(`qmd ${args.join(" ")} failed (${code}): ${errText}`);
    }
    return text;
  } finally {
    try { await unlink(tmpFile); } catch {}
  }
}

function parseStatus(output: string): StatusResult {
  const totalMatch = output.match(/Total:\s+(\d+)/);
  const vectorsMatch = output.match(/Vectors:\s+(\d+)/);
  const pendingMatch = output.match(/Pending:\s+(\d+)/);

  const collections: StatusCollection[] = [];
  const collBlocks = output.split(/\n(?=  \S+\s+\(qmd:\/\/)/);
  for (const block of collBlocks) {
    const headerMatch = block.match(/^\s+(\S+)\s+\(qmd:\/\/(\S+?)\/?\)/);
    if (!headerMatch) continue;
    const name = headerMatch[1]!;
    const patternMatch = block.match(/Pattern:\s+(.+)/);
    const filesMatch = block.match(/Files:\s+(\d+)\s+\(updated\s+(.+?)\)/);

    collections.push({
      name,
      path: name,
      pattern: patternMatch?.[1]?.trim() ?? "**/*.md",
      documents: parseInt(filesMatch?.[1] ?? "0", 10),
      lastUpdated: filesMatch?.[2]?.trim() ?? "unknown",
    });
  }

  return {
    totalDocuments: parseInt(totalMatch?.[1] ?? "0", 10),
    needsEmbedding: parseInt(pendingMatch?.[1] ?? "0", 10),
    hasVectorIndex: parseInt(vectorsMatch?.[1] ?? "0", 10) > 0,
    collections,
  };
}

function parseSearchOutput(output: string): SearchResult[] {
  const trimmed = output.trim();
  if (!trimmed || !trimmed.startsWith("[")) return [];
  try {
    return JSON.parse(trimmed) as SearchResult[];
  } catch {
    // Try to find the JSON array in the output (qmd may prepend status text)
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as SearchResult[];
    }
    return [];
  }
}

function buildSearchArgs(
  command: string,
  query: string,
  opts?: SearchOptions,
): string[] {
  const args = [command, query, "--json"];
  if (opts?.all) {
    args.push("--all");
  } else {
    args.push("-n", String(opts?.limit ?? 20));
  }
  if (opts?.collection) args.push("-c", opts.collection);
  if (opts?.minScore != null) args.push("--min-score", String(opts.minScore));
  if (opts?.full) args.push("--full");
  if (opts?.explain) args.push("--explain");
  if (opts?.candidateLimit != null)
    args.push("-C", String(opts.candidateLimit));
  return args;
}

export class QmdMcpClient {
  constructor(private _port: number) {}

  async connect(): Promise<void> {
    const proc = Bun.spawn(["qmd", "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  }

  async disconnect(): Promise<void> {}

  async status(): Promise<StatusResult> {
    const output = await run(["status"]);
    return parseStatus(output);
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    const args = buildSearchArgs("search", query, opts);
    const output = await run(args);
    return parseSearchOutput(output);
  }

  async vectorSearch(
    query: string,
    opts?: SearchOptions,
  ): Promise<SearchResult[]> {
    const args = buildSearchArgs("vsearch", query, opts);
    const output = await run(args);
    return parseSearchOutput(output);
  }

  async deepSearch(
    query: string,
    opts?: SearchOptions,
  ): Promise<SearchResult[]> {
    const args = buildSearchArgs("query", query, opts);
    const output = await run(args);
    return parseSearchOutput(output);
  }

  async multiGet(
    pattern: string,
    opts?: { maxLines?: number; maxBytes?: number },
  ): Promise<string> {
    const args = ["multi-get", pattern];
    if (opts?.maxLines) args.push("-l", String(opts.maxLines));
    if (opts?.maxBytes) args.push("--max-bytes", String(opts.maxBytes));
    return run(args);
  }

  async getDocument(
    file: string,
    opts?: { maxLines?: number; lineNumbers?: boolean },
  ): Promise<string> {
    const args = ["get", file];
    if (opts?.maxLines) args.push("-l", String(opts.maxLines));
    if (opts?.lineNumbers) args.push("--line-numbers");
    return run(args);
  }

  async contextList(): Promise<string> {
    return run(["context", "list"]);
  }

  async contextAdd(uri: string, text: string): Promise<void> {
    await run(["context", "add", uri, text]);
  }

  async contextRemove(uri: string): Promise<void> {
    await run(["context", "rm", uri]);
  }

  async collectionShow(name: string): Promise<CollectionDetail> {
    const output = await run(["collection", "show", name]);
    const path = output.match(/Path:\s+(.+)/)?.[1]?.trim() ?? "";
    const pattern = output.match(/Pattern:\s+(.+)/)?.[1]?.trim() ?? "**/*.md";
    const include = output.match(/Include:\s+(.+)/)?.[1]?.trim() ?? "yes";
    return { name, path, pattern, include };
  }

  async cleanup(): Promise<string> {
    return run(["cleanup"]);
  }
}
