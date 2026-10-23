/**
 * In the iOS app, web links leave the app: an http(s) link that opens a new tab, or that points at
 * another site, opens in Safari (the in-app Safari view) instead of replacing the chat. Clicks a
 * component already handled (defaultPrevented) are left alone. Returns a function that uninstalls.
 */
export function installExternalLinks(doc: Document, open: (url: string) => unknown): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const url = new URL(a.href, doc.baseURI)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (a.target !== '_blank' && url.origin === doc.location.origin) return
    e.preventDefault()
    void open(url.href)
  }
  doc.addEventListener('click', onClick)
  return () => doc.removeEventListener('click', onClick)
}
