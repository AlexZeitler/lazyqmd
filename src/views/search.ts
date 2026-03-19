import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type SelectOption,
  type RenderContext,
  t,
  fg,
  bold,
  dim,
} from "@opentui/core";
import type { QmdMcpClient, SearchResult, SearchOptions } from "../mcp-client.ts";
import type { Theme } from "../theme.ts";

export type DocumentOpenHandler = (file: string, title: string) => void;

export type SearchMode = "search" | "vsearch" | "query";

const SEARCH_MODES: { mode: SearchMode; label: string }[] = [
  { mode: "search", label: "Search" },
  { mode: "vsearch", label: "Vector" },
  { mode: "query", label: "Query" },
];

export class SearchView {
  readonly container: BoxRenderable;
  readonly input: InputRenderable;
  readonly resultsList: SelectRenderable;
  private label: TextRenderable;
  private optionsText: TextRenderable;
  private statusText: TextRenderable;
  private results: SearchResult[] = [];
  private onDocumentOpen: DocumentOpenHandler | null = null;
  private modeIndex = 0;

  // Search options
  private optFull = false;
  private optExplain = false;
  private optAll = false;
  private optMinScore: number | null = null;
  private optCandidateLimit: number | null = null;

  private static readonly MIN_SCORE_VALUES = [null, 0.3, 0.5, 0.7, 0.9];
  private minScoreIndex = 0;

  private static readonly CANDIDATE_LIMIT_VALUES = [null, 10, 20, 40, 80, 200];
  private candidateLimitIndex = 0;

  constructor(
    private ctx: RenderContext,
    private mcp: QmdMcpClient,
    private theme: Theme,
  ) {
    this.container = new BoxRenderable(ctx, {
      id: "search-container",
      flexDirection: "column",
      flexGrow: 1,
      gap: 1,
    });

    const inputRow = new BoxRenderable(ctx, {
      id: "search-input-row",
      flexDirection: "row",
      padding: 1,
      gap: 1,
    });

    this.label = new TextRenderable(ctx, {
      id: "search-label",
      content: this.makeLabelContent(),
    });

    this.input = new InputRenderable(ctx, {
      id: "search-input",
      width: 40,
      placeholder: "Enter search query...",
    });

    inputRow.add(this.label);
    inputRow.add(this.input);
    this.container.add(inputRow);

    this.optionsText = new TextRenderable(ctx, {
      id: "search-options",
      content: this.makeOptionsContent(),
      paddingLeft: 1,
    });
    this.container.add(this.optionsText);

    this.statusText = new TextRenderable(ctx, {
      id: "search-status",
      content: "",
      paddingLeft: 1,
    });
    this.container.add(this.statusText);

    this.resultsList = new SelectRenderable(ctx, {
      id: "search-results",
      flexGrow: 1,
      options: [],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,

      selectedBackgroundColor: theme.selection_bg,
      selectedTextColor: theme.selection_fg,
      selectedDescriptionColor: theme.selection_desc,
    });
    this.container.add(this.resultsList);

    this.input.on(InputRenderableEvents.ENTER, async (value: string) => {
      await this.performSearch(value);
    });

    this.resultsList.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        if (this.onDocumentOpen && option.value && option.value !== "__none__") {
          this.onDocumentOpen(option.value, option.name);
        }
      },
    );
  }

  get mode(): SearchMode {
    return SEARCH_MODES[this.modeIndex]!.mode;
  }

  get modeLabel(): string {
    return SEARCH_MODES[this.modeIndex]!.label;
  }

  cycleMode(): void {
    this.modeIndex = (this.modeIndex + 1) % SEARCH_MODES.length;
    this.label.content = this.makeLabelContent();
  }

  toggleFull(): void {
    this.optFull = !this.optFull;
    this.optionsText.content = this.makeOptionsContent();
  }

  toggleExplain(): void {
    this.optExplain = !this.optExplain;
    this.optionsText.content = this.makeOptionsContent();
  }

  toggleAll(): void {
    this.optAll = !this.optAll;
    this.optionsText.content = this.makeOptionsContent();
  }

  cycleMinScore(): void {
    this.minScoreIndex =
      (this.minScoreIndex + 1) % SearchView.MIN_SCORE_VALUES.length;
    this.optMinScore = SearchView.MIN_SCORE_VALUES[this.minScoreIndex]!;
    this.optionsText.content = this.makeOptionsContent();
  }

  cycleCandidateLimit(): void {
    this.candidateLimitIndex =
      (this.candidateLimitIndex + 1) %
      SearchView.CANDIDATE_LIMIT_VALUES.length;
    this.optCandidateLimit =
      SearchView.CANDIDATE_LIMIT_VALUES[this.candidateLimitIndex]!;
    this.optionsText.content = this.makeOptionsContent();
  }

  get optionsLabel(): string {
    const parts: string[] = [];
    if (this.optFull) parts.push("full");
    if (this.optExplain) parts.push("explain");
    if (this.optAll) parts.push("all");
    if (this.optMinScore != null) parts.push(`min:${this.optMinScore}`);
    if (this.optCandidateLimit != null)
      parts.push(`C:${this.optCandidateLimit}`);
    return parts.length > 0 ? parts.join(" ") : "";
  }

  private makeOptionsContent() {
    const on = (label: string, active: boolean) =>
      active
        ? bold(fg(this.theme.accent)(label))
        : dim(fg(this.theme.muted)(label));

    const minLabel =
      this.optMinScore != null ? `min:${this.optMinScore}` : "min:off";
    const candLabel =
      this.optCandidateLimit != null
        ? `C:${this.optCandidateLimit}`
        : "C:auto";

    return t`${on("full", this.optFull)}  ${on("explain", this.optExplain)}  ${on("all", this.optAll)}  ${on(minLabel, this.optMinScore != null)}  ${on(candLabel, this.optCandidateLimit != null)}`;
  }

  private makeLabelContent() {
    const m = SEARCH_MODES[this.modeIndex]!;
    const scope = this.selectedCollection ?? "All";
    return t`${bold(fg(this.theme.accent)(`${m.label}`))} ${fg(this.theme.muted)(`[${scope}]`)}${bold(fg(this.theme.accent)(":"))}`;
  }

  setOnDocumentOpen(handler: DocumentOpenHandler): void {
    this.onDocumentOpen = handler;
  }

  private selectedCollection: string | undefined;

  setCollection(name: string | undefined): void {
    this.selectedCollection = name;
    this.label.content = this.makeLabelContent();
  }

  get scopeLabel(): string {
    return this.selectedCollection ?? "All";
  }

  private buildSearchOpts(): SearchOptions {
    const opts: SearchOptions = {
      collection: this.selectedCollection,
    };
    if (this.optAll) {
      opts.all = true;
    }
    if (this.optMinScore != null) opts.minScore = this.optMinScore;
    if (this.optFull) opts.full = true;
    if (this.optExplain) opts.explain = true;
    if (this.optCandidateLimit != null)
      opts.candidateLimit = this.optCandidateLimit;
    return opts;
  }

  async performSearch(query: string): Promise<void> {
    if (!query.trim()) return;

    // Clear previous results immediately
    this.results = [];
    this.resultsList.options = [{ name: "", description: "", value: "__none__" }];

    // Detect structured query (lex:/vec:/hyde:/expand:/intent: prefixes)
    const isStructured = /^(lex|vec|hyde|expand|intent):/.test(query.trim());

    // For structured queries, always use query mode
    const effectiveMode = isStructured ? "query" : this.mode;

    // Check embeddings for modes that need them
    if (effectiveMode === "vsearch" || effectiveMode === "query") {
      const status = await this.mcp.status();
      if (status.needsEmbedding > 0 && !status.hasVectorIndex) {
        this.statusText.content = t`${fg(this.theme.warning)(`No embeddings yet. Run 'qmd embed' first.`)}`;
        return;
      }
    }

    const statusMsg =
      effectiveMode === "query"
        ? isStructured
          ? "Structured query..."
          : "Querying (LLM)..."
        : "Searching...";
    this.statusText.content = t`${fg(this.theme.muted)(statusMsg)}`;

    const opts = this.buildSearchOpts();

    // For structured queries with newlines, replace literal \n with actual newlines
    const effectiveQuery = isStructured
      ? query.replace(/\\n/g, "\n")
      : query;

    try {
      switch (effectiveMode) {
        case "search":
          this.results = await this.mcp.search(effectiveQuery, opts);
          break;
        case "vsearch":
          this.results = await this.mcp.vectorSearch(effectiveQuery, opts);
          break;
        case "query":
          this.results = await this.mcp.deepSearch(effectiveQuery, opts);
          break;
      }

      if (this.results.length === 0) {
        this.resultsList.options = [{ name: "No results", description: "", value: "__none__" }];
        this.statusText.content = t`${fg(this.theme.warning)("No results found.")}`;
        return;
      }

      this.statusText.content = t`${fg(this.theme.success)(`${this.results.length} results`)}`;

      this.resultsList.options = this.results.map((r) => {
        const scorePct = `${Math.round(r.score * 100)}%`;
        let desc = `${scorePct} | ${r.file}`;
        if (this.optExplain && r.explain) {
          const ex = r.explain as any;
          const parts: string[] = [];
          if (ex.rerankScore != null) parts.push(`rerank:${(ex.rerankScore * 100).toFixed(0)}%`);
          if (ex.blendedScore != null) parts.push(`blended:${(ex.blendedScore * 100).toFixed(0)}%`);
          if (ex.rrf?.score != null) parts.push(`rrf:${(ex.rrf.score * 100).toFixed(0)}%`);
          if (parts.length > 0) desc += ` | ${parts.join(" ")}`;
        }
        return {
          name: r.title,
          description: desc,
          value: r.file,
        };
      });
    } catch (err) {
      this.resultsList.options = [{ name: "", description: "", value: "__none__" }];
      this.statusText.content = t`${fg(this.theme.error)(`Error: ${err}`)}`;
    }
  }

  focusInput(): void {
    this.input.focus();
  }

  focusResults(): void {
    this.resultsList.focus();
  }

  clear(): void {
    this.input.value = "";
    this.results = [];
    this.resultsList.options = [{ name: "", description: "", value: "__none__" }];
    this.statusText.content = "";
  }
}
