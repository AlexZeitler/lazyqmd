import {
  ScrollBoxRenderable,
  TextRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  parseColor,
  type RenderContext,
  t,
  bold,
  fg,
} from "@opentui/core";
import YAML from "yaml";
import type { QmdMcpClient } from "../mcp-client.ts";
import type { Theme } from "../theme.ts";

export class DocumentView {
  readonly container: ScrollBoxRenderable;
  private contentMarkdown: MarkdownRenderable;
  private headerText: TextRenderable;
  private syntaxStyle: SyntaxStyle;
  private currentFile: string | null = null;
  private currentTitle: string | null = null;
  private currentContent: string | null = null;

  constructor(
    private ctx: RenderContext,
    private mcp: QmdMcpClient,
    private theme: Theme,
  ) {
    this.syntaxStyle = SyntaxStyle.fromStyles({
      default: { fg: parseColor(theme.foreground) },
      "markup.heading": { fg: parseColor(theme.heading), bold: true },
      "markup.heading.1": { fg: parseColor(theme.heading), bold: true },
      "markup.heading.2": { fg: parseColor(theme.heading), bold: true },
      "markup.heading.3": { fg: parseColor(theme.heading), bold: true },
      "markup.heading.4": { fg: parseColor(theme.heading), bold: true },
      "markup.strong": { fg: parseColor(theme.strong), bold: true },
      "markup.italic": { fg: parseColor(theme.italic), italic: true },
      "markup.raw": { fg: parseColor(theme.code) },
      "markup.strikethrough": { dim: true },
      "markup.link.label": { fg: parseColor(theme.link), underline: true },
      "markup.link.url": { fg: parseColor(theme.link_url) },
      "markup.link": { fg: parseColor(theme.muted) },
      "markup.list": { fg: parseColor(theme.list) },
      "punctuation.special": { fg: parseColor(theme.muted) },
      conceal: { fg: parseColor(theme.muted) },
    });

    this.container = new ScrollBoxRenderable(ctx, {
      id: "document-scroll",
      rootOptions: {
        flexGrow: 1,
      },
      contentOptions: {
        flexDirection: "column",
        padding: 1,
      },
      viewportCulling: true,
    });

    this.headerText = new TextRenderable(ctx, {
      id: "document-header",
      content: "",
    });

    this.contentMarkdown = new MarkdownRenderable(ctx, {
      id: "document-content",
      content: "",
      syntaxStyle: this.syntaxStyle,
      conceal: true,
    });

    this.container.add(this.headerText);
    this.container.add(this.contentMarkdown);
  }

  getCurrentFile(): string | null {
    return this.currentFile;
  }

  getCurrentTitle(): string | null {
    return this.currentTitle;
  }

  getCurrentContent(): string | null {
    return this.currentContent;
  }

  async load(file: string, title: string): Promise<void> {
    this.currentFile = file;
    this.currentTitle = title;
    this.currentContent = null;
    this.headerText.content = t`${bold(fg(this.theme.title)(title))} ${fg(this.theme.muted)(`(${file})`)}`;
    this.contentMarkdown.content = "*Loading...*";

    try {
      const text = await this.mcp.getDocument(file, { lineNumbers: false });
      this.currentContent = text;

      // Extract title from frontmatter if available
      const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (fmMatch) {
        try {
          const fm = YAML.parse(fmMatch[1]!) as Record<string, unknown>;
          if (fm.title && typeof fm.title === "string") {
            this.currentTitle = fm.title;
            this.headerText.content = t`${bold(fg(this.theme.title)(fm.title))} ${fg(this.theme.muted)(`(${file})`)}`;
          }
        } catch {}
      }

      this.contentMarkdown.content = text;
      this.container.scrollTo(0);
    } catch (err) {
      this.contentMarkdown.content = `**Error:** ${err}`;
    }
  }

  clear(): void {
    this.currentFile = null;
    this.currentTitle = null;
    this.currentContent = null;
    this.headerText.content = "";
    this.contentMarkdown.content = "";
    this.container.scrollTo(0);
  }
}
