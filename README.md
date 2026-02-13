# lazyqmd

A terminal UI for browsing, searching, and previewing [qmd](https://github.com/tobi/qmd) document collections. Built with [Bun](https://bun.sh) and [@opentui/core](https://github.com/nicco-io/opentui).

## Requirements

- [Bun](https://bun.sh) runtime
- [qmd](https://github.com/tobi/qmd) CLI installed and configured with at least one collection
- A Chromium-based browser (Chrome, Chromium, Brave) for live preview

## Prerequisites

The qmd MCP server must be running before starting lazyqmd:

```sh
qmd serve
```

By default lazyqmd connects to port 8181. This can be changed in the [configuration](#configuration).

## Install

Global install (no source checkout needed):

```sh
bun install -g github:alexzeitler/lazyqmd
```

Then run:

```sh
lazyqmd
```

### From Source

```sh
git clone https://github.com/alexzeitler/lazyqmd.git
cd lazyqmd
bun install
bun src/index.ts
```

## Keyboard Shortcuts

### Collections (Sidebar)

| Key | Action |
|-----|--------|
| `j/k` or arrows | Navigate collections |
| `Enter` | Open collection |
| `Tab` | Switch focus between sidebar and main panel |
| `/` or `s` | Open search |
| `a` | Add collection |
| `d` | Delete collection |
| `r` | Rename collection |
| `e` | Create embeddings |
| `u` | Re-index all collections (`qmd update`) |
| `q` | Quit |

### Search

| Key | Action |
|-----|--------|
| `Enter` | Execute search / Open document |
| `Tab` | Toggle focus between input and results |
| `Ctrl+T` | Cycle search mode (Search / Vector / Query) |
| `Esc` | Back to collections |

Search scope follows the sidebar selection — select "All" to search across all collections, or select a specific collection to scope the search.

### Document

| Key | Action |
|-----|--------|
| `j/k` | Scroll |
| `e` | Open in `$EDITOR` |
| `p` | Open live preview in Chrome |
| `Esc` | Back |

### Live Preview

Pressing `p` in document view opens a rendered HTML preview in Chrome. The preview:

- Renders Markdown with frontmatter metadata
- Displays images and assets from the source directory
- Auto-reloads when the source file is saved

## Configuration

Config file: `~/.config/lazyqmd/options.json`

```json
{
  "mcpPort": 8181
}
```
