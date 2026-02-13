import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type RenderContext,
  t,
  fg,
  bold,
} from "@opentui/core";
import type { Collection } from "../qmd-cli.ts";

export class RenameCollectionView {
  readonly container: BoxRenderable;
  private currentLabel: TextRenderable;
  private currentNameText: TextRenderable;
  private newNameLabel: TextRenderable;
  readonly newNameInput: InputRenderable;
  private statusText: TextRenderable;

  private currentCollection: Collection | null = null;

  onComplete: ((oldName: string, newName: string) => void) | null = null;
  onCancel: (() => void) | null = null;

  constructor(private ctx: RenderContext) {
    this.container = new BoxRenderable(ctx, {
      id: "rename-collection-container",
      flexDirection: "column",
      flexGrow: 1,
      padding: 1,
      gap: 1,
    });

    this.currentLabel = new TextRenderable(ctx, {
      id: "rename-current-label",
      content: t`${fg("#808080")("Current:")}`,
    });

    this.currentNameText = new TextRenderable(ctx, {
      id: "rename-current-name",
      content: "",
    });

    this.newNameLabel = new TextRenderable(ctx, {
      id: "rename-new-label",
      content: t`${bold(fg("#fab283")("New name:"))}`,
    });

    this.newNameInput = new InputRenderable(ctx, {
      id: "rename-new-input",
      width: 50,
      placeholder: "new-collection-name",
    });

    this.statusText = new TextRenderable(ctx, {
      id: "rename-status",
      content: "",
    });

    this.container.add(this.currentLabel);
    this.container.add(this.currentNameText);
    this.container.add(this.newNameLabel);
    this.container.add(this.newNameInput);
    this.container.add(this.statusText);

    this.newNameInput.on(InputRenderableEvents.ENTER, () => {
      this.submit();
    });
  }

  show(collection: Collection): void {
    this.currentCollection = collection;
    this.currentNameText.content = t`  ${bold(collection.name)}`;
    this.newNameInput.value = "";
    this.statusText.content = "";
  }

  focusInput(): void {
    this.newNameInput.focus();
  }

  reset(): void {
    this.currentCollection = null;
    this.currentNameText.content = "";
    this.newNameInput.value = "";
    this.statusText.content = "";
  }

  private submit(): void {
    const newName = this.newNameInput.value.trim();
    if (!newName) {
      this.statusText.content = t`${fg("#e06c75")("Name is required.")}`;
      return;
    }
    if (!this.currentCollection) return;

    this.onComplete?.(this.currentCollection.name, newName);
  }

  showStatus(message: string, error = false): void {
    this.statusText.content = error
      ? t`${fg("#e06c75")(message)}`
      : t`${fg("#808080")(message)}`;
  }
}
