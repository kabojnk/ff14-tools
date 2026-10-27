import { lazy, Suspense, useRef, useState, type FormEvent, type ReactNode } from 'react'
import './desk.css'
import { useStored } from '@/components/eep/desk/storage'
import { HomeView } from '@/components/eep/desk/HomeView'
import { CraftingView } from '@/components/eep/desk/CraftingView'
import { CollectionsView } from '@/components/eep/desk/CollectionsView'
import { SearchView } from '@/components/eep/desk/SearchView'
import { resets, formatSpan } from '@/components/eep/desk/data'

// The planner (and its fight data) loads when it's first opened, so the disguise itself paints at once.
const RaidPlansView = lazy(() => import('@/components/eep/desk/raid/RaidPlansView'))

export type DeskView = 'home' | 'craft' | 'collect' | 'raid'
const VIEWS: DeskView[] = ['home', 'craft', 'collect', 'raid']

interface AetherdeskProps {
  /** Signed in: the Unlock dot (once a PIN exists) and Logout. Signed out: Login. */
  signedIn: boolean
  /** Show the Unlock dot (the account has a PIN). */
  canUnlock: boolean
  onUnlock: () => void
  /** Text submitted in the search field. Returns true when it was the passphrase (it's then not searched for). */
  onSubmitSearch: (text: string) => boolean
  onLogin?: () => void
  onLogout?: () => void
}

const TITLES: Record<DeskView, [string, string]> = {
  home: ['Today in Eorzea', ''],
  craft: ['Crafting', 'Dawntrail recipes · Lv 90–100'],
  collect: ['Collections', 'Mounts, minions, Triple Triad cards and achievements'],
  raid: ['Raid Plans', 'Savage and Extreme · Shadowbringers to Dawntrail'],
}

/**
 * Aetherdesk, the FFXIV companion site the disguise shows: Home, Crafting, Collections and Raid Plans. Its data
 * is mock and its progress stays on this device. The way back to the chat lives in its header: the round
 * "character" button is the Unlock dot, and the search field takes the passphrase.
 */
export function Aetherdesk({ signedIn, canUnlock, onUnlock, onSubmitSearch, onLogin, onLogout }: AetherdeskProps) {
  const [stored, setView] = useStored<DeskView>('view', 'home')
  const view = VIEWS.includes(stored) ? stored : 'home'
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const go = (next: DeskView) => {
    setSearched(null)
    setView(next)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim()
    setQuery('')
    if (!text || onSubmitSearch(text)) return
    setSearched(text)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const [title, sub] = searched !== null ? ['Search', `Results for “${searched}”`] : TITLES[view]
  const subtitle = sub || `Daily reset in ${formatSpan(resets(new Date()).daily)}`

  return (
    <div className="xd">
      <div className="xd-sky" aria-hidden="true">
        <i />
        <i />
        <i />
        <svg className="xd-crystal" viewBox="0 0 100 180" fill="none" stroke="#bfe9ff" strokeWidth="1.5">
          <path d="M50 2 85 60 50 178 15 60Z" />
          <path d="M15 60h70M50 2v176M50 2 32 60l18 118 18-118Z" />
        </svg>
      </div>

      <div className="xd-app">
        <aside className="xd-side glass" aria-label="Sections">
          <div className="xd-brand">
            <Logo />
            <span>
              <b>Aetherdesk</b>
              <small>FFXIV companion · Patch 7.5</small>
            </span>
          </div>
          {VIEWS.map((v) => (
            <button key={v} type="button" className="xd-nav" aria-current={searched === null && v === view ? 'page' : undefined} onClick={() => go(v)}>
              {ICONS[v]}
              {NAV_LABEL[v]}
            </button>
          ))}
          <div className="xd-side-foot">
            <span>Data from Patch 7.5 · v2.2.0</span>
          </div>
        </aside>

        <section className="xd-main">
          <header className="xd-top glass">
            <div className="xd-top-title">
              <h1 className="xd-site">Aetherdesk</h1>
              <h2>{title}</h2>
              <p className="xd-sub">{subtitle}</p>
            </div>
            <form className="xd-search" role="search" onSubmit={submit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="aetherdesk-search"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Search recipes, items and raids"
                placeholder="Search recipes, items, raids"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </form>
            {signedIn ? (
              canUnlock && <button type="button" className="xd-me" aria-label="Unlock" onClick={onUnlock} />
            ) : (
              onLogin && (
                <button type="button" className="xd-signin" onClick={onLogin}>
                  Login
                </button>
              )
            )}
          </header>

          <div className="xd-scroll" ref={scrollRef}>
            {searched !== null ? (
              <SearchView query={searched} onOpen={go} />
            ) : view === 'home' ? (
              <HomeView onOpen={go} />
            ) : view === 'craft' ? (
              <CraftingView />
            ) : view === 'collect' ? (
              <CollectionsView />
            ) : (
              <Suspense fallback={<p className="xd-empty">Loading raid plans…</p>}>
                <RaidPlansView />
              </Suspense>
            )}
            <footer className="xd-muted" style={{ padding: '22px 6px 4px', fontSize: 11.5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Aetherdesk is a fan site. FINAL FANTASY XIV © SQUARE ENIX.</span>
              {signedIn && onLogout && (
                <button type="button" className="xd-link" onClick={onLogout}>
                  Logout
                </button>
              )}
            </footer>
          </div>
        </section>
      </div>

      <nav className="xd-tabbar glass" aria-label="Sections (tabs)">
        {VIEWS.map((v) => (
          <button key={v} type="button" className="xd-tab" aria-current={searched === null && v === view ? 'page' : undefined} onClick={() => go(v)}>
            {ICONS[v]}
            {TAB_LABEL[v]}
          </button>
        ))}
      </nav>
    </div>
  )
}

const NAV_LABEL: Record<DeskView, string> = { home: 'Home', craft: 'Crafting', collect: 'Collections', raid: 'Raid Plans' }
const TAB_LABEL: Record<DeskView, string> = { home: 'Home', craft: 'Crafting', collect: 'Collect', raid: 'Raids' }

function Logo() {
  return (
    <span className="xd-logo" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#071025" strokeWidth="2.2">
        <path d="M12 2 19 9 12 22 5 9Z" />
      </svg>
    </span>
  )
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {children}
  </svg>
)

const ICONS: Record<DeskView, ReactNode> = {
  home: svg(<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />),
  craft: svg(
    <>
      <path d="m14 4 6 6-9 9H5v-6Z" />
      <path d="m12 6 6 6" />
    </>,
  ),
  collect: svg(
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <path d="M14 17.5h7M17.5 14v7" />
    </>,
  ),
  raid: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>,
  ),
}
