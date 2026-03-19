import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
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
  private pathText: TextRenderable;
  private patternText: TextRenderable;
  private filesText: TextRenderable;
  private updatedText: TextRenderable;
  private contextText: TextRenderable;
  private contextEditLabel: TextRenderable;
  readonly contextInput: InputRenderable;
  private statusText: TextRenderable;

  private _editing = false;
  onContextSave: ((text: string) => void) | null = null;
  onContextCancel: (() => void) | null = null;

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

    this.pathText = new TextRenderable(ctx, {
      id: "detail-path",
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

    this.contextText = new TextRenderable(ctx, {
      id: "detail-context",
      content: "",
    });

    this.contextEditLabel = new TextRenderable(ctx, {
      id: "detail-context-edit-label",
      content: t`${bold(fg(this.theme.accent)("Context:"))} ${fg(this.theme.muted)("(Enter=save, Esc=cancel, empty=delete)")}`,
    });

    this.contextInput = new InputRenderable(ctx, {
      id: "detail-context-input",
      width: 60,
      placeholder: "Enter context description...",
    });

    this.statusText = new TextRenderable(ctx, {
      id: "detail-status",
      content: "",
    });

    this.rebuildLayout();

    this.contextInput.on(InputRenderableEvents.ENTER, (value: string) => {
      this.onContextSave?.(value.trim());
    });
  }

  private rebuildLayout(): void {
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id);
    }

    this.container.add(this.titleText);
    this.container.add(this.pathText);
    this.container.add(this.patternText);
    this.container.add(this.filesText);
    this.container.add(this.updatedText);

    if (this._editing) {
      this.container.add(this.contextEditLabel);
      this.container.add(this.contextInput);
    } else {
      this.container.add(this.contextText);
    }

    this.container.add(this.statusText);
  }

  get editing(): boolean {
    return this._editing;
  }

  startEditContext(currentText: string): void {
    this._editing = true;
    this.contextInput.value = currentText;
    this.statusText.content = "";
    this.rebuildLayout();
    this.contextInput.focus();
  }

  stopEditContext(): void {
    this._editing = false;
    this.rebuildLayout();
  }

  show(collection: Collection): void {
    this.titleText.content = t`${bold(fg(this.theme.title)(collection.name))} ${fg(this.theme.muted)(`(${collection.uri})`)}`;
    this.pathText.content = t`${fg(this.theme.muted)("Path:")}     ${collection.path}`;
    this.patternText.content = t`${fg(this.theme.muted)("Pattern:")}  ${collection.pattern}`;
    this.filesText.content = t`${fg(this.theme.muted)("Files:")}    ${String(collection.files)}`;
    this.updatedText.content = t`${fg(this.theme.muted)("Updated:")}  ${collection.updated}`;
    this.contextText.content = "";
    this.statusText.content = "";
  }

  showContext(text: string | null): void {
    if (text && text.trim()) {
      this.contextText.content = t`${fg(this.theme.muted)("Context:")}  ${text.trim()}`;
    } else {
      this.contextText.content = t`${fg(this.theme.muted)("Context:")}  ${fg(this.theme.muted)("none (x to add)")}`;
    }
  }

  showAll(collections: Collection[]): void {
    const totalFiles = collections.reduce((sum, c) => sum + c.files, 0);
    this.titleText.content = t`${bold(fg(this.theme.title)("All Collections"))}`;
    this.pathText.content = "";
    this.patternText.content = t`${fg(this.theme.muted)("Collections:")}  ${String(collections.length)}`;
    this.filesText.content = t`${fg(this.theme.muted)("Total files:")}  ${String(totalFiles)}`;
    this.updatedText.content = "";
    this.contextText.content = "";
    if (this._editing) {
      this._editing = false;
      this.rebuildLayout();
    }
  }

  showStatus(message: string, error = false): void {
    this.statusText.content = error
      ? t`${fg(this.theme.error)(message)}`
      : t`${fg(this.theme.muted)(message)}`;
  }

  clear(): void {
    this.titleText.content = "";
    this.pathText.content = "";
    this.patternText.content = "";
    this.filesText.content = "";
    this.updatedText.content = "";
    this.contextText.content = "";
    this.statusText.content = "";
    if (this._editing) {
      this._editing = false;
      this.rebuildLayout();
    }
  }
}
