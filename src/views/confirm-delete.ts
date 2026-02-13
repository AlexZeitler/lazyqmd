import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type SelectOption,
  type RenderContext,
  t,
  fg,
  bold,
} from "@opentui/core";
import type { Collection } from "../qmd-cli.ts";

export class ConfirmDeleteView {
  readonly container: BoxRenderable;
  private messageText: TextRenderable;
  readonly select: SelectRenderable;

  private currentCollection: Collection | null = null;

  onConfirm: ((name: string) => void) | null = null;
  onCancel: (() => void) | null = null;

  constructor(private ctx: RenderContext) {
    this.container = new BoxRenderable(ctx, {
      id: "confirm-delete-container",
      flexDirection: "column",
      flexGrow: 1,
      padding: 1,
      gap: 1,
    });

    this.messageText = new TextRenderable(ctx, {
      id: "confirm-delete-message",
      content: "",
    });

    this.select = new SelectRenderable(ctx, {
      id: "confirm-delete-select",
      options: [
        { name: "Yes, delete", description: "", value: "yes" },
        { name: "Cancel", description: "", value: "cancel" },
      ],
      flexGrow: 1,
      selectedBackgroundColor: "#1e1e1e",
      selectedTextColor: "#e06c75",
      wrapSelection: true,
    });

    this.container.add(this.messageText);
    this.container.add(this.select);

    this.select.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        if (option.value === "yes" && this.currentCollection) {
          this.onConfirm?.(this.currentCollection.name);
        } else {
          this.onCancel?.();
        }
      },
    );
  }

  show(collection: Collection): void {
    this.currentCollection = collection;
    this.messageText.content = t`Delete collection ${bold(fg("#e06c75")(`"${collection.name}"`))}?`;
  }

  focusSelect(): void {
    this.select.focus();
  }

  reset(): void {
    this.currentCollection = null;
    this.messageText.content = "";
  }
}
