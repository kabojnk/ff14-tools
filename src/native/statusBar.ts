/** @capacitor/status-bar's Style values: DARK = light text (for dark bars), LIGHT = dark text. */
export type BarStyle = 'DARK' | 'LIGHT'

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const lin = (i: number) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
}

/**
 * The status bar text for a bar colour: whichever of black or white text has the better contrast
 * (they're equal at a relative luminance of about 0.18). Unreadable colours get light text.
 */
export function statusBarStyleFor(color: string): BarStyle {
  const l = luminance(color)
  return l !== null && l > 0.179 ? 'LIGHT' : 'DARK'
}

/**
 * iOS can't colour the status bar (the web content under it gives the colour), only its text. App.tsx
 * already keeps <meta name="theme-color"> on the bar colour for each screen (the disguise's own colour
 * whenever it's up), so the app follows that tag. Returns a function that stops following.
 */
export function followStatusBar(doc: Document, setStyle: (style: BarStyle) => unknown): () => void {
  let last: string | null = null
  const apply = () => {
    const color = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
    if (!color || color === last) return
    last = color
    void setStyle(statusBarStyleFor(color))
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(doc.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['content'] })
  return () => observer.disconnect()
}
