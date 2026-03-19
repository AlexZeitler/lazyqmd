# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] - 2026-03-19

### Added

- Theming support with Tokyo Night as default theme
- Theme cascade: Omarchy auto-detection -> config overrides -> defaults
- All UI colors configurable via `theme` section in `~/.config/lazyqmd/options.json`

## [0.2.4] - 2026-03-19

### Added

- `lazyqmd self-update` command to update to latest GitHub release

## [0.2.3] - 2026-03-19

### Added

- `--version` / `-v` flag to print version and exit

## [0.2.2] - 2026-03-19

### Fixed

- Version display in footer was hardcoded; now reads from package.json

## [0.2.1] - 2026-03-19

### Fixed

- Collection names with spaces (e.g. "LogSeq Inbox") not appearing in sidebar

## [0.2.0] - 2026-03-17

### Changed

- Switch to global install via `bun install -g`

## [0.1.0] - 2026-03-16

### Added

- Terminal UI for browsing qmd collections with OpenTUI
- Sidebar with collection list and detail view
- Full-text and semantic search via qmd MCP
- Document viewer with markdown rendering
- Live preview in browser with auto-reload on file change
- File browser with fuzzy filter for collections
- Collection management (add, rename, delete)
- Embedding and index update shortcuts
- Editor integration (opens in $EDITOR)
