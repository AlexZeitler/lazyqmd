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
import { listFiles, type FileEntry } from "../qmd-cli.ts";

export type FileOpenHandler = (file: string, title: string) => void;

function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export class FilesView {
  readonly container: BoxRenderable;
  readonly input: InputRenderable;
  readonly filesList: SelectRenderable;
  private statusText: TextRenderable;
  private onFileOpen: FileOpenHandler | null = null;
  private collectionName = "";
  private allFiles: FileEntry[] = [];

  constructor(private ctx: RenderContext) {
    this.container = new BoxRenderable(ctx, {
      id: "files-container",
      flexDirection: "column",
      flexGrow: 1,
    });

    const inputRow = new BoxRenderable(ctx, {
      id: "files-input-row",
      flexDirection: "row",
      padding: 1,
      gap: 1,
    });

    const label = new TextRenderable(ctx, {
      id: "files-label",
      content: t`${bold(fg("#fab283")("Filter:"))}`,
    });

    this.input = new InputRenderable(ctx, {
      id: "files-filter",
      width: 40,
      placeholder: "Type to filter...",
    });

    inputRow.add(label);
    inputRow.add(this.input);
    this.container.add(inputRow);

    this.statusText = new TextRenderable(ctx, {
      id: "files-status",
      content: "",
      paddingLeft: 1,
    });
    this.container.add(this.statusText);

    this.filesList = new SelectRenderable(ctx, {
      id: "files-list",
      flexGrow: 1,
      options: [],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      selectedBackgroundColor: "#264f78",
      selectedTextColor: "#ffffff",
      selectedDescriptionColor: "#a0c4e8",
    });
    this.container.add(this.filesList);

    this.input.on(InputRenderableEvents.INPUT, () => {
      this.applyFilter();
    });

    this.filesList.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        if (this.onFileOpen && option.value) {
          const title = option.name.split("/").pop() ?? option.name;
          this.onFileOpen(option.value, title);
        }
      },
    );
  }

  setOnFileOpen(handler: FileOpenHandler): void {
    this.onFileOpen = handler;
  }

  async load(collectionName: string): Promise<void> {
    this.collectionName = collectionName;
    this.input.value = "";
    this.statusText.content = t`${fg("#808080")("Loading files...")}`;
    this.filesList.options = [];
    this.allFiles = [];

    try {
      this.allFiles = await listFiles(collectionName);

      if (this.allFiles.length === 0) {
        this.statusText.content = t`${fg("#f5a742")("No files found.")}`;
        return;
      }

      this.applyFilter();
    } catch (err) {
      this.statusText.content = t`${fg("#e06c75")(`Error: ${err}`)}`;
    }
  }

  private applyFilter(): void {
    const query = this.input.value.trim();
    const filtered = query
      ? this.allFiles.filter((f) => fuzzyMatch(query, f.path))
      : this.allFiles;

    this.statusText.content = query
      ? t`${fg("#7fd88f")(`${filtered.length}/${this.allFiles.length} files`)}`
      : t`${fg("#7fd88f")(`${this.allFiles.length} files`)}`;

    this.filesList.options = filtered.map((f) => ({
      name: f.path,
      description: `${f.size}  ${f.date}`,
      value: f.uri,
    }));
  }

  focusInput(): void {
    this.input.focus();
  }

  focusList(): void {
    this.filesList.focus();
  }

  clear(): void {
    this.filesList.options = [];
    this.statusText.content = "";
    this.collectionName = "";
    this.allFiles = [];
    this.input.value = "";
  }
}
