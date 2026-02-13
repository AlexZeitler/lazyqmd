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
  ) {
    this.syntaxStyle = SyntaxStyle.fromStyles({
      default: { fg: parseColor("#eeeeee") },
      "markup.heading": { fg: parseColor("#9d7cd8"), bold: true },
      "markup.heading.1": { fg: parseColor("#9d7cd8"), bold: true },
      "markup.heading.2": { fg: parseColor("#9d7cd8"), bold: true },
      "markup.heading.3": { fg: parseColor("#9d7cd8"), bold: true },
      "markup.heading.4": { fg: parseColor("#9d7cd8"), bold: true },
      "markup.strong": { fg: parseColor("#f5a742"), bold: true },
      "markup.italic": { fg: parseColor("#e5c07b"), italic: true },
      "markup.raw": { fg: parseColor("#7fd88f") },
      "markup.strikethrough": { dim: true },
      "markup.link.label": { fg: parseColor("#56b6c2"), underline: true },
      "markup.link.url": { fg: parseColor("#fab283") },
      "markup.link": { fg: parseColor("#808080") },
      "markup.list": { fg: parseColor("#fab283") },
      "punctuation.special": { fg: parseColor("#808080") },
      conceal: { fg: parseColor("#808080") },
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
    this.headerText.content = t`${bold(fg("#fab283")(title))} ${fg("#808080")(`(${file})`)}`;
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
            this.headerText.content = t`${bold(fg("#fab283")(fm.title))} ${fg("#808080")(`(${file})`)}`;
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
