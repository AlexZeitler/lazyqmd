import {
  SelectRenderable,
  SelectRenderableEvents,
  type SelectOption,
  type RenderContext,
} from "@opentui/core";
import type { Collection } from "../qmd-cli.ts";

export type CollectionSelectedHandler = (collection: Collection) => void;

export class CollectionsView {
  readonly select: SelectRenderable;
  private collections: Collection[] = [];
  private onSelected: CollectionSelectedHandler | null = null;

  constructor(ctx: RenderContext) {
    this.select = new SelectRenderable(ctx, {
      id: "collections-select",
      width: "100%" as any,
      flexGrow: 1,
      options: [],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      selectedBackgroundColor: "#264f78",
      selectedTextColor: "#ffffff",
      selectedDescriptionColor: "#a0c4e8",
    });

    this.select.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        const col = this.collections.find((c) => c.name === option.value);
        if (col && this.onSelected) this.onSelected(col);
      },
    );
  }

  setOnSelected(handler: CollectionSelectedHandler): void {
    this.onSelected = handler;
  }

  getSelectedCollection(): Collection | undefined {
    const opt = this.select.getSelectedOption();
    if (!opt || opt.value === "__all__") return undefined;
    return this.collections.find((c) => c.name === opt.value);
  }

  isAllSelected(): boolean {
    const opt = this.select.getSelectedOption();
    return !opt || opt.value === "__all__";
  }

  update(collections: Collection[]): void {
    this.collections = collections;
    const totalFiles = collections.reduce((sum, c) => sum + c.files, 0);
    this.select.options = [
      {
        name: `All (${totalFiles})`,
        description: `${collections.length} collections`,
        value: "__all__",
      },
      ...collections.map((c) => ({
        name: `${c.name} (${c.files})`,
        description: `Updated: ${c.updated}`,
        value: c.name,
      })),
    ];
  }
}
