import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  t,
  bold,
  fg,
} from "@opentui/core";
import type { Collection } from "../qmd-cli.ts";
import type { Theme } from "../theme.ts";

export class DetailView {
  readonly container: BoxRenderable;
  private titleText: TextRenderable;
  private patternText: TextRenderable;
  private filesText: TextRenderable;
  private updatedText: TextRenderable;
  private statusText: TextRenderable;

  constructor(private ctx: RenderContext, private theme: Theme) {
    this.container = new BoxRenderable(ctx, {
      id: "detail-container",
      flexDirection: "column",
      flexGrow: 1,
      padding: 1,
      gap: 1,
    });

    this.titleText = new TextRenderable(ctx, {
      id: "detail-title",
      content: "",
    });

    this.patternText = new TextRenderable(ctx, {
      id: "detail-pattern",
      content: "",
    });

    this.filesText = new TextRenderable(ctx, {
      id: "detail-files",
      content: "",
    });

    this.updatedText = new TextRenderable(ctx, {
      id: "detail-updated",
      content: "",
    });

    this.statusText = new TextRenderable(ctx, {
      id: "detail-status",
      content: "",
    });

    this.container.add(this.titleText);
    this.container.add(this.patternText);
    this.container.add(this.filesText);
    this.container.add(this.updatedText);
    this.container.add(this.statusText);
  }

  show(collection: Collection): void {
    this.titleText.content = t`${bold(fg(this.theme.title)(collection.name))} ${fg(this.theme.muted)(`(${collection.uri})`)}`;
    this.patternText.content = t`${fg(this.theme.muted)("Pattern:")}  ${collection.pattern}`;
    this.filesText.content = t`${fg(this.theme.muted)("Files:")}    ${String(collection.files)}`;
    this.updatedText.content = t`${fg(this.theme.muted)("Updated:")}  ${collection.updated}`;
  }

  showAll(collections: Collection[]): void {
    const totalFiles = collections.reduce((sum, c) => sum + c.files, 0);
    this.titleText.content = t`${bold(fg(this.theme.title)("All Collections"))}`;
    this.patternText.content = t`${fg(this.theme.muted)("Collections:")}  ${String(collections.length)}`;
    this.filesText.content = t`${fg(this.theme.muted)("Total files:")}  ${String(totalFiles)}`;
    this.updatedText.content = "";
  }

  showStatus(message: string, error = false): void {
    this.statusText.content = error
      ? t`${fg(this.theme.error)(message)}`
      : t`${fg(this.theme.muted)(message)}`;
  }

  clear(): void {
    this.titleText.content = "";
    this.patternText.content = "";
    this.filesText.content = "";
    this.updatedText.content = "";
    this.statusText.content = "";
  }
}
