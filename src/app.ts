import { watch, type FSWatcher } from "node:fs";
import { join, dirname, basename } from "node:path";
import { marked } from "marked";
import YAML from "yaml";
import {
  type CliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderableEvents,
  type KeyEvent,
  type StyledText,
  t,
  bold,
  dim,
  fg,
} from "@opentui/core";
import type { QmdMcpClient } from "./mcp-client.ts";
import {
  listCollections,
  addCollection,
  removeCollection,
  renameCollection,
  embed,
  resolveQmdUri,
  type Collection,
} from "./qmd-cli.ts";
import { CollectionsView } from "./views/collections.ts";
import { DetailView } from "./views/detail.ts";
import { SearchView } from "./views/search.ts";
import { DocumentView } from "./views/document.ts";
import { AddCollectionView } from "./views/add-collection.ts";
import { RenameCollectionView } from "./views/rename-collection.ts";
import { ConfirmDeleteView } from "./views/confirm-delete.ts";

type AppState =
  | "collections"
  | "detail"
  | "search"
  | "document"
  | "add-collection"
  | "rename-collection"
  | "delete-collection";
type FocusArea = "sidebar" | "main";

export class App {
  private root: BoxRenderable;
  private body: BoxRenderable;
  private sidebar: BoxRenderable;
  private mainPanel: BoxRenderable;
  private footer: BoxRenderable;
  private footerText: TextRenderable;
  private versionText: TextRenderable;

  private collectionsView: CollectionsView;
  private detailView: DetailView;
  private searchView: SearchView;
  private documentView: DocumentView;
  private addCollectionView: AddCollectionView;
  private renameCollectionView: RenameCollectionView;
  private confirmDeleteView: ConfirmDeleteView;

  private state: AppState = "collections";
  private previousState: AppState = "detail";
  private focusArea: FocusArea = "sidebar";
  private collections: Collection[] = [];

  private previewServer: ReturnType<typeof Bun.serve> | null = null;
  private previewWatcher: FSWatcher | null = null;
  private previewVersion = 0;
  private previewFilePath: string | null = null;
  private previewBaseDir: string | null = null;

  constructor(
    private renderer: CliRenderer,
    private mcp: QmdMcpClient,
  ) {
    // Root container
    this.root = new BoxRenderable(renderer, {
      id: "root",
      flexDirection: "column",
      width: "100%" as any,
      height: "100%" as any,
    });
    renderer.root.add(this.root);

    // Body (row: sidebar + main)
    this.body = new BoxRenderable(renderer, {
      id: "body",
      flexDirection: "row",
      flexGrow: 1,
      width: "100%" as any,
    });
    this.root.add(this.body);

    // Sidebar
    this.sidebar = new BoxRenderable(renderer, {
      id: "sidebar",
      width: 30,
      border: true,
      borderStyle: "rounded",
      focusedBorderColor: "#606060",
      title: "Collections",
      titleAlignment: "left",
      flexDirection: "column",
    });
    this.body.add(this.sidebar);

    // Main panel
    this.mainPanel = new BoxRenderable(renderer, {
      id: "main-panel",
      flexGrow: 1,
      border: true,
      borderStyle: "rounded",
      focusedBorderColor: "#606060",
      title: "Collection",
      titleAlignment: "left",
      flexDirection: "column",
    });
    this.body.add(this.mainPanel);

    // Footer
    this.footer = new BoxRenderable(renderer, {
      id: "footer",
      height: 3,
      width: "100%" as any,
      border: true,
      borderStyle: "rounded",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 2,
      paddingRight: 2,
      flexDirection: "row",
    });
    this.footerText = new TextRenderable(renderer, {
      id: "footer-text",
      content: this.getFooterHelp(),
    });
    this.versionText = new TextRenderable(renderer, {
      id: "version-text",
      content: t`${dim("lazyqmd v0.1.0")}`,
    });
    this.footer.add(this.footerText);
    this.footer.add(this.versionText);
    this.root.add(this.footer);

    // Create views
    this.collectionsView = new CollectionsView(renderer);
    this.detailView = new DetailView(renderer);
    this.searchView = new SearchView(renderer, mcp);
    this.documentView = new DocumentView(renderer, mcp);
    this.addCollectionView = new AddCollectionView(renderer);
    this.renameCollectionView = new RenameCollectionView(renderer);
    this.confirmDeleteView = new ConfirmDeleteView(renderer);

    // Add collections select to sidebar
    this.sidebar.add(this.collectionsView.select);

    // Add detail view to main panel (initial state)
    this.mainPanel.add(this.detailView.container);

    // Wire up events
    this.collectionsView.setOnSelected((col) => {
      this.showDetail(col);
    });

    this.searchView.setOnDocumentOpen((file, title) => {
      this.showDocument(file, title);
    });

    // Wire up collection management callbacks
    this.addCollectionView.onComplete = async (path, name, pattern) => {
      try {
        this.addCollectionView.showStatus("Indexing...");
        await addCollection(path, name, pattern !== "**/*.md" ? pattern : undefined);
        await this.refreshCollections();
        this.leaveManagement();
      } catch (err) {
        this.addCollectionView.showStatus(`Error: ${err}`, true);
      }
    };
    this.addCollectionView.onCancel = () => this.leaveManagement();

    this.renameCollectionView.onComplete = async (oldName, newName) => {
      try {
        this.renameCollectionView.showStatus("Renaming...");
        await renameCollection(oldName, newName);
        await this.refreshCollections();
        this.leaveManagement();
      } catch (err) {
        this.renameCollectionView.showStatus(`Error: ${err}`, true);
      }
    };
    this.renameCollectionView.onCancel = () => this.leaveManagement();

    this.confirmDeleteView.onConfirm = async (name) => {
      try {
        await removeCollection(name);
        await this.refreshCollections();
        this.leaveManagement();
      } catch (err) {
        // Stay in delete view on error
      }
    };
    this.confirmDeleteView.onCancel = () => this.leaveManagement();

    // Keyboard
    this.setupKeyboard();
  }

  private getFooterHelp(): StyledText {
    if (this.state === "search") {
      const mode = this.searchView.modeLabel;
      const scope = this.searchView.scopeLabel;
      return t`${bold("Esc")}: Back  ${bold("Tab")}: Input/Results  ${bold("Ctrl+T")}: Mode (${mode})  ${bold("Enter")}: Search/Open  ${bold("q")}: Quit  ${fg("#808080")(`[${scope}]`)}`;
    }
    if (this.state === "document") {
      return t`${bold("Esc")}: Back  ${bold("j/k")}: Scroll  ${bold("e")}: Edit  ${bold("p")}: Preview  ${bold("q")}: Quit`;
    }
    if (this.state === "add-collection") {
      return t`${bold("Tab")}: Complete/Next  ${bold("Enter")}: Confirm  ${bold("Esc")}: Cancel`;
    }
    if (this.state === "rename-collection") {
      return t`${bold("Enter")}: Confirm  ${bold("Esc")}: Cancel`;
    }
    if (this.state === "delete-collection") {
      return t`${bold("Enter")}: Confirm  ${bold("Esc")}: Cancel`;
    }
    return t`${bold("Tab")}: Switch  ${bold("/")}: Search  ${bold("a")}: Add  ${bold("d")}: Delete  ${bold("r")}: Rename  ${bold("e")}: Embed  ${bold("Enter")}: Open  ${bold("q")}: Quit`;
  }

  private updateFooter(): void {
    this.footerText.content = this.getFooterHelp();
  }

  private setupKeyboard(): void {
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {

      // Search mode toggle (Ctrl+T) — works regardless of focus
      if (this.state === "search" && key.name === "t" && key.ctrl) {
        this.searchView.cycleMode();
        this.updateFooter();
        key.preventDefault();
        return;
      }



      // When search input is focused, only intercept escape and tab
      if (this.state === "search" && this.searchView.input.focused) {
        if (key.name === "escape") {
          this.leaveSearch();
          key.preventDefault();
          return;
        }
        if (key.name === "tab") {
          this.searchView.focusResults();
          key.preventDefault();
          return;
        }
        // Let input handle everything else
        return;
      }

      // Management views: handle escape and tab, let views handle the rest
      if (
        this.state === "add-collection" ||
        this.state === "rename-collection" ||
        this.state === "delete-collection"
      ) {
        if (key.name === "escape") {
          // If add-collection has completion open, dismiss it first
          if (this.state === "add-collection" && this.addCollectionView.handleEscape()) {
            key.preventDefault();
            return;
          }
          this.leaveManagement();
          key.preventDefault();
          return;
        }
        if (key.name === "tab" && this.state === "add-collection") {
          this.addCollectionView.handleTab();
          key.preventDefault();
          return;
        }
        // Let the view's inputs/selects handle enter, typing, etc.
        return;
      }

      // Document view shortcuts
      if (this.state === "document") {
        if (key.name === "e") {
          this.openInEditor();
          key.preventDefault();
          return;
        }
        if (key.name === "p") {
          this.mainPanel.title = "Preview...";
          this.openPreview();
          key.preventDefault();
          return;
        }
      }

      if (key.name === "q" && !key.ctrl && !key.meta) {
        this.cleanup();
        this.renderer.destroy();
        key.preventDefault();
        return;
      }

      if (key.name === "escape") {
        this.handleEscape();
        key.preventDefault();
        return;
      }

      if (key.name === "tab") {
        this.handleTab();
        key.preventDefault();
        return;
      }

      if (key.name === "/" || key.name === "s") {
        this.enterSearch();
        key.preventDefault();
        return;
      }

      // Collection management shortcuts (only when sidebar focused)
      if (this.focusArea === "sidebar") {
        if (key.name === "a") {
          this.enterAddCollection();
          key.preventDefault();
          return;
        }
        if (key.name === "d") {
          this.enterDeleteCollection();
          key.preventDefault();
          return;
        }
        if (key.name === "r") {
          this.enterRenameCollection();
          key.preventDefault();
          return;
        }
        if (key.name === "e") {
          this.runEmbed();
          key.preventDefault();
          return;
        }
      }
    });
  }

  private handleTab(): void {
    if (this.state === "search") {
      // Toggle between input and results
      if (this.searchView.input.focused) {
        this.searchView.focusResults();
      } else {
        this.searchView.focusInput();
      }
      return;
    }

    // Toggle focus between sidebar and main
    if (this.focusArea === "sidebar") {
      this.focusArea = "main";
      if (this.state === "document") {
        this.documentView.container.focus();
      }
    } else {
      this.focusArea = "sidebar";
      this.collectionsView.select.focus();
    }
  }

  private handleEscape(): void {
    if (this.state === "document") {
      this.leaveDocument();
    } else if (this.state === "search") {
      this.leaveSearch();
    }
  }

  private showDetail(collection: Collection): void {
    this.switchMainView("detail");
    this.detailView.show(collection);
    this.mainPanel.title = "Collection";
  }

  private enterSearch(): void {
    this.switchMainView("search");
    this.state = "search";
    const selectedCol = this.collectionsView.getSelectedCollection();
    this.searchView.setCollection(selectedCol?.name);
    this.searchView.focusInput();
    this.mainPanel.title = "Search";
    this.updateFooter();
  }

  private leaveSearch(): void {
    this.state = "detail";
    this.switchMainView("detail");
    const col = this.collectionsView.getSelectedCollection();
    if (col) {
      this.detailView.show(col);
    }
    this.mainPanel.title = "Collection";
    this.collectionsView.select.focus();
    this.focusArea = "sidebar";
    this.updateFooter();
  }

  private async showDocument(file: string, title: string): Promise<void> {
    this.switchMainView("document");
    this.state = "document";
    this.mainPanel.title = title;
    this.documentView.container.focus();
    this.updateFooter();
    await this.documentView.load(file, title);
    // Update panel title with frontmatter title if available
    const fmTitle = this.documentView.getCurrentTitle();
    if (fmTitle && fmTitle !== title) {
      this.mainPanel.title = fmTitle;
    }
  }

  private leaveDocument(): void {
    this.stopPreview();
    if (this.previousState === "search") {
      this.switchMainView("search");
      this.state = "search";
      this.mainPanel.title = "Search";
      this.searchView.focusResults();
    } else {
      this.switchMainView("detail");
      this.state = "detail";
      this.mainPanel.title = "Collection";
      this.collectionsView.select.focus();
      this.focusArea = "sidebar";
    }
    this.updateFooter();
  }

  private enterAddCollection(): void {
    this.addCollectionView.reset();
    this.switchMainView("add-collection");
    this.addCollectionView.focusFirst();
    this.updateFooter();
  }

  private enterRenameCollection(): void {
    const col = this.collectionsView.getSelectedCollection();
    if (!col) return;
    this.renameCollectionView.reset();
    this.renameCollectionView.show(col);
    this.switchMainView("rename-collection");
    this.renameCollectionView.focusInput();
    this.updateFooter();
  }

  private enterDeleteCollection(): void {
    const col = this.collectionsView.getSelectedCollection();
    if (!col) return;
    this.confirmDeleteView.show(col);
    this.switchMainView("delete-collection");
    this.confirmDeleteView.focusSelect();
    this.updateFooter();
  }

  private leaveManagement(): void {
    this.switchMainView("detail");
    this.state = "detail";
    const col = this.collectionsView.getSelectedCollection();
    if (col) {
      this.detailView.show(col);
    }
    this.mainPanel.title = "Collection";
    this.collectionsView.select.focus();
    this.focusArea = "sidebar";
    this.updateFooter();
  }

  private async openInEditor(): Promise<void> {
    const qmdUri = this.documentView.getCurrentFile();
    if (!qmdUri) return;

    const filePath = await resolveQmdUri(qmdUri, this.collections);
    if (!filePath) {
      // Fallback: try as direct path
      if (!qmdUri.startsWith("qmd://")) {
        return this.spawnEditor(qmdUri);
      }
      return;
    }

    await this.spawnEditor(filePath);
  }

  private async spawnEditor(filePath: string): Promise<void> {
    const editor = process.env.EDITOR || "vi";
    this.renderer.suspend();
    try {
      const proc = Bun.spawn([editor, filePath], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    } finally {
      this.renderer.resume();
    }
  }

  private async openPreview(): Promise<void> {
    try {
      const qmdUri = this.documentView.getCurrentFile();
      if (!qmdUri) {
        this.mainPanel.title = "Preview: no file";
        return;
      }

      const filePath = await resolveQmdUri(qmdUri, this.collections);
      if (!filePath) {
        this.mainPanel.title = "Preview: file not found";
        return;
      }

      // Stop any existing watcher (but keep server running)
      if (this.previewWatcher) {
        this.previewWatcher.close();
        this.previewWatcher = null;
      }

      // Set current preview target
      this.previewFilePath = filePath;
      this.previewBaseDir = dirname(filePath);

      // Ensure server is running (lazy start)
      const port = this.ensurePreviewServer();

      // Watch directory (not file) for changes — survives neovim's
      // write-to-temp-then-rename save strategy
      const watchedName = basename(filePath);
      let debounce: ReturnType<typeof setTimeout> | null = null;
      this.previewWatcher = watch(dirname(filePath), (_event, filename) => {
        if (filename && filename !== watchedName) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.previewVersion++;
        }, 100);
      });

      // Open Chrome in app mode
      Bun.spawn(["google-chrome", `--app=http://localhost:${port}`], {
        stdout: "ignore",
        stderr: "ignore",
      });

      this.mainPanel.title = this.documentView.getCurrentTitle() ?? "Preview";
    } catch (err) {
      this.mainPanel.title = `Preview error: ${err}`;
    }
  }

  private ensurePreviewServer(): number {
    if (this.previewServer) return this.previewServer.port!;

    const self = this;
    this.previewServer = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);

        // Version endpoint for polling-based live reload
        if (url.pathname === "/version") {
          return new Response(String(self.previewVersion), {
            headers: { "Cache-Control": "no-cache" },
          });
        }

        // Serve rendered markdown
        if (url.pathname === "/") {
          if (!self.previewFilePath) {
            return new Response("No file selected", { status: 404 });
          }
          try {
            const content = await Bun.file(self.previewFilePath).text();
            const html = buildPreviewHtml(content, self.previewFilePath);
            return new Response(html, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          } catch (err) {
            return new Response(`Error: ${err}`, { status: 500 });
          }
        }

        // Serve static files (images etc.) from source directory
        if (self.previewBaseDir) {
          const reqPath = decodeURIComponent(url.pathname);
          const filePath = join(self.previewBaseDir, reqPath);
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(file);
          }
        }

        return new Response("Not found", { status: 404 });
      },
    });

    return this.previewServer.port!;
  }

  private stopPreview(): void {
    if (this.previewWatcher) {
      this.previewWatcher.close();
      this.previewWatcher = null;
    }
  }

  private cleanup(): void {
    this.stopPreview();
    if (this.previewServer) {
      this.previewServer.stop();
      this.previewServer = null;
    }
  }

  private async runEmbed(): Promise<void> {
    const prevTitle = this.mainPanel.title;
    this.mainPanel.title = "Embedding...";
    this.detailView.showStatus("Creating embeddings, this may take a while...");
    try {
      await embed();
      this.detailView.showStatus("Embeddings created.");
    } catch (err) {
      this.detailView.showStatus(`Error: ${err}`, true);
    }
    this.mainPanel.title = prevTitle;
  }

  private async refreshCollections(): Promise<void> {
    this.collections = await listCollections();
    this.collectionsView.update(this.collections);
  }

  private switchMainView(target: AppState): void {
    // Remove current main content
    const children = this.mainPanel.getChildren();
    for (const child of children) {
      this.mainPanel.remove(child.id);
    }

    // Track where we came from
    if (target !== this.state) {
      this.previousState = this.state;
    }

    this.state = target;

    switch (target) {
      case "detail":
      case "collections":
        this.mainPanel.add(this.detailView.container);
        break;
      case "search":
        this.mainPanel.add(this.searchView.container);
        break;
      case "document":
        this.mainPanel.add(this.documentView.container);
        break;
      case "add-collection":
        this.mainPanel.add(this.addCollectionView.container);
        this.mainPanel.title = "Add Collection";
        break;
      case "rename-collection":
        this.mainPanel.add(this.renameCollectionView.container);
        this.mainPanel.title = "Rename Collection";
        break;
      case "delete-collection":
        this.mainPanel.add(this.confirmDeleteView.container);
        this.mainPanel.title = "Delete Collection";
        break;
    }
  }

  async start(): Promise<void> {
    // Load collections
    try {
      this.collections = await listCollections();
      this.collectionsView.update(this.collections);

      // Show "All" summary initially (first item in list)
      this.detailView.showAll(this.collections);
      this.mainPanel.title = "All Collections";
    } catch (err) {
      this.detailView.clear();
    }

    // Focus sidebar
    this.collectionsView.select.focus();
    this.focusArea = "sidebar";

    // Wire up collection selection change to show details
    this.collectionsView.select.on(
      SelectRenderableEvents.SELECTION_CHANGED,
      (_index: number, option: { value?: any }) => {
        if (this.state === "detail" || this.state === "collections") {
          if (option.value === "__all__") {
            this.detailView.showAll(this.collections);
            this.mainPanel.title = "All Collections";
          } else {
            const col = this.collections.find((c) => c.name === option.value);
            if (col) {
              this.detailView.show(col);
              this.mainPanel.title = "Collection";
            }
          }
        }
      },
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewHtml(rawContent: string, filePath: string): string {
  let body = rawContent;
  let title = filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "Preview";
  let frontmatterHtml = "";

  // Extract and render frontmatter
  const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    body = body.slice(fmMatch[0].length);
    try {
      const fm = YAML.parse(fmMatch[1]!) as Record<string, unknown>;
      if (fm.title && typeof fm.title === "string") title = fm.title;
      const entries = Object.entries(fm).filter(([k]) => k !== "title");
      if (entries.length > 0) {
        frontmatterHtml = `<div class="frontmatter"><dl>${entries
          .map(
            ([k, v]) =>
              `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`,
          )
          .join("")}</dl></div>`;
      }
    } catch {}
  }

  const htmlBody = marked.parse(body, { async: false }) as string;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #24292f; }
  h1 { border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  .frontmatter { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem; }
  .frontmatter dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; }
  .frontmatter dt { font-weight: 600; color: #57606a; }
  .frontmatter dd { margin: 0; }
  img { max-width: 100%; }
  pre { background: #f6f8fa; border-radius: 6px; padding: 1rem; overflow-x: auto; }
  code { background: #f6f8fa; border-radius: 3px; padding: 0.2em 0.4em; font-size: 85%; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #d0d7de; margin: 0; padding: 0 1rem; color: #57606a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 0.5rem; text-align: left; }
  th { background: #f6f8fa; }
</style>
</head><body>
<h1>${escapeHtml(title)}</h1>
${frontmatterHtml}
${htmlBody}
<script>
  let lastVersion = '';
  setInterval(async () => {
    try {
      const res = await fetch('/version');
      const v = await res.text();
      if (lastVersion && v !== lastVersion) location.reload();
      lastVersion = v;
    } catch {}
  }, 500);
</script>
</body></html>`;
}
