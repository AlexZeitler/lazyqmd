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
};

async function run(args: string[]): Promise<string> {
  const proc = Bun.spawn(["qmd", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`qmd ${args.join(" ")} failed (${code}): ${stderr}`);
  }
  return text;
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
  return JSON.parse(trimmed) as SearchResult[];
}

export class QmdMcpClient {
  constructor(private _port: number) {}

  async connect(): Promise<void> {
    // Verify qmd is available
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

  async search(
    query: string,
    opts?: { limit?: number; collection?: string },
  ): Promise<SearchResult[]> {
    const args = ["search", query, "--json", "-n", String(opts?.limit ?? 20)];
    if (opts?.collection) args.push("-c", opts.collection);
    const output = await run(args);
    return parseSearchOutput(output);
  }

  async vectorSearch(
    query: string,
    opts?: { limit?: number; collection?: string },
  ): Promise<SearchResult[]> {
    const args = ["vsearch", query, "--json", "-n", String(opts?.limit ?? 20)];
    if (opts?.collection) args.push("-c", opts.collection);
    const output = await run(args);
    return parseSearchOutput(output);
  }

  async deepSearch(
    query: string,
    opts?: { limit?: number; collection?: string },
  ): Promise<SearchResult[]> {
    const args = ["query", query, "--json", "-n", String(opts?.limit ?? 20)];
    if (opts?.collection) args.push("-c", opts.collection);
    const output = await run(args);
    return parseSearchOutput(output);
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
}
