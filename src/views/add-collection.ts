import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
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

export class AddCollectionView {
  readonly container: BoxRenderable;
  private pathLabel: TextRenderable;
  readonly pathInput: InputRenderable;
  private completionSelect: SelectRenderable;
  private nameLabel: TextRenderable;
  readonly nameInput: InputRenderable;
  private patternLabel: TextRenderable;
  readonly patternInput: InputRenderable;
  private statusText: TextRenderable;

  private focusedField: 0 | 1 | 2 = 0;
  private inputs: InputRenderable[];
  private completionVisible = false;
  private completionDir = "";

  onComplete: ((path: string, name: string, pattern: string) => void) | null =
    null;
  onCancel: (() => void) | null = null;

  constructor(private ctx: RenderContext) {
    this.container = new BoxRenderable(ctx, {
      id: "add-collection-container",
      flexDirection: "column",
      flexGrow: 1,
      padding: 1,
      gap: 1,
    });

    // Path
    this.pathLabel = new TextRenderable(ctx, {
      id: "add-path-label",
      content: t`${bold(fg("#fab283")("Path:"))}`,
    });
    this.pathInput = new InputRenderable(ctx, {
      id: "add-path-input",
      width: 50,
      placeholder: "/path/to/documents",
    });

    // Completion select (shown below path input when completions available)
    this.completionSelect = new SelectRenderable(ctx, {
      id: "add-path-completion",
      options: [],
      flexGrow: 1,
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: true,
      selectedBackgroundColor: "#1e1e1e",
      selectedTextColor: "#eeeeee",
    });

    // Name
    this.nameLabel = new TextRenderable(ctx, {
      id: "add-name-label",
      content: t`${bold(fg("#fab283")("Name:"))}`,
    });
    this.nameInput = new InputRenderable(ctx, {
      id: "add-name-input",
      width: 50,
      placeholder: "collection-name",
    });

    // Pattern
    this.patternLabel = new TextRenderable(ctx, {
      id: "add-pattern-label",
      content: t`${bold(fg("#fab283")("Pattern:"))}`,
    });
    this.patternInput = new InputRenderable(ctx, {
      id: "add-pattern-input",
      width: 50,
      placeholder: "**/*.md (default)",
    });

    // Status
    this.statusText = new TextRenderable(ctx, {
      id: "add-status",
      content: "",
    });

    this.rebuildLayout();

    this.inputs = [this.pathInput, this.nameInput, this.patternInput];

    // Enter on any field triggers submit
    for (const input of this.inputs) {
      input.on(InputRenderableEvents.ENTER, () => {
        if (this.completionVisible) return; // Don't submit while picking
        this.submit();
      });
    }

    // When a completion is selected, fill the path and hide completions
    this.completionSelect.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        if (option.value) {
          this.pathInput.value = option.value;
          this.hideCompletions();
          this.pathInput.focus();
        }
      },
    );
  }

  private rebuildLayout(): void {
    // Remove all children
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id);
    }

    this.container.add(this.pathLabel);
    this.container.add(this.pathInput);
    if (this.completionVisible) {
      this.container.add(this.completionSelect);
    }
    this.container.add(this.nameLabel);
    this.container.add(this.nameInput);
    this.container.add(this.patternLabel);
    this.container.add(this.patternInput);
    this.container.add(this.statusText);
  }

  private showCompletions(entries: CompletionEntry[], rawDir: string): void {
    this.completionDir = rawDir;
    if (!this.completionVisible) {
      this.completionVisible = true;
      this.rebuildLayout();
    }
    // Set options after the select is in the layout
    this.completionSelect.options = entries.map((e) => ({
      name: e.name + (e.isDir ? "/" : ""),
      description: e.isDir ? "dir" : "file",
      value: rawDir + e.name + (e.isDir ? "/" : ""),
    }));
    this.completionSelect.focus();
  }

  private hideCompletions(): void {
    if (this.completionVisible) {
      this.completionVisible = false;
      this.completionSelect.options = [{ name: " ", description: "", value: "" }];
      this.completionSelect.options = [];
      this.rebuildLayout();
    }
    this.statusText.content = "";
  }

  get isCompletionActive(): boolean {
    return this.completionVisible;
  }

  focusFirst(): void {
    this.focusedField = 0;
    this.pathInput.focus();
  }

  /** Handle tab key. Returns true if handled. */
  async handleTab(): Promise<boolean> {
    if (this.completionVisible) {
      // Tab while completion is open: dismiss and go to next field
      this.hideCompletions();
      this.focusNext();
      return true;
    }
    if (this.focusedField === 0 && this.pathInput.focused) {
      await this.completePath();
      return true;
    }
    this.focusNext();
    return true;
  }

  /** Handle escape key. Returns true if completions were dismissed, false if caller should handle. */
  handleEscape(): boolean {
    if (this.completionVisible) {
      this.hideCompletions();
      this.pathInput.focus();
      return true;
    }
    return false;
  }

  focusNext(): void {
    this.focusedField = ((this.focusedField + 1) % 3) as 0 | 1 | 2;
    this.inputs[this.focusedField]!.focus();
  }

  reset(): void {
    this.pathInput.value = "";
    this.nameInput.value = "";
    this.patternInput.value = "";
    this.statusText.content = "";
    this.focusedField = 0;
    this.hideCompletions();
  }

  private async completePath(): Promise<void> {
    const raw = this.pathInput.value;
    if (!raw) return;

    // Expand ~ to home directory
    const expanded = raw.startsWith("~/") || raw === "~"
      ? join(process.env.HOME!, raw.slice(1))
      : raw;

    try {
      // Check if the current value is a complete directory ending with /
      const st = await stat(expanded).catch(() => null);
      if (st?.isDirectory() && raw.endsWith("/")) {
        const entries = await listDirEntries(expanded);
        if (entries.length === 1 && entries[0]!.isDir) {
          this.pathInput.value = raw + entries[0]!.name + "/";
        } else if (entries.length > 1) {
          this.showCompletions(entries, raw);
        } else if (entries.length === 1) {
          this.pathInput.value = raw + entries[0]!.name;
        }
        return;
      }

      // Partial path: complete the last segment
      const lastSlash = expanded.lastIndexOf("/");
      if (lastSlash === -1) return;

      const dir = expanded.slice(0, lastSlash) || "/";
      const prefix = expanded.slice(lastSlash + 1).toLowerCase();

      const allEntries = await listDirEntries(dir);
      const matches = allEntries.filter((e) =>
        e.name.toLowerCase().startsWith(prefix),
      );

      if (matches.length === 0) {
        this.statusText.content = t`${fg("#808080")("No matches.")}`;
      } else if (matches.length === 1) {
        const rawDir = raw.slice(0, raw.lastIndexOf("/") + 1);
        const entry = matches[0]!;
        this.pathInput.value = rawDir + entry.name + (entry.isDir ? "/" : "");
        this.statusText.content = "";
      } else {
        // Auto-complete common prefix
        const names = matches.map((e) => e.name);
        const common = commonPrefix(names);
        if (common.length > prefix.length) {
          const rawDir = raw.slice(0, raw.lastIndexOf("/") + 1);
          this.pathInput.value = rawDir + common;
        }
        const rawDir = raw.slice(0, raw.lastIndexOf("/") + 1);
        this.showCompletions(matches, rawDir);
      }
    } catch {
      // Ignore filesystem errors during completion
    }
  }

  private submit(): void {
    const path = this.pathInput.value.trim();
    const name = this.nameInput.value.trim();
    const pattern = this.patternInput.value.trim() || "**/*.md";

    if (!path) {
      this.statusText.content = t`${fg("#e06c75")("Path is required.")}`;
      this.pathInput.focus();
      return;
    }
    if (!name) {
      this.statusText.content = t`${fg("#e06c75")("Name is required.")}`;
      this.nameInput.focus();
      return;
    }

    this.onComplete?.(path, name, pattern);
  }

  showStatus(message: string, error = false): void {
    this.statusText.content = error
      ? t`${fg("#e06c75")(message)}`
      : t`${fg("#808080")(message)}`;
  }
}

type CompletionEntry = { name: string; isDir: boolean };

async function listDirEntries(dir: string): Promise<CompletionEntry[]> {
  const entries = await readdir(dir);
  const result: CompletionEntry[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const entryStat = await stat(join(dir, entry)).catch(() => null);
    if (entryStat) {
      result.push({ name: entry, isDir: entryStat.isDirectory() });
    }
  }
  result.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0]!;
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i]!.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix;
}
