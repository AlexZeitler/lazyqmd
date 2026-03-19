import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";

export interface Theme {
  accent: string;
  foreground: string;
  background: string;
  muted: string;
  error: string;
  success: string;
  warning: string;
  title: string;
  selection_bg: string;
  selection_fg: string;
  selection_desc: string;
  border_active: string;
  border_inactive: string;
  // Markdown syntax
  heading: string;
  strong: string;
  italic: string;
  code: string;
  link: string;
  link_url: string;
  list: string;
}

// Tokyo Night
const DEFAULT_THEME: Theme = {
  accent: "#7aa2f7",
  foreground: "#c0caf5",
  background: "#1a1b26",
  muted: "#565f89",
  error: "#f7768e",
  success: "#9ece6a",
  warning: "#e0af68",
  title: "#7aa2f7",
  selection_bg: "#2a2d3e",
  selection_fg: "#c0caf5",
  selection_desc: "#565f89",
  border_active: "#3b4261",
  border_inactive: "#292e42",
  heading: "#bb9af7",
  strong: "#e0af68",
  italic: "#e0af68",
  code: "#9ece6a",
  link: "#7dcfff",
  link_url: "#7aa2f7",
  list: "#7aa2f7",
};

function loadOmarchyColors(): Partial<Theme> | null {
  const colorsPath = join(
    homedir(),
    ".config",
    "omarchy",
    "current",
    "theme",
    "colors.toml",
  );
  if (!existsSync(colorsPath)) return null;

  try {
    const raw = readFileSync(colorsPath, "utf-8");
    // Parse TOML-like key=value format
    const colors: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(\w+)\s*=\s*"([^"]+)"/);
      if (m) colors[m[1]!] = m[2]!;
    }

    return {
      accent: colors.accent,
      foreground: colors.foreground,
      background: colors.background,
      muted: colors.color7,
      error: colors.color1,
      success: colors.color2,
      warning: colors.color3,
      title: colors.accent,
      selection_bg: colors.selection_background,
      selection_fg: colors.foreground,
      selection_desc: colors.color7,
      border_active: colors.color7,
      border_inactive: colors.color7,
      heading: colors.color5,
      strong: colors.color3,
      italic: colors.color3,
      code: colors.color2,
      link: colors.color6,
      link_url: colors.accent,
      list: colors.accent,
    };
  } catch {
    return null;
  }
}

function loadConfigTheme(
  configTheme: Record<string, string> | undefined,
): Partial<Theme> | null {
  if (!configTheme || Object.keys(configTheme).length === 0) return null;
  return configTheme as unknown as Partial<Theme>;
}

export function loadTheme(configTheme?: Record<string, string>): Theme {
  const omarchy = loadOmarchyColors();
  const config = loadConfigTheme(configTheme);

  return {
    ...DEFAULT_THEME,
    ...(omarchy ?? {}),
    ...(config ?? {}),
  };
}
