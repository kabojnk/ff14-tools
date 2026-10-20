/**
 * The chat themes. Token values live in `src/styles/themes.css`, one `[data-theme="<id>"]` block
 * per theme. `index.html` repeats the id list in its first-paint script; keep the two in step.
 */

export const THEME_IDS = [
  'light', 'dark', 'midnight', 'latte', 'mocha', 'sakura', 'dawn', 'rosepine', 'dracula', 'nord', 'tokyo',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export interface ThemeInfo {
  id: ThemeId
  name: string
  kind: 'light' | 'dark'
  pink?: boolean
  /** Wallpaper, my bubble, accent: for the picker's swatch cards. */
  swatches: [string, string, string]
}

export const THEMES: ThemeInfo[] = [
  { id: 'light', name: 'Light', kind: 'light', swatches: ['#efeae2', '#d9fdd3', '#008069'] },
  { id: 'dark', name: 'Dark', kind: 'dark', swatches: ['#0e1512', '#1e5a43', '#5ed49a'] },
  { id: 'midnight', name: 'Midnight', kind: 'dark', swatches: ['#0b0e1a', '#2b3a78', '#7c9cff'] },
  { id: 'latte', name: 'Catppuccin Latte', kind: 'light', swatches: ['#eff1f5', '#e3d6fb', '#8839ef'] },
  { id: 'mocha', name: 'Catppuccin Mocha', kind: 'dark', swatches: ['#1e1e2e', '#4c3f6e', '#cba6f7'] },
  { id: 'sakura', name: 'Sakura', kind: 'light', pink: true, swatches: ['#fdf0f4', '#fbd0de', '#c93d70'] },
  { id: 'dawn', name: 'Rosé Pine Dawn', kind: 'light', pink: true, swatches: ['#faf4ed', '#f4dcd9', '#b15a56'] },
  { id: 'rosepine', name: 'Rosé Pine', kind: 'dark', pink: true, swatches: ['#191724', '#4a2c44', '#ebbcba'] },
  { id: 'dracula', name: 'Dracula', kind: 'dark', swatches: ['#282a36', '#5a4a8c', '#ff79c6'] },
  { id: 'nord', name: 'Nord', kind: 'dark', swatches: ['#2e3440', '#405a7a', '#88c0d0'] },
  { id: 'tokyo', name: 'Tokyo Night', kind: 'dark', swatches: ['#1a1b26', '#34508f', '#7aa2f7'] },
]

/** Every token each theme block must define. */
export const THEME_TOKENS = [
  'wall', 'wall-dot', 'bar', 'line', 'them', 'me', 'me-fg', 'me-muted', 'me-link', 'fg', 'muted',
  'accent', 'on-accent', 'tick', 'chip', 'chip-on', 'chip-on-line', 'field', 'seg', 'seg-on', 'shadow',
  'danger', 'on-danger', 'presence-online', 'presence-away', 'presence-offline',
  'code-bg', 'code-fg', 'code-keyword', 'code-string', 'code-number', 'code-title', 'code-comment',
] as const

export function isThemeId(x: unknown): x is ThemeId {
  return typeof x === 'string' && (THEME_IDS as readonly string[]).includes(x)
}

export function defaultTheme(prefersDark: boolean): ThemeId {
  return prefersDark ? 'dark' : 'light'
}

/** The FF14 disguise's bar colour: the status bar shows this whenever the disguise is up. */
export const DISGUISE_BAR = '#1a1a2e'

/** The pre-auth "Loading…" screen's fixed background (never a theme colour). */
export const LOADING_BG = '#2f3137'

/**
 * The `theme-color` for the current screen. The disguise (eep mode, or the signed-out FF14
 * screen) always gets its own bar colour so the status bar never hints at the chat theme.
 */
export function statusBarColor(s: { initialized: boolean; signedIn: boolean; eepMode: boolean; bar: string }): string {
  if (s.eepMode) return DISGUISE_BAR
  if (!s.initialized) return LOADING_BG
  if (!s.signedIn) return DISGUISE_BAR
  return s.bar.trim() || DISGUISE_BAR
}
