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
} from "@opentui/core";
import type { QmdMcpClient, SearchResult } from "../mcp-client.ts";

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
  private statusText: TextRenderable;
  private results: SearchResult[] = [];
  private onDocumentOpen: DocumentOpenHandler | null = null;
  private modeIndex = 0;

  constructor(
    private ctx: RenderContext,
    private mcp: QmdMcpClient,
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

    this.statusText = new TextRenderable(ctx, {
      id: "search-status",
      content: "",
    });
    this.container.add(this.statusText);

    this.resultsList = new SelectRenderable(ctx, {
      id: "search-results",
      flexGrow: 1,
      options: [],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      selectedBackgroundColor: "#264f78",
      selectedTextColor: "#ffffff",
      selectedDescriptionColor: "#a0c4e8",
    });
    this.container.add(this.resultsList);

    this.input.on(InputRenderableEvents.ENTER, async (value: string) => {
      await this.performSearch(value);
    });

    this.resultsList.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        if (this.onDocumentOpen && option.value) {
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

  private makeLabelContent() {
    const m = SEARCH_MODES[this.modeIndex]!;
    const scope = this.selectedCollection ?? "All";
    return t`${bold(fg("#fab283")(`${m.label}`))} ${fg("#808080")(`[${scope}]`)}${bold(fg("#fab283")(":"))}`;
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

  async performSearch(query: string): Promise<void> {
    if (!query.trim()) return;

    // Check embeddings for modes that need them
    if (this.mode === "vsearch" || this.mode === "query") {
      const status = await this.mcp.status();
      if (status.needsEmbedding > 0 && !status.hasVectorIndex) {
        this.statusText.content = t`${fg("#f5a742")(`No embeddings yet. Run 'qmd embed' first.`)}`;
        return;
      }
    }

    const statusMsg =
      this.mode === "query" ? "Querying (LLM)..." : "Searching...";
    this.statusText.content = t`${fg("#808080")(statusMsg)}`;
    this.results = [];
    this.resultsList.options = [{ name: " ", description: "", value: "" }];
    this.resultsList.options = [];

    const opts = { collection: this.selectedCollection };

    try {
      switch (this.mode) {
        case "search":
          this.results = await this.mcp.search(query, opts);
          break;
        case "vsearch":
          this.results = await this.mcp.vectorSearch(query, opts);
          break;
        case "query":
          this.results = await this.mcp.deepSearch(query, opts);
          break;
      }

      if (this.results.length === 0) {
        this.statusText.content = t`${fg("#f5a742")("No results found.")}`;
        return;
      }

      this.statusText.content = t`${fg("#7fd88f")(`${this.results.length} results`)}`;

      this.resultsList.options = this.results.map((r) => ({
        name: `${r.title}`,
        description: `${Math.round(r.score * 100)}% | ${r.file}`,
        value: r.file,
      }));
    } catch (err) {
      this.statusText.content = t`${fg("#e06c75")(`Error: ${err}`)}`;
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
    this.resultsList.options = [{ name: " ", description: "", value: "" }];
    this.resultsList.options = [];
    this.statusText.content = "";
  }
}
