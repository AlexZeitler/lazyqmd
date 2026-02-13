import {
  BoxRenderable,
  TextRenderable,
  type RenderContext,
  t,
  bold,
  fg,
} from "@opentui/core";
import type { Collection } from "../qmd-cli.ts";

export class DetailView {
  readonly container: BoxRenderable;
  private titleText: TextRenderable;
  private patternText: TextRenderable;
  private filesText: TextRenderable;
  private updatedText: TextRenderable;
  private statusText: TextRenderable;

  constructor(private ctx: RenderContext) {
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
    this.titleText.content = t`${bold(fg("#fab283")(collection.name))} ${fg("#808080")(`(${collection.uri})`)}`;
    this.patternText.content = t`${fg("#808080")("Pattern:")}  ${collection.pattern}`;
    this.filesText.content = t`${fg("#808080")("Files:")}    ${String(collection.files)}`;
    this.updatedText.content = t`${fg("#808080")("Updated:")}  ${collection.updated}`;
  }

  showAll(collections: Collection[]): void {
    const totalFiles = collections.reduce((sum, c) => sum + c.files, 0);
    this.titleText.content = t`${bold(fg("#fab283")("All Collections"))}`;
    this.patternText.content = t`${fg("#808080")("Collections:")}  ${String(collections.length)}`;
    this.filesText.content = t`${fg("#808080")("Total files:")}  ${String(totalFiles)}`;
    this.updatedText.content = "";
  }

  showStatus(message: string, error = false): void {
    this.statusText.content = error
      ? t`${fg("#e06c75")(message)}`
      : t`${fg("#808080")(message)}`;
  }

  clear(): void {
    this.titleText.content = "";
    this.patternText.content = "";
    this.filesText.content = "";
    this.updatedText.content = "";
    this.statusText.content = "";
  }
}
