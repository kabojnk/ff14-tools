# iOS App (Sub-project 4) Implementation Plan

> **Design:** docs/plans/2026-10-20-ios-app-design.md
> **Research:** docs/plans/2026-10-19-ios-native-research.md
>
> **For agents:** use team-dev to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. Implementers follow the `tdd` skill (red → green → refactor).
>
> **Gate for every task:** `npx tsc -b && npm run lint && npm test` (0 lint errors). Tasks 1, 5 and 6 also run `npm run db:reset && npm run e2e` (full suite, both projects), because they touch code the website runs. Wrap `db:reset` and `e2e` in the stack lock script from the team briefing, and give each worktree its own `E2E_PORT`.

**Goal:** Wrap the chat in a Capacitor 8 iOS app. The app:
- covers the app-switcher card with a still image of the FF14 picker
- follows the app's own foreground and background signals for presence, the disguise and realtime
- updates its web code from the app's own server (manual mode, no Capgo servers)
- opens links in Safari and sets the status bar text colour for each screen
- drops the Settings "Notifications" section

The website (PWA) keeps working exactly as it does today.

**Architecture.**
- **One codebase, two builds.**
  - `vite build` is the website, unchanged.
  - `vite build --mode native` writes `dist-native/` with no service worker. Capacitor copies it into the app.
- **Native code stays out of the website.**
  - Everything that imports a Capacitor plugin lives in `src/native/` or `src/lib/appLifecycle.ts`.
  - That code is reached only through `import.meta.env.MODE === 'native'` checks. Vite turns these into a literal `"production" === "native"`, which Rollup removes.
  - `isNativeApp()` (`src/lib/platform.ts`) adds a runtime check, so a native build opened in a browser stays inert.
- **Live updates.**
  - The Docker build also builds the native bundle. It zips the bundle and writes `/native/latest.json` (`{version, url, checksum, minNative}`) next to `/native/bundle-<version>.zip`.
  - The app fetches the manifest on launch and on every resume, downloads newer bundles with their checksum, and queues them with `next()`. They are applied the next time the app goes to the background.
  - `notifyAppReady()` runs once React has rendered. A bundle that never renders is rolled back.

**Tech stack additions (exact versions):**

| Package | Version | Kind |
|---|---|---|
| `@capacitor/core` | 8.5.3 | runtime |
| `@capacitor/ios` | 8.5.3 | runtime |
| `@capacitor/app` | 8.1.2 | runtime |
| `@capacitor/browser` | 8.0.5 | runtime |
| `@capacitor/status-bar` | 8.0.4 | runtime |
| `@capacitor/privacy-screen` | 2.0.1 | runtime |
| `@capgo/capacitor-updater` | 8.53.1 | runtime |
| `@capacitor/cli` | 8.5.3 | dev |

**Commit convention:** a short imperative subject, ending with
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Branch:** `feat/ios-app`, cut from `feat/redesign-3b` (PR #4 against `main`). Rebase onto `main` once PR #4 is merged.

**Production safety:**
- No task touches hosted Supabase or pushes.
- There are no database changes.
- The Docker image gains `/native/*` files and two nginx locations. The website's own files and routes are unchanged.

## Decisions made while planning (deviations from the design, to report to the user)

| # | Design said | Plan does | Why |
|---|---|---|---|
| 1 | Version `0.1.0+20261020.1` | `<package version>-<UTC stamp YYYYMMDDHHmmss>`, e.g. `0.1.0-20261020153012` | A timestamp orders bundles without a counter to keep. The app updates only to a **newer** stamp, so a new TestFlight build is never "updated" back to an older server bundle |
| 2 | Manifest `url` is absolute (`https://<host>/native/…`) | `url` is the zip's file name; the app resolves it against the manifest's own URL | The Docker build needs no host, and the manifest can't point anywhere else by mistake |
| 3 | `@capacitor/keyboard` resizes the web view | **No keyboard plugin.** The web view behaves like Safari, and the existing `useKeyboardViewport` (already tested on iPhones) keeps the composer on the keyboard | It changes nothing that already works. The simulator checklist covers it |
| 4 | Status bar "follows the theme" | `StatusBar.setStyle` (light or dark text) from the `theme-color` the app already sets | iOS can't colour the status bar. The colour is the web content underneath, which already matches |
| 5 | A `useAppLifecycle` hook | `onAppStateChange()` in `src/lib/appLifecycle.ts`: one shared native listener that fans out to subscribers | Its subscribers live inside existing effects (presence, the read scheduler, updates), so a plain subscribe function fits better than a hook |
| 6 | Updater rolls back and deletes failed bundles | `autoDeleteFailed: false` | The app skips a version it has seen fail. Deleting the failed bundle would let it download the same broken bundle again on every resume |
| 7 | Info.plist: photo and camera strings | Also `NSMicrophoneUsageDescription`, `NSAllowsLocalNetworking`, `ITSAppUsesNonExemptEncryption = NO` | Recording a video from the composer's camera option needs the microphone string, or iOS kills the app. Local networking lets the simulator reach the local Supabase stack. The encryption flag answers TestFlight's export question up front |
| 8 | (not covered) | The iOS step in the Docker build can't fail a website deploy, and the docs say to **roll forward** (revert and redeploy) rather than redeploy an old image | Phones only install newer stamps, so an old image would leave them on the bad bundle. The website deploy must stay as reliable as today |
| 9 | `appStateChange` `isActive: false` means "backgrounded" | Background is Capacitor's `pause` (didEnterBackground). Coming back is `resume`, or becoming active. Plain "inactive" (Control Center, a permission prompt, a call) only gets the native switcher cover | Otherwise the first photo-permission prompt would throw the user into the disguise and tear down the crop sheet they were in |

## Task graph

```
T0 (lead) ─┬─ T1 lifecycle ──────────┐
           ├─ T2 update checker ─────┼─ T6 native bootstrap ─┐
           ├─ T4 links + status bar ─┘                       │
           ├─ T3 publishing (script, Docker, nginx) ─────────┤
           ├─ T5 remove Notifications ───────────────────────┤
           └─ (after T3) T7 iOS project + assets (Xcode) ────┴─ T8 docs, simulator checks, final verification
```

Wave 1 (parallel after T0): T1, T2, T3, T4, T5. T7 starts as soon as T3 is merged. Wave 2: T6. Then T8.

**Ownership:**

| Task | Files |
|---|---|
| T1 | `src/lib/appLifecycle.ts`, `src/hooks/usePresence.ts`, `src/components/chat2/MessageList.tsx` (two effects only) |
| T3 | `scripts/native-bundle.mjs`, Docker, nginx, compose, `.env.example`, `DEPLOY.md` |
| T4 | `src/native/externalLinks.ts`, `src/native/statusBar.ts` |
| T5 | `src/components/settings/*` |
| T6 | `src/native/bootstrap.ts`, `src/main.tsx` |
| T7 | `ios/`, `scripts/ios-assets.mjs`, `scripts/ios-sim.sh` |

No file is shared between two parallel tasks.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify (T0) | Capacitor deps; scripts `build:native`, `ios:sync`, `ios:sim`, `ios:assets` |
| `capacitor.config.ts` | Create (T0) | App id, name "XIV", `webDir: dist-native`, updater in manual mode |
| `native-shell.json` | Create (T0) | `minNative`: the oldest app shell the current web code works with |
| `vite.config.ts` | Modify (T0) | `--mode native`: `dist-native/` output, no PWA, `__BUNDLE_VERSION__` |
| `src/vite-env.d.ts` | Modify (T0) | `__BUNDLE_VERSION__`, `VITE_NATIVE_UPDATE_URL` types |
| `tsconfig.node.json` | Modify (T0) | Type-check `capacitor.config.ts` |
| `.gitignore`, `.dockerignore`, `eslint.config.js` | Modify (T0) | Ignore `dist-native`, `ios` build output |
| `src/lib/platform.ts` (+ test) | Create (T0) | `isNativeApp()` |
| `src/lib/appLifecycle.ts` (+ test) | Create (T1) | `onAppStateChange()`: the app's foreground and background signal |
| `src/hooks/usePresence.ts` (+ new test) | Modify (T1) | In the app, the lifecycle signal replaces the web events; resume reconnects realtime |
| `src/components/chat2/MessageList.tsx` (+ test) | Modify (T1) | In the app, going to the background flushes the pending read mark |
| `src/native/updates.ts` (+ test) | Create (T2) | Manifest parsing, version rules, `checkForUpdate()`, `startUpdates()` |
| `scripts/native-bundle.mjs` (+ `.test.mjs`) | Create (T3) | Native build; with `--publish`, the zip and `latest.json` |
| `docker/Dockerfile`, `docker/nginx.conf`, `docker-compose.yml`, `.env.example`, `DEPLOY.md` | Modify (T3) | Publish `/native/*`; manifest never cached; `VITE_NATIVE_UPDATE_URL` |
| `src/native/externalLinks.ts` (+ test) | Create (T4) | Web links open in Safari |
| `src/native/statusBar.ts` (+ test) | Create (T4) | Status bar text colour from `theme-color` |
| `src/components/settings/NotificationsSection.tsx` | Delete (T5) | No push, so nothing to say |
| `src/components/settings/Settings.tsx`, `Settings.test.tsx`, `sections.test.tsx` | Modify (T5) | Drop the section |
| `src/native/bootstrap.ts` (+ test) | Create (T6) | Privacy screen, links, status bar, `notifyAppReady`, updates |
| `src/main.tsx` | Modify (T6) | Load the bootstrap in native builds only |
| `ios/` | Create (T7) | Capacitor iOS project (SPM), Info.plist, icon, Splash |
| `scripts/ios-assets.mjs` | Create (T7) | Regenerates the icon and the FF14 Splash image |
| `scripts/ios-sim.sh` | Create (T7) | Build, install and launch in the simulator |
| `docs/ios/testflight-runbook.md` | Create (T8) | Enrolment, signing, upload, testers, expiry, raising `minNative` |
| `docs/testing/iphone-checklist.md` | Modify (T8) | Native app checks (simulator, then devices) |
| `SETUP.md` | Modify (T8) | Building and running the iOS app locally |

---

### Task 0 (lead, before the parallel tasks): foundation

**Files:**
- Modify: `package.json`, `vite.config.ts`, `src/vite-env.d.ts`, `tsconfig.node.json`, `.gitignore`, `.dockerignore`, `eslint.config.js`
- Create: `capacitor.config.ts`, `native-shell.json`, `src/lib/platform.ts`
- Test: `src/lib/platform.test.ts`

- [ ] **Step 1: Install the dependencies**

```bash
npm install --save-exact @capacitor/core@8.5.3 @capacitor/ios@8.5.3 @capacitor/app@8.1.2 @capacitor/browser@8.0.5 @capacitor/status-bar@8.0.4 @capacitor/privacy-screen@2.0.1 @capgo/capacitor-updater@8.53.1
npm install --save-exact --save-dev @capacitor/cli@8.5.3
```
Expected: no peer-dependency errors (all peer on `@capacitor/core` 8).

- [ ] **Step 2: Write the failing test** `src/lib/platform.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeApp } from '@/lib/platform'

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } }

afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as CapWindow).Capacitor
})

describe('isNativeApp', () => {
  it('is false in a website build, even with a Capacitor global', () => {
    vi.stubEnv('MODE', 'production')
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
    expect(isNativeApp()).toBe(false)
  })

  it('is false in a native build opened in a browser', () => {
    vi.stubEnv('MODE', 'native')
    expect(isNativeApp()).toBe(false)
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => false }
    expect(isNativeApp()).toBe(false)
  })

  it('is true in a native build inside the app', () => {
    vi.stubEnv('MODE', 'native')
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
    expect(isNativeApp()).toBe(true)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/platform.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/platform"".

- [ ] **Step 4: Implement** `src/lib/platform.ts`

```ts
type CapacitorGlobal = { isNativePlatform?: () => boolean }

/**
 * True only inside the iOS app: a `--mode native` build running in Capacitor's web view. The mode
 * check is a build-time constant, so website builds drop every branch behind it. The Capacitor global
 * is read directly so the website never bundles @capacitor/core.
 */
export function isNativeApp(): boolean {
  if (import.meta.env.MODE !== 'native') return false
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() === true
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/platform.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: The native build mode.** In `vite.config.ts`, change `export default defineConfig({` to a function of the mode, and add the bundle version:

```ts
// The live-update version of a native bundle (scripts/native-bundle.mjs sets it). Website builds and
// `vite` dev get a stamp-less placeholder, which every published bundle counts as newer than.
const BUNDLE_VERSION = process.env.BUNDLE_VERSION ?? `${APP_VERSION}-dev`

export default defineConfig(({ mode }) => ({
  // Vitest applies these too, so components that read them work in unit tests.
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUNDLE_VERSION__: JSON.stringify(BUNDLE_VERSION),
  },
  // The iOS app (`--mode native`) gets its own output folder, which Capacitor copies into the app.
  build: mode === 'native' ? { outDir: 'dist-native' } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // No service worker in the iOS app: the updater owns its files, and a worker would serve stale ones.
      disable: mode === 'native',
      registerType: 'autoUpdate',
      // …the rest of the existing VitePWA options, unchanged…
```
Close the object with `}))` instead of `})`. Keep `resolve` and `test` as they are. Also add `'scripts/**/*.test.mjs'` to `test.include`:
```ts
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
```

- [ ] **Step 7: Types.** In `src/vite-env.d.ts`, add `readonly VITE_NATIVE_UPDATE_URL?: string` to `ImportMetaEnv`, and below `__BUILD_DATE__`:

```ts
/** The live-update version of this web bundle (`<package version>-<UTC stamp>`), injected by Vite's `define`. */
declare const __BUNDLE_VERSION__: string
```

- [ ] **Step 8: Capacitor config.** Create `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // A placeholder until Apple Developer enrolment; the runbook says how to change it.
  appId: 'tools.xiv.app',
  appName: 'XIV',
  webDir: 'dist-native',
  ios: {
    // The web content runs under the status bar and home indicator, as in the PWA (viewport-fit=cover).
    contentInset: 'never',
  },
  plugins: {
    CapacitorUpdater: {
      // Manual mode: the app checks its own server (src/native/updates.ts). Never Capgo's servers.
      autoUpdate: false,
      statsUrl: '',
      // A bundle that hasn't called notifyAppReady() after 10 s is rolled back.
      appReadyTimeout: 10000,
      // Failed bundles are kept (marked 'error') so the app knows not to download them again.
      autoDeleteFailed: false,
      autoDeletePrevious: true,
      // A new TestFlight build starts from the bundle inside it.
      resetWhenUpdate: true,
    },
  },
}

export default config
```
In `tsconfig.node.json`, change `"include": ["vite.config.ts"]` to `"include": ["vite.config.ts", "capacitor.config.ts"]`.

- [ ] **Step 9: `native-shell.json`** (raised when a web bundle needs a newer app shell, e.g. a new plugin):

```json
{ "minNative": "1.0.0" }
```

- [ ] **Step 10: Ignores and scripts.**
  - `.gitignore`: add `dist-native/` under "Build output", and `ios/DerivedData/`.
  - `.dockerignore`: add `ios` and `dist-native`.
  - `eslint.config.js` ignores: `['dist', 'dist-native', 'ios', '.claude', 'playwright-report', 'test-results']`.
  - `package.json` scripts:

```json
    "build:native": "tsc -b && node scripts/native-bundle.mjs",
    "ios:sync": "npm run build:native && npx cap sync ios",
    "ios:sim": "bash scripts/ios-sim.sh",
    "ios:assets": "node scripts/ios-assets.mjs",
```

- [ ] **Step 11: Check that both builds still work**

Run: `npx tsc -b && npm run lint && npm test && npm run build && npx vite build --mode native`
Expected:
- all pass
- `dist/sw.js` exists
- `dist-native/index.html` exists, and `dist-native/sw.js` and `dist-native/registerSW.js` do **not**

Check with: `ls dist/sw.js dist-native/index.html && ! ls dist-native/sw.js dist-native/registerSW.js 2>/dev/null`

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/vite-env.d.ts tsconfig.node.json .gitignore .dockerignore eslint.config.js capacitor.config.ts native-shell.json src/lib/platform.ts src/lib/platform.test.ts
git commit -m "Add Capacitor, the native build mode and isNativeApp"
```

---

### Task 1: the app's lifecycle signal (presence, disguise, realtime, read marks)

**Files:**
- Create: `src/lib/appLifecycle.ts`, `src/lib/appLifecycle.test.ts`, `src/hooks/usePresence.test.ts`
- Modify: `src/hooks/usePresence.ts`, `src/components/chat2/MessageList.tsx`, `src/components/chat2/MessageList.test.tsx`

**Dependencies:** Task 0

- [ ] **Step 1: Write the failing test** `src/lib/appLifecycle.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Implementations go inside vi.fn(): the config's restoreMocks resets mocks to those before each test.
const native = vi.hoisted(() => {
  const handlers: Record<string, (s?: { isActive: boolean }) => void> = {}
  return {
    handlers,
    addListener: vi.fn(async (event: string, h: (s?: { isActive: boolean }) => void) => {
      handlers[event] = h
      return { remove: vi.fn() }
    }),
    getState: vi.fn(async () => ({ isActive: true })),
  }
})
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener, getState: native.getState } }))

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } }

async function load() {
  vi.resetModules()
  return import('@/lib/appLifecycle')
}
function inApp() {
  vi.stubEnv('MODE', 'native')
  ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
}

beforeEach(() => {
  for (const k of Object.keys(native.handlers)) delete native.handlers[k]
  native.addListener.mockClear()
  native.getState.mockResolvedValue({ isActive: true })
})
afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as CapWindow).Capacitor
})

describe('onAppStateChange', () => {
  it('never subscribes outside the app', async () => {
    const { onAppStateChange } = await load()
    const stop = onAppStateChange(vi.fn())
    await Promise.resolve()
    expect(native.addListener).not.toHaveBeenCalled()
    stop()
  })

  it('in the app, pause and resume fan out to every subscriber until they stop', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const a = vi.fn()
    const b = vi.fn()
    const stopA = onAppStateChange(a)
    onAppStateChange(b)
    await vi.waitFor(() => expect(native.handlers.resume).toBeDefined())
    expect(native.addListener).toHaveBeenCalledTimes(3) // pause, resume, appStateChange: one set for everyone

    native.handlers.pause()
    expect(a).toHaveBeenCalledWith(false)
    expect(b).toHaveBeenCalledWith(false)

    stopA()
    native.handlers.resume()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenLastCalledWith(true)
  })

  it('an interruption that never leaves the foreground (Control Center, a permission prompt) is not "background"', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const cb = vi.fn()
    onAppStateChange(cb)
    await vi.waitFor(() => expect(native.handlers.appStateChange).toBeDefined())
    native.handlers.appStateChange({ isActive: false })
    native.handlers.appStateChange({ isActive: true })
    // Becoming active reports "foreground" once (it also settles a cold start); inactive alone reports nothing.
    expect(cb.mock.calls).toEqual([[true]])
  })

  it('reports each change once, however many native events say it', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const cb = vi.fn()
    onAppStateChange(cb)
    await vi.waitFor(() => expect(native.handlers.resume).toBeDefined())
    native.handlers.pause()
    native.handlers.resume()
    native.handlers.appStateChange({ isActive: true })
    expect(cb.mock.calls).toEqual([[false], [true]])
  })
})

describe('appIsActive', () => {
  it('is true outside the app', async () => {
    const { appIsActive } = await load()
    await expect(appIsActive()).resolves.toBe(true)
  })

  it('asks the app in the app (a page can start in the background after an update reload)', async () => {
    inApp()
    native.getState.mockResolvedValue({ isActive: false })
    const { appIsActive } = await load()
    await expect(appIsActive()).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/appLifecycle.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/appLifecycle"".

- [ ] **Step 3: Implement** `src/lib/appLifecycle.ts`

```ts
import { isNativeApp } from '@/lib/platform'

type Listener = (active: boolean) => void

const listeners = new Set<Listener>()
let listening = false
let current: boolean | null = null

function emit(active: boolean) {
  if (current === active) return
  current = active
  for (const l of [...listeners]) l(active)
}

/**
 * The iOS app going to the background (false) and coming back to the foreground (true).
 * - Background is Capacitor's 'pause' (didEnterBackground), not "inactive": Control Center, permission
 *   prompts, Face ID and calls make the app inactive without leaving it, and must not drop the user into
 *   the disguise mid-flow. The native privacy screen covers the switcher card from "inactive" on.
 * - Foreground is 'resume', or becoming active (which also settles a cold start, where no resume fires).
 *   Each change is reported once.
 * WKWebView doesn't deliver visibilitychange / pagehide reliably, so inside the app this replaces them.
 * Outside the app it never fires (and website builds drop the native code). Returns an unsubscribe.
 */
export function onAppStateChange(listener: Listener): () => void {
  if (import.meta.env.MODE === 'native' && isNativeApp()) {
    listeners.add(listener)
    if (!listening) {
      listening = true
      void import('@capacitor/app').then(({ App }) =>
        Promise.all([
          App.addListener('pause', () => emit(false)),
          App.addListener('resume', () => emit(true)),
          App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) emit(true)
          }),
        ]),
      )
    }
    return () => {
      listeners.delete(listener)
    }
  }
  return () => {}
}

/**
 * Whether the app is in the foreground now. A page can start in the background: the updater reloads
 * the web view there to apply a new bundle. Always true outside the app.
 */
export async function appIsActive(): Promise<boolean> {
  if (import.meta.env.MODE === 'native' && isNativeApp()) {
    const { App } = await import('@capacitor/app')
    return (await App.getState()).isActive
  }
  return true
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/appLifecycle.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing presence test** `src/hooks/usePresence.test.ts`

```ts
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const app = vi.hoisted(() => ({
  listener: null as null | ((active: boolean) => void),
  stop: vi.fn(),
  active: true,
}))
const realtime = vi.hoisted(() => ({ isConnected: vi.fn(() => false), connect: vi.fn() }))
vi.mock('@/lib/platform', () => ({ isNativeApp: () => true }))
vi.mock('@/lib/appLifecycle', () => ({
  onAppStateChange: (l: (active: boolean) => void) => {
    app.listener = l
    return app.stop
  },
  appIsActive: async () => app.active,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { realtime } }))

import { usePresence } from '@/hooks/usePresence'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'

const presence = {
  initPresence: vi.fn(),
  setDevicePresence: vi.fn(async () => {}),
  touchLastSeen: vi.fn(async () => {}),
  cleanupPresence: vi.fn(),
}

beforeEach(() => {
  document.body.innerHTML = '<div id="privacy-screen" style="display:none"></div>'
  app.listener = null
  app.active = true
  app.stop.mockClear()
  realtime.isConnected.mockReturnValue(false)
  realtime.connect.mockClear()
  Object.values(presence).forEach((f) => f.mockClear())
  usePresenceStore.setState(presence as never)
  useAuthStore.setState({ user: { id: 'alice' } as User, profile: { id: 'alice', presence_override: null } as never })
  useUiStore.setState({ eepMode: false })
})
afterEach(() => {
  document.body.innerHTML = ''
})

const screenEl = () => document.getElementById('privacy-screen')!

describe('usePresence in the iOS app', () => {
  it('going to the background covers the screen, goes offline and puts up the disguise', () => {
    renderHook(() => usePresence())
    app.listener!(false)
    expect(screenEl().style.display).toBe('flex')
    expect(presence.setDevicePresence).toHaveBeenCalledWith('offline')
    // Once on start, once on going to the background.
    expect(presence.touchLastSeen).toHaveBeenCalledTimes(2)
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('coming back uncovers, goes online and reconnects realtime if the socket dropped', () => {
    renderHook(() => usePresence())
    app.listener!(false)
    app.listener!(true)
    expect(screenEl().style.display).toBe('none')
    expect(presence.setDevicePresence).toHaveBeenLastCalledWith('online')
    expect(realtime.connect).toHaveBeenCalledTimes(1)
    // The disguise stays up until the passphrase or PIN.
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('does not reconnect a socket that is still connected', () => {
    realtime.isConnected.mockReturnValue(true)
    renderHook(() => usePresence())
    app.listener!(true)
    expect(realtime.connect).not.toHaveBeenCalled()
  })

  it('a page that starts in the background (an update reload) is covered, offline and disguised at once', async () => {
    app.active = false
    renderHook(() => usePresence())
    await vi.waitFor(() => expect(presence.setDevicePresence).toHaveBeenCalledWith('offline'))
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(screenEl().style.display).toBe('flex')
  })

  it('a page that starts in the foreground stays online', async () => {
    renderHook(() => usePresence())
    await Promise.resolve()
    await Promise.resolve()
    expect(presence.setDevicePresence).not.toHaveBeenCalledWith('offline')
  })

  it('ignores the web events, and stops listening on unmount', () => {
    const { unmount } = renderHook(() => usePresence())
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(presence.setDevicePresence).not.toHaveBeenCalled()
    expect(useUiStore.getState().eepMode).toBe(false)
    unmount()
    expect(app.stop).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/hooks/usePresence.test.ts`
Expected: FAIL. `app.listener` is null ("Cannot read properties of null"), because `usePresence` doesn't subscribe yet.

- [ ] **Step 7: Implement.** In `src/hooks/usePresence.ts`:
  - Add the imports `import { appIsActive, onAppStateChange } from '@/lib/appLifecycle'`, `import { isNativeApp } from '@/lib/platform'` and `import { supabase } from '@/lib/supabase'`.
  - Replace the block from `window.addEventListener('pagehide', handlePageHide)` to the end of the effect's cleanup with the code below.
  - The heartbeat stays as it is above this block.

```ts
    // In the iOS app the app's own background/foreground signal replaces the web events, which WKWebView
    // doesn't deliver reliably. The native privacy screen covers the switcher card; #privacy-screen
    // stays as a second layer.
    if (isNativeApp()) {
      // A page loaded while the app is in the background (the updater applies bundles there) starts
      // as if it had just gone there: covered, offline and disguised. The old page's pause handler may
      // lose the race with the reload, so this can't rely on it having saved the disguise.
      void appIsActive().then((active) => {
        if (active) return
        showPrivacyScreen()
        void usePresenceStore.getState().setDevicePresence('offline')
        useUiStore.getState().setEepMode(true)
      })
      const stop = onAppStateChange((active) => {
        if (active) {
          hidePrivacyScreen()
          restorePresence()
          // iOS may have closed the socket while suspended; reconnecting rejoins every channel, and
          // the conversation's rejoin catches up on missed messages (useConversationRealtime).
          if (!supabase.realtime.isConnected()) supabase.realtime.connect()
        } else {
          showPrivacyScreen()
          const live = usePresenceStore.getState()
          void live.setDevicePresence('offline')
          void live.touchLastSeen()
          useUiStore.getState().setEepMode(true)
        }
      })
      return () => {
        window.clearInterval(heartbeat)
        usePresenceStore.getState().cleanupPresence()
        stop()
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(heartbeat)
      usePresenceStore.getState().cleanupPresence()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/hooks/usePresence.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Write the failing read-mark test.** Append to `src/components/chat2/MessageList.test.tsx`. Add the mock next to the existing `vi.mock` lines at the top:

```ts
const app = vi.hoisted(() => ({ listeners: new Set<(active: boolean) => void>() }))
vi.mock('@/lib/appLifecycle', () => ({
  onAppStateChange: (l: (active: boolean) => void) => {
    app.listeners.add(l)
    return () => app.listeners.delete(l)
  },
}))
```
and add `import { supabase } from '@/lib/supabase'` to the imports. Then the test, at the end of the file:

```ts
describe('MessageList in the iOS app', () => {
  it('going to the background sends the pending read mark at once', async () => {
    const { all } = seed(3)
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[all.length - 1].id)).not.toBeNull())
    vi.mocked(supabase.rpc).mockClear()

    // The read mark is debounced (500 ms); the background signal sends it straight away.
    act(() => app.listeners.forEach((l) => l(false)))
    expect(supabase.rpc).toHaveBeenCalledWith('mark_read', expect.objectContaining({ p_conversation: 'conv', p_space: 'schist' }))
  })

  it('stops listening when it unmounts', () => {
    seed(3)
    const { unmount } = render(<MessageList conversationId="conv" space="schist" />)
    expect(app.listeners.size).toBe(1)
    unmount()
    expect(app.listeners.size).toBe(0)
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/components/chat2/MessageList.test.tsx`
Expected: FAIL. `app.listeners.size` is 0, and `mark_read` has not been called after the background signal.

- [ ] **Step 11: Implement.** In `src/components/chat2/MessageList.tsx`, add `import { onAppStateChange } from '@/lib/appLifecycle'`. In the "Mark read" effect, subscribe next to the `pagehide` listener and unsubscribe in its cleanup:

```ts
    const onPageHide = () => void scheduler.flush()
    window.addEventListener('pagehide', onPageHide)
    // In the iOS app, pagehide isn't reliable: the app's background signal flushes instead.
    const stopApp = onAppStateChange((active) => {
      if (!active) void scheduler.flush()
    })
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      stopApp()
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      void scheduler.flush()
      scheduler.dispose()
    }
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run src/components/chat2/MessageList.test.tsx`
Expected: PASS (all, including the 2 new tests).
If the first new test fails because no mark is pending (jsdom layout means the list isn't "at the bottom"), check how the existing read tests in this file get a pending mark, and use the same setup. Don't weaken the assertion.

- [ ] **Step 13: Gate.** Run the task gate including `npm run db:reset && npm run e2e` (website behaviour must be unchanged).

- [ ] **Step 14: Commit**

```bash
git add src/lib/appLifecycle.ts src/lib/appLifecycle.test.ts src/hooks/usePresence.ts src/hooks/usePresence.test.ts src/components/chat2/MessageList.tsx src/components/chat2/MessageList.test.tsx
git commit -m "In the iOS app, the app's own lifecycle drives presence, the disguise, realtime and read marks"
```

---

### Task 2: the update checker

**Files:**
- Create: `src/native/updates.ts`, `src/native/updates.test.ts`

**Dependencies:** Task 0

- [ ] **Step 1: Write the failing test** `src/native/updates.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, compareNative, parseManifest, stampOf, type UpdaterDeps } from '@/native/updates'

const SUM = 'a'.repeat(64)
const MANIFEST_URL = 'https://xiv.example/native/latest.json'
const manifest = (over: Record<string, unknown> = {}) => ({
  version: '0.1.0-20261021090000',
  url: 'bundle-0.1.0-20261021090000.zip',
  checksum: SUM,
  minNative: '1.0.0',
  ...over,
})

function deps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    manifestUrl: MANIFEST_URL,
    bundleVersion: '0.1.0-20261020090000',
    fetchJson: vi.fn(async () => manifest()),
    nativeVersion: vi.fn(async () => '1.0.0'),
    bundles: vi.fn(async () => []),
    download: vi.fn(async (o: { url: string; version: string; checksum: string }) => ({ id: 'b1', version: o.version, downloaded: '', checksum: SUM, status: 'pending' as const })),
    next: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...over,
  }
}

describe('parseManifest', () => {
  it('accepts a complete manifest', () => {
    expect(parseManifest(manifest())).toEqual(manifest())
  })
  it.each([
    ['not an object', 'nope'],
    ['a missing field', { ...manifest(), minNative: undefined }],
    ['an empty url', manifest({ url: '' })],
    ['a short checksum', manifest({ checksum: 'abc' })],
    ['a version without a stamp', manifest({ version: '0.1.0' })],
  ])('rejects %s', (_label, json) => {
    expect(parseManifest(json)).toBeNull()
  })
})

describe('version rules', () => {
  it('reads the stamp off a bundle version', () => {
    expect(stampOf('0.1.0-20261021090000')).toBe(20261021090000)
    expect(stampOf('0.1.0-dev')).toBeNull()
  })
  it('compares native versions part by part', () => {
    expect(compareNative('1.0.0', '1.0.0')).toBe(0)
    expect(compareNative('1.0', '1.0.0')).toBe(0)
    expect(compareNative('1.2.0', '1.10.0')).toBe(-1)
    expect(compareNative('2.0.0', '1.9.9')).toBe(1)
  })
})

describe('checkForUpdate', () => {
  it('downloads a newer bundle (url resolved against the manifest) and queues it for the next background', async () => {
    const d = deps()
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).toHaveBeenCalledWith({
      url: 'https://xiv.example/native/bundle-0.1.0-20261021090000.zip',
      version: '0.1.0-20261021090000',
      checksum: SUM,
    })
    expect(d.next).toHaveBeenCalledWith('b1')
  })

  it('does nothing when the server bundle is not newer than this one', async () => {
    const d = deps({ bundleVersion: '0.1.0-20261021090000' })
    await expect(checkForUpdate(d)).resolves.toBe('up-to-date')
    const older = deps({ bundleVersion: '0.2.0-20261022090000' })
    await expect(checkForUpdate(older)).resolves.toBe('up-to-date')
    expect(d.download).not.toHaveBeenCalled()
    expect(older.download).not.toHaveBeenCalled()
  })

  it('treats a dev bundle as older than any published one', async () => {
    await expect(checkForUpdate(deps({ bundleVersion: '0.1.0-dev' }))).resolves.toBe('queued')
  })

  it('skips a bundle that needs a newer app shell', async () => {
    const d = deps({ fetchJson: vi.fn(async () => manifest({ minNative: '1.1.0' })) })
    await expect(checkForUpdate(d)).resolves.toBe('too-new')
    expect(d.download).not.toHaveBeenCalled()
  })

  it('re-queues an already downloaded bundle without downloading it again', async () => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'pending' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).not.toHaveBeenCalled()
    expect(d.next).toHaveBeenCalledWith('b7')
  })

  it('never retries a version that failed before (rolled back)', async () => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'error' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('failed-before')
    expect(d.download).not.toHaveBeenCalled()
    expect(d.next).not.toHaveBeenCalled()
  })

  it('replaces a download an earlier run left unfinished (the app was killed mid-download)', async () => {
    // Within one run, startUpdates() never starts a second check while one is going, so a "downloading"
    // bundle seen here is left over from before.
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'downloading' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.remove).toHaveBeenCalledWith('b7')
    expect(d.download).toHaveBeenCalledTimes(1)
    expect(d.next).toHaveBeenCalledWith('b1')
  })

  it.each(['deleted', 'deleting'] as const)('downloads again over a %s bundle', async (status) => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the manifest fetch fails', { fetchJson: vi.fn(async () => { throw new Error('offline') }) }],
    ['the manifest is bad', { fetchJson: vi.fn(async () => ({ version: 1 })) }],
    ['the download fails (e.g. checksum mismatch)', { download: vi.fn(async () => { throw new Error('checksum') }) }],
  ])('keeps the current bundle when %s', async (_label, over) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const d = deps(over as Partial<UpdaterDeps>)
    await expect(checkForUpdate(d)).resolves.toBe('error')
    expect(d.next).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/updates.test.ts`
Expected: FAIL, "Failed to resolve import "@/native/updates"".

- [ ] **Step 3: Implement** `src/native/updates.ts`

```ts
import type { BundleInfo } from '@capgo/capacitor-updater'
import { onAppStateChange } from '@/lib/appLifecycle'

/** /native/latest.json, written by scripts/native-bundle.mjs in the Docker build. */
export interface UpdateManifest {
  version: string
  /** The zip, relative to the manifest's own URL. */
  url: string
  /** sha256 of the zip, hex. */
  checksum: string
  /** The oldest app shell (CFBundleShortVersionString) this bundle works with. */
  minNative: string
}

export type UpdateResult = 'up-to-date' | 'queued' | 'too-new' | 'failed-before' | 'error'

export interface UpdaterDeps {
  manifestUrl: string
  /** The running bundle's version (__BUNDLE_VERSION__). */
  bundleVersion: string
  fetchJson: (url: string) => Promise<unknown>
  nativeVersion: () => Promise<string>
  bundles: () => Promise<BundleInfo[]>
  download: (o: { url: string; version: string; checksum: string }) => Promise<BundleInfo>
  next: (id: string) => Promise<void>
  /** Deletes a bundle (a download left unfinished by an earlier run). */
  remove: (id: string) => Promise<void>
}

const STAMP = /-(\d{14})$/

/** Bundle versions are `<package version>-<UTC stamp YYYYMMDDHHmmss>`; the stamp orders them. */
export function stampOf(version: string): number | null {
  const m = STAMP.exec(version)
  return m ? Number(m[1]) : null
}

/** Dotted numeric comparison (-1, 0, 1). Missing or non-numeric parts count as 0. */
export function compareNative(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export function parseManifest(json: unknown): UpdateManifest | null {
  if (!json || typeof json !== 'object') return null
  const m = json as Record<string, unknown>
  const str = (k: string) => (typeof m[k] === 'string' && m[k] !== '' ? (m[k] as string) : null)
  const version = str('version')
  const url = str('url')
  const checksum = str('checksum')
  const minNative = str('minNative')
  if (!version || !url || !checksum || !minNative) return null
  if (!/^[0-9a-f]{64}$/.test(checksum) || stampOf(version) === null) return null
  return { version, url, checksum, minNative }
}

/**
 * One update check: a newer bundle that suits this app shell is downloaded (checksum-verified by the
 * plugin) and queued with next(), so it's applied the next time the app goes to the background, behind
 * the disguise. Any failure keeps the current bundle; the next resume tries again.
 */
export async function checkForUpdate(d: UpdaterDeps): Promise<UpdateResult> {
  try {
    const manifest = parseManifest(await d.fetchJson(d.manifestUrl))
    if (!manifest) throw new Error('bad manifest')
    if ((stampOf(manifest.version) ?? 0) <= (stampOf(d.bundleVersion) ?? 0)) return 'up-to-date'
    if (compareNative(await d.nativeVersion(), manifest.minNative) < 0) return 'too-new'

    const known = (await d.bundles()).find((b) => b.version === manifest.version)
    // A version that failed here before is never retried; the next deploy brings a new version.
    if (known?.status === 'error') return 'failed-before'
    if (known?.status === 'downloading') await d.remove(known.id)
    const bundle =
      known && (known.status === 'pending' || known.status === 'success')
        ? known
        : await d.download({
            url: new URL(manifest.url, d.manifestUrl).href,
            version: manifest.version,
            checksum: manifest.checksum,
          })
    await d.next(bundle.id)
    return 'queued'
  } catch (e) {
    console.warn('[updates] check failed; keeping the current bundle', e)
    return 'error'
  }
}

/** Checks on launch and on every resume. Off when VITE_NATIVE_UPDATE_URL isn't set. */
export function startUpdates(): void {
  const base = import.meta.env.VITE_NATIVE_UPDATE_URL
  if (!base) {
    console.info('[updates] VITE_NATIVE_UPDATE_URL is not set; live updates are off')
    return
  }
  const manifestUrl = new URL('/native/latest.json', base).href
  let running: Promise<UpdateResult> | null = null
  const run = () => {
    running ??= import('@capgo/capacitor-updater')
      .then(({ CapacitorUpdater }) =>
        checkForUpdate({
          manifestUrl,
          bundleVersion: __BUNDLE_VERSION__,
          fetchJson: async (url) => {
            const res = await fetch(url, { cache: 'no-store' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          },
          nativeVersion: async () => (await CapacitorUpdater.current()).native,
          bundles: async () => (await CapacitorUpdater.list()).bundles,
          download: (o) => CapacitorUpdater.download(o),
          next: async (id) => {
            await CapacitorUpdater.next({ id })
          },
          remove: (id) => CapacitorUpdater.delete({ id }),
        }),
      )
      .finally(() => {
        running = null
      })
  }
  run()
  onAppStateChange((active) => {
    if (active) run()
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/updates.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Gate and commit**

```bash
git add src/native/updates.ts src/native/updates.test.ts
git commit -m "Add the live-update checker: newer bundles only, minNative, no retry of a failed version"
```

---

### Task 3: publishing bundles (script, Docker, nginx)

**Files:**
- Create: `scripts/native-bundle.mjs`, `scripts/native-bundle.test.mjs`
- Modify: `docker/Dockerfile`, `docker/nginx.conf`, `docker-compose.yml`, `.env.example`, `DEPLOY.md`

**Dependencies:** Task 0

- [ ] **Step 1: Write the failing test** `scripts/native-bundle.test.mjs`

```js
import { describe, expect, it } from 'vitest'
import { bundleVersion, manifestFor, sha256 } from './native-bundle.mjs'

describe('native-bundle', () => {
  it('stamps the version with the UTC time to the second', () => {
    expect(bundleVersion('0.1.0', new Date('2026-10-20T15:30:12.345Z'))).toBe('0.1.0-20261020153012')
  })

  it('writes a manifest with the zip relative to it', () => {
    expect(manifestFor({ version: '0.1.0-20261020153012', zipName: 'bundle-0.1.0-20261020153012.zip', checksum: 'ab', minNative: '1.0.0' })).toEqual({
      version: '0.1.0-20261020153012',
      url: 'bundle-0.1.0-20261020153012.zip',
      checksum: 'ab',
      minNative: '1.0.0',
    })
  })

  it('hashes with sha256 (hex)', () => {
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/native-bundle.test.mjs`
Expected: FAIL, "Failed to load url ./native-bundle.mjs".

- [ ] **Step 3: Implement** `scripts/native-bundle.mjs`

```js
// Builds the iOS app's web bundle: `vite build --mode native` into dist-native/.
//   node scripts/native-bundle.mjs                   the bundle shipped inside the app (npm run build:native)
//   node scripts/native-bundle.mjs --publish <dir>   also zip it and write <dir>/latest.json (the Docker build)
// Plain JavaScript: the Docker build runs it on Node 20 without TypeScript.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** `<package version>-<UTC YYYYMMDDHHmmss>`. The app only ever updates to a later stamp. */
export function bundleVersion(pkgVersion, now = new Date()) {
  return `${pkgVersion}-${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
}

export function manifestFor({ version, zipName, checksum, minNative }) {
  return { version, url: zipName, checksum, minNative }
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const { minNative } = JSON.parse(readFileSync(path.join(root, 'native-shell.json'), 'utf8'))
  const version = bundleVersion(pkg.version)

  execFileSync(path.join(root, 'node_modules/.bin/vite'), ['build', '--mode', 'native'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BUNDLE_VERSION: version },
  })

  const at = argv.indexOf('--publish')
  if (at === -1) {
    console.log(`native bundle ${version} in dist-native/`)
    return
  }
  const out = path.resolve(root, argv[at + 1] ?? 'dist/native')
  mkdirSync(out, { recursive: true })
  const zipName = `bundle-${version}.zip`
  const zipPath = path.join(out, zipName)
  rmSync(zipPath, { force: true })
  // index.html must sit at the zip's root (the updater requires it). -X leaves out extra file attributes.
  execFileSync('zip', ['-qrX', zipPath, '.'], { cwd: path.join(root, 'dist-native'), stdio: 'inherit' })
  const checksum = sha256(readFileSync(zipPath))
  writeFileSync(path.join(out, 'latest.json'), `${JSON.stringify(manifestFor({ version, zipName, checksum, minNative }), null, 2)}\n`)
  console.log(`published native bundle ${version} (${checksum}) to ${path.relative(root, out)}/`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scripts/native-bundle.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Check it publishes for real**

Run: `node scripts/native-bundle.mjs --publish dist/native && cat dist/native/latest.json && unzip -l dist/native/bundle-*.zip | grep -E ' index\.html$' && shasum -a 256 dist/native/bundle-*.zip`
Expected:
- `latest.json` has a version like `0.1.0-2026…`, `url: "bundle-….zip"` and a 64-hex checksum
- the zip lists `index.html` at its root, with no folder prefix
- `shasum` prints the same checksum as the manifest

Then `rm -rf dist/native`.

- [ ] **Step 6: Docker.** In `docker/Dockerfile`, add the build arg with the others and publish after the website build:

```dockerfile
ARG VITE_NATIVE_UPDATE_URL

# Skip tsc type-check in Docker — esbuild handles transpilation; type-check runs locally
RUN node_modules/.bin/vite build
# The iOS app's live-update bundle and manifest, served from /native/ (scripts/native-bundle.mjs).
# Never blocks a website deploy: without a new manifest the app just keeps the bundle it has.
RUN (apk add --no-cache zip && node scripts/native-bundle.mjs --publish dist/native) \
    || (rm -rf dist/native && echo "WARNING: iOS bundle not published; the app keeps its current version")
```
In `docker-compose.yml`, add `VITE_NATIVE_UPDATE_URL: ${VITE_NATIVE_UPDATE_URL}` under `args`. In `.env.example`, add:
```
# The website's own origin, e.g. https://xiv.example.com. The iOS app fetches its live updates from <origin>/native/.
VITE_NATIVE_UPDATE_URL=https://your-site.example.com
```

- [ ] **Step 7: nginx.** In `docker/nginx.conf`, add these after the `/assets/` block:

```nginx
    # The iOS app's live updates. The manifest is never cached; a bundle never changes once published.
    # The app's web view (origin capacitor://localhost) fetches the manifest, so it needs CORS; the zip
    # is downloaded natively and doesn't.
    location = /native/latest.json {
        add_header Cache-Control "no-store" always;
        add_header Access-Control-Allow-Origin "capacitor://localhost" always;
        # A location with its own add_header drops the server-level ones, so repeat them.
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        try_files $uri =404;
    }
    location /native/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        # A location with its own add_header drops the server-level ones, so repeat them.
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        try_files $uri =404;
    }
```

- [ ] **Step 8: Check the image**

Run (any non-empty values work for a local check):
```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=local VITE_BUNNY_CDN_URL=http://localhost VITE_NATIVE_UPDATE_URL=http://localhost:8080 docker compose build
docker compose up -d
curl -sI http://localhost:8080/native/latest.json | grep -iE 'HTTP/|cache-control|access-control'
curl -s http://localhost:8080/native/latest.json
curl -sI http://localhost:8080/native/nope.zip | head -1
curl -sI http://localhost:8080/ | head -1
docker compose down
```
Expected:
- `latest.json` returns 200 with `Cache-Control: no-store` and `Access-Control-Allow-Origin: capacitor://localhost`
- its body is the manifest
- a missing zip returns 404 (not the SPA's `index.html`)
- `curl -sI http://localhost:8080/native/latest.json | grep -ciE 'x-frame-options|referrer-policy'` prints `2`
- `/` returns 200

- [ ] **Step 9: DEPLOY.md.** In the env block (near the other `VITE_*` lines), add `VITE_NATIVE_UPDATE_URL=https://your-site.example.com`, and add `--build-arg VITE_NATIVE_UPDATE_URL=https://your-site.example.com \` to the `docker build` example. Under them, add one paragraph:

```markdown
`VITE_NATIVE_UPDATE_URL` is this site's own public origin (https). Each build also publishes the iOS app's web code under `/native/`; the app checks `/native/latest.json` on launch and on every resume, and applies a newer bundle the next time it goes to the background. Leave it unset only if nobody uses the iOS app (its live updates then stay off).

**Rolling back with the iOS app: roll forward.** The app only installs a bundle newer than the one it runs, so redeploying an older image does **not** take the phones back. To undo a bad release, revert the change in git and deploy a new build: it gets a new stamp and the phones pick it up on their next resume. (A bundle that fails to render is rolled back on the phone by itself.)

The build now runs Vite twice (the website, then the iOS bundle). On a 1 GB droplet, build locally and ship the image (the `docker save` route below), or add swap before building there. If the iOS step fails, the build prints a warning and the website still deploys.
```

- [ ] **Step 10: Gate and commit**

```bash
git add scripts/native-bundle.mjs scripts/native-bundle.test.mjs docker/Dockerfile docker/nginx.conf docker-compose.yml .env.example DEPLOY.md
git commit -m "Publish the iOS app's live-update bundle and manifest with every Docker build"
```

---

### Task 4: links and status bar helpers

**Files:**
- Create: `src/native/externalLinks.ts`, `src/native/externalLinks.test.ts`, `src/native/statusBar.ts`, `src/native/statusBar.test.ts`

**Dependencies:** Task 0

- [ ] **Step 1: Write the failing tests**

`src/native/externalLinks.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installExternalLinks } from '@/native/externalLinks'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})

function click(html: string) {
  document.body.innerHTML = html
  const a = document.querySelector('a')!
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  ;(a.querySelector('span') ?? a).dispatchEvent(event)
  return event
}

describe('installExternalLinks', () => {
  it('opens a new-tab web link in Safari instead of the app', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    const e = click('<a href="https://example.com/x" target="_blank"><span>link</span></a>')
    expect(e.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/x')
  })

  it('opens a link to another site even without target=_blank', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    click('<a href="https://example.com/">x</a>')
    expect(open).toHaveBeenCalledWith('https://example.com/')
  })

  it('leaves same-origin links, non-web links and handled clicks alone', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    expect(click(`<a href="${location.origin}/inside">x</a>`).defaultPrevented).toBe(false)
    expect(click('<a href="mailto:a@b.c" target="_blank">x</a>').defaultPrevented).toBe(false)
    document.body.innerHTML = '<a href="https://example.com" target="_blank">x</a>'
    const a = document.querySelector('a')!
    a.addEventListener('click', (ev) => ev.preventDefault())
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it('stops when uninstalled', () => {
    const open = vi.fn()
    installExternalLinks(document, open)()
    click('<a href="https://example.com/" target="_blank">x</a>')
    expect(open).not.toHaveBeenCalled()
  })
})
```

`src/native/statusBar.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { followStatusBar, statusBarStyleFor } from '@/native/statusBar'
import { DISGUISE_BAR, LOADING_BG } from '@/lib/themes'

describe('statusBarStyleFor', () => {
  it('uses light text on dark bars and dark text on light ones', () => {
    expect(statusBarStyleFor(DISGUISE_BAR)).toBe('DARK')
    expect(statusBarStyleFor(LOADING_BG)).toBe('DARK')
    expect(statusBarStyleFor('#3b4252')).toBe('DARK')
    expect(statusBarStyleFor('#ffffff')).toBe('LIGHT')
    expect(statusBarStyleFor('#e6e9ef')).toBe('LIGHT')
    expect(statusBarStyleFor('#fff')).toBe('LIGHT')
  })
  it('falls back to light text for anything it cannot read', () => {
    expect(statusBarStyleFor('rebeccapurple')).toBe('DARK')
  })
})

describe('followStatusBar', () => {
  it('applies the current theme-color, then every change to it', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="#1a1a2e">'
    const setStyle = vi.fn()
    const stop = followStatusBar(document, setStyle)
    expect(setStyle).toHaveBeenLastCalledWith('DARK')
    document.querySelector('meta[name="theme-color"]')!.setAttribute('content', '#ffffff')
    await vi.waitFor(() => expect(setStyle).toHaveBeenLastCalledWith('LIGHT'))
    stop()
    document.head.innerHTML = ''
  })

  it('picks up the meta tag when the app adds it later', async () => {
    document.head.innerHTML = ''
    const setStyle = vi.fn()
    const stop = followStatusBar(document, setStyle)
    expect(setStyle).not.toHaveBeenCalled()
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#ffffff'
    document.head.appendChild(meta)
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith('LIGHT'))
    stop()
    document.head.innerHTML = ''
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/native/externalLinks.test.ts src/native/statusBar.test.ts`
Expected: FAIL, "Failed to resolve import" for both modules.

- [ ] **Step 3: Implement** `src/native/externalLinks.ts`

```ts
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
```

`src/native/statusBar.ts`:
```ts
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
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/native/externalLinks.test.ts src/native/statusBar.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Gate and commit**

```bash
git add src/native/externalLinks.ts src/native/externalLinks.test.ts src/native/statusBar.ts src/native/statusBar.test.ts
git commit -m "Add the app's link and status bar helpers"
```

---

### Task 5: remove the Notifications section

**Files:**
- Delete: `src/components/settings/NotificationsSection.tsx`
- Modify: `src/components/settings/Settings.tsx`, `src/components/settings/Settings.test.tsx`, `src/components/settings/sections.test.tsx`

**Dependencies:** none (Task 0 only for the branch)

- [ ] **Step 1: Change the tests first.** In `src/components/settings/Settings.test.tsx`:
  - **The phone list test (about line 85):** replace the `Notifications`/`iPhone app` expectation with
    ```ts
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull()
    ```
  - **"focuses a section with no controls itself…" (about line 124):** use `'About'` in place of `'Notifications'`, in both places. About has no controls.
  - **The desktop nav test (about lines 198–199):** replace the two Notifications lines with
    ```ts
    expect(within(nav).queryByRole('button', { name: 'Notifications' })).toBeNull()
    ```
  - **"a pushed phone section stays selected on desktop…" (about lines 226–233):**
    - push `'About'` in place of `'Notifications'`, and expect `About` to have `aria-current="page"` in the nav
    - then click `'Appearance'` in the nav (in place of `'About'`)
    - after `media.setDesktop(false)`, expect `getByRole('heading', { name: 'Appearance' })`

  In `src/components/settings/sections.test.tsx`, delete the `NotificationsSection` import and the "Notifications says they come with the iPhone app" test.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/settings`
Expected: FAIL. The Notifications button is still there.

- [ ] **Step 3: Implement.** In `src/components/settings/Settings.tsx`:
  - delete the `NotificationsSection` import
  - remove `'notifications'` from `SettingsSection` (it becomes `'appearance' | 'security' | 'about'`)
  - delete the `{ id: 'notifications', … }` entry and the `{shown === 'notifications' && <NotificationsSection />}` line
  - delete `notifications: 'iPhone app',` from `values`
  - remove `Bell` from the lucide import

  Then: `git rm src/components/settings/NotificationsSection.tsx`

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/components/settings && npx tsc -b && grep -rn "Notifications come\|NotificationsSection\|'notifications'" src e2e`
Expected: PASS, a clean type-check, and no grep matches.

- [ ] **Step 5: Gate** (including e2e) **and commit**

```bash
git add -A src/components/settings
git commit -m "Remove the Notifications settings section: the iPhone app has no push"
```

---

### Task 6: the native bootstrap

**Files:**
- Create: `src/native/bootstrap.ts`, `src/native/bootstrap.test.ts`
- Modify: `src/main.tsx`

**Dependencies:** Tasks 1, 2, 4

- [ ] **Step 1: Write the failing test** `src/native/bootstrap.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ order: [] as string[] }))
const privacy = vi.hoisted(() => ({ enable: vi.fn(async () => { calls.order.push('privacy'); return { success: true } }) }))
const updater = vi.hoisted(() => ({ notifyAppReady: vi.fn(async () => { calls.order.push('ready'); return { bundle: {} } }) }))
const browser = vi.hoisted(() => ({ open: vi.fn(async () => {}) }))
const statusBar = vi.hoisted(() => ({ setStyle: vi.fn(async () => {}) }))
const updates = vi.hoisted(() => ({ startUpdates: vi.fn(() => calls.order.push('updates')) }))
let native = true
vi.mock('@/lib/platform', () => ({ isNativeApp: () => native }))
vi.mock('@capacitor/privacy-screen', () => ({ PrivacyScreen: privacy }))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: updater }))
vi.mock('@capacitor/browser', () => ({ Browser: browser }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: statusBar, Style: { Dark: 'DARK', Light: 'LIGHT' } }))
vi.mock('@/native/updates', () => updates)

import { startNative } from '@/native/bootstrap'

beforeEach(() => {
  native = true
  calls.order = []
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"><main>app</main></div>'
  document.head.innerHTML = '<meta name="theme-color" content="#1a1a2e">'
})
afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('startNative', () => {
  it('covers the switcher, follows links and the status bar, keeps the bundle, then checks for updates', async () => {
    const stop = await startNative()
    expect(privacy.enable).toHaveBeenCalledWith({ ios: { blurEffect: 'none' } })
    await vi.waitFor(() => expect(calls.order).toEqual(['privacy', 'ready', 'updates']))
    expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' })

    document.body.insertAdjacentHTML('beforeend', '<a href="https://example.com/" target="_blank">x</a>')
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalledWith({ url: 'https://example.com/' }))
    stop()
  })

  it('does not keep a bundle that never rendered (so the updater rolls it back)', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const stop = await startNative()
    await new Promise((r) => setTimeout(r, 50))
    expect(updater.notifyAppReady).not.toHaveBeenCalled()
    expect(updates.startUpdates).not.toHaveBeenCalled()
    // …and confirms as soon as React does render, however late (a page started in the background).
    document.getElementById('root')!.innerHTML = '<main>app</main>'
    await vi.waitFor(() => expect(updater.notifyAppReady).toHaveBeenCalled())
    stop()
  })

  it('a privacy plugin that never answers does not hold up notifyAppReady', async () => {
    privacy.enable.mockReturnValueOnce(new Promise(() => {}))
    const stop = await startNative()
    await vi.waitFor(() => expect(updater.notifyAppReady).toHaveBeenCalled())
    expect(updates.startUpdates).toHaveBeenCalled()
    stop()
  })

  it('a failing privacy plugin does not stop the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    privacy.enable.mockRejectedValueOnce(new Error('nope'))
    const stop = await startNative()
    await vi.waitFor(() => expect(updater.notifyAppReady).toHaveBeenCalled())
    expect(warn).toHaveBeenCalled()
    stop()
  })

  it('does nothing outside the app', async () => {
    native = false
    const stop = await startNative()
    expect(privacy.enable).not.toHaveBeenCalled()
    expect(updater.notifyAppReady).not.toHaveBeenCalled()
    stop()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/bootstrap.test.ts`
Expected: FAIL, "Failed to resolve import "@/native/bootstrap"".

- [ ] **Step 3: Implement** `src/native/bootstrap.ts`

```ts
import { isNativeApp } from '@/lib/platform'
import { installExternalLinks } from '@/native/externalLinks'
import { followStatusBar } from '@/native/statusBar'
import { startUpdates } from '@/native/updates'

/** Resolves true once React has put something in #root, false if it hasn't within the timeout. */
/**
 * Resolves once React has put something in #root. No timer of its own: if the app never renders, the
 * updater's appReadyTimeout rolls the bundle back. (A JS timer could fire late after iOS suspends a page
 * started in the background, and withdraw a good bundle.)
 */
function whenRendered(): Promise<void> {
  const root = document.getElementById('root')
  if (!root || root.childElementCount) return Promise.resolve()
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!root.childElementCount) return
      observer.disconnect()
      resolve()
    })
    observer.observe(root, { childList: true })
  })
}

/**
 * Native-only start-up, loaded by main.tsx in `--mode native` builds after React's first render:
 * - the privacy screen: on "resign active" iOS gets the Splash image (the FF14 picker) for the
 *   switcher card, before it takes the snapshot
 * - web links open in Safari; the status bar text follows the screen
 * - notifyAppReady() once the app has rendered, so the updater keeps this bundle (one that never
 *   renders is rolled back after appReadyTimeout)
 * - then live updates
 * Returns a function that undoes the listeners (for tests).
 */
export async function startNative(): Promise<() => void> {
  if (!isNativeApp()) return () => {}
  // The updater's appReadyTimeout (10 s) runs from the bundle's load, so nothing on the way to
  // notifyAppReady() may wait on another plugin: a slow or hung one must not roll back a good bundle.
  const rendered = whenRendered()
  const [{ PrivacyScreen }, { CapacitorUpdater }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/privacy-screen'),
    import('@capgo/capacitor-updater'),
    import('@capacitor/status-bar'),
  ])

  void PrivacyScreen.enable({ ios: { blurEffect: 'none' } }).catch((e: unknown) =>
    console.warn('[native] privacy screen unavailable', e),
  )
  const stopLinks = installExternalLinks(document, (url) =>
    import('@capacitor/browser').then(({ Browser }) => Browser.open({ url })),
  )
  const stopBar = followStatusBar(document, (style) =>
    StatusBar.setStyle({ style: style === 'DARK' ? Style.Dark : Style.Light }).catch(() => {}),
  )

  void rendered.then(async () => {
    await CapacitorUpdater.notifyAppReady().catch((e: unknown) => console.warn('[native] notifyAppReady failed', e))
    startUpdates()
  })

  return () => {
    stopLinks()
    stopBar()
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/bootstrap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Load it from `src/main.tsx`** (after the `render(...)` call):

```ts
// The iOS app only. The mode is a build-time constant, so website builds don't contain the native code.
if (import.meta.env.MODE === 'native') {
  void import('./native/bootstrap').then((m) => m.startNative())
}
```

- [ ] **Step 6: Check that the website build has no native code and the app build does**

Run:
```bash
npm run build && npx vite build --mode native
! grep -lE "CapacitorUpdater|PrivacyScreen|appStateChange" dist/assets/*.js
grep -lE "CapacitorUpdater" dist-native/assets/*.js
```
Expected:
- the first grep finds nothing (the command succeeds because of the `!`)
- the second lists at least one chunk

If the first grep finds something, a module outside `src/native/` is importing native code without a literal `import.meta.env.MODE === 'native'` guard. Fix the import; don't loosen the check.

- [ ] **Step 7: Gate** (including e2e) **and commit**

```bash
git add src/native/bootstrap.ts src/native/bootstrap.test.ts src/main.tsx
git commit -m "Start the native layer in the iOS app: privacy screen, links, status bar, app-ready, updates"
```

---

### Task 7: the iOS project and its assets (lead, needs Xcode)

**Files:**
- Create: `ios/` (generated, then edited), `scripts/ios-assets.mjs`, `scripts/ios-sim.sh`

**Dependencies:** Tasks 0 and 3 (`npm run ios:sim` runs `build:native`, which runs `scripts/native-bundle.mjs` from Task 3). Task 6 is needed for the full app at runtime, but not for this task's build check.

- [ ] **Step 1: Generate the project**

Run: `npx vite build --mode native && npx cap add ios`
Expected:
- `ios/App/App.xcodeproj` exists
- the output lists the five plugins: `@capacitor/app`, `@capacitor/browser`, `@capacitor/privacy-screen`, `@capacitor/status-bar` and `@capgo/capacitor-updater`
- `ios/.gitignore` exists and ignores `App/App/public`

- [ ] **Step 2: Info.plist.** Run each line:

```bash
P=ios/App/App/Info.plist
plutil -replace CFBundleDisplayName -string "XIV" $P
plutil -replace NSPhotoLibraryUsageDescription -string "XIV uses your photos for profile pictures and emoji." $P
plutil -replace NSCameraUsageDescription -string "XIV uses the camera for profile pictures and emoji." $P
plutil -replace NSMicrophoneUsageDescription -string "XIV uses the microphone when you record a video." $P
plutil -replace ITSAppUsesNonExemptEncryption -bool NO $P
plutil -replace NSAppTransportSecurity -json '{"NSAllowsLocalNetworking":true}' $P
plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationPortrait"]' $P
plutil -remove 'UISupportedInterfaceOrientations~ipad' $P || true
plutil -lint $P
```
Expected: `ios/App/App/Info.plist: OK`.

- [ ] **Step 3: iPhone only, version 1.0.0.** In `ios/App/App.xcodeproj/project.pbxproj`, set:
  - every `TARGETED_DEVICE_FAMILY = "1,2";` to `TARGETED_DEVICE_FAMILY = 1;`
  - every `MARKETING_VERSION = …;` to `MARKETING_VERSION = 1.0.0;`

```bash
sed -i '' -e 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/' -e 's/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = 1.0.0;/' ios/App/App.xcodeproj/project.pbxproj
grep -c "TARGETED_DEVICE_FAMILY = 1;" ios/App/App.xcodeproj/project.pbxproj
```
Expected: `2` (Debug and Release).

- [ ] **Step 4: The assets script** `scripts/ios-assets.mjs`

```js
// Regenerates the iOS app's icon and its Splash image. Splash is both the launch screen and, through
// @capacitor/privacy-screen, the app-switcher card, so it is a picture of the real FF14 picker.
// Needs the e2e stack: npm run db:start, npm run db:reset, npm run dev:test (port E2E_PORT, default 5174)
// and npx playwright test --project=setup (for e2e/.auth/alice.json). macOS only (sips).
import { devices, webkit } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const BASE = `http://localhost:${process.env.E2E_PORT ?? 5174}`
const ASSETS = 'ios/App/App/Assets.xcassets'
const ICON = `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`
const SPLASH = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((n) => `${ASSETS}/Splash.imageset/${n}`)

const browser = await webkit.launch()
try {
  // Icon: public/icon.svg at 1024 px. App Store icons may not have an alpha channel, so it goes
  // through JPEG and back to drop it.
  const iconPage = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
  const svg = readFileSync('public/icon.svg').toString('base64')
  await iconPage.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="1024" height="1024" style="display:block"></body>`)
  await iconPage.screenshot({ path: ICON })
  execFileSync('sips', ['-s', 'format', 'jpeg', ICON, '--out', `${ICON}.jpg`], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'png', `${ICON}.jpg`, '--out', ICON], { stdio: 'ignore' })
  rmSync(`${ICON}.jpg`)

  // Splash: the FF14 picker as a signed-in phone shows it in disguise, at iPhone Pro Max size (1290×2796).
  const context = await browser.newContext({
    ...devices['iPhone 15 Pro Max'],
    viewport: { width: 430, height: 932 },
    storageState: 'e2e/.auth/alice.json',
  })
  await context.addInitScript(() => sessionStorage.setItem('eepMode', 'true'))
  const page = await context.newPage()
  await page.goto(BASE)
  await page.getByRole('heading', { name: 'FF14 Random Content Running Agenda Picker' }).waitFor()
  await page.getByRole('button', { name: 'Logout' }).waitFor()
  // On the phone the header sits below the status bar (a 59 pt safe-area inset); the browser has none.
  await page.addStyleTag({ content: 'header { padding-top: 59px !important; }' })
  const png = await page.screenshot()
  for (const file of SPLASH) writeFileSync(file, png)
  console.log(`wrote ${ICON} and ${SPLASH.length} Splash images`)
} finally {
  await browser.close()
}
```

- [ ] **Step 5: Run it**

Run: `npm run db:start && npm run db:reset && (npx vite --mode test --port ${E2E_PORT:-5174} --strictPort &) && npx playwright test --project=setup && npm run ios:assets` (inside the stack lock). Then stop the dev server.
Expected: `wrote … AppIcon-512@2x.png and 3 Splash images`.
Then check:
- `sips -g pixelWidth -g pixelHeight -g hasAlpha ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` shows 1024, 1024 and `hasAlpha: no`
- opening `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` shows the FF14 picker with "Logout | v2.1.4", and nothing from the chat

- [ ] **Step 6: The simulator script** `scripts/ios-sim.sh`

```bash
#!/usr/bin/env bash
# Builds the iOS app and runs it in the simulator. Usage: npm run ios:sim [-- "<simulator name>"]
# The web bundle uses .env + .env.native(.local); for local testing, put the .env.test values (local
# Supabase) and VITE_NATIVE_UPDATE_URL=http://localhost:8080 in .env.native.local.
set -euo pipefail
DEVICE="${1:-iPhone 16 Pro}"
APP_ID=$(grep -o "appId: '[^']*'" capacitor.config.ts | cut -d"'" -f2)

npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build | tail -3
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator
xcrun simctl install "$DEVICE" ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$DEVICE" "$APP_ID"
```

- [ ] **Step 7: Build it**

Run: `npm run ios:sim`
Expected:
- `** BUILD SUCCEEDED **`
- the simulator opens the app
- with the e2e stack running and `.env.native.local` set as described, the FF14 screen or the chat appears (not a blank page)

If the stack isn't running, a blank or "Loading…" screen is acceptable for this task. T8 runs the real checks.

- [ ] **Step 8: Commit** (`ios/.gitignore` keeps the copied web files and DerivedData out)

```bash
git add ios scripts/ios-assets.mjs scripts/ios-sim.sh
git status --short ios | grep -E "public/|DerivedData" && echo "STOP: generated files staged" || true
git commit -m "Add the iOS project: XIV, iPhone portrait, FF14 switcher cover and launch screen, photo and camera texts"
```

---

### Task 8: docs, simulator checks, final verification (lead)

**Files:**
- Create: `docs/ios/testflight-runbook.md`
- Modify: `docs/testing/iphone-checklist.md`, `SETUP.md`, `docs/plans/2026-10-20-ios-app-design.md` (the deviations table above, as a short "Changed while planning" list)

**Dependencies:** all

- [ ] **Step 1: Runbook** `docs/ios/testflight-runbook.md`. It has these sections, each written as numbered steps with exact screens or commands:
  1. **Enrol.** Apple Developer Program, individual: the legal name shows as the team in TestFlight. Note the Team ID.
  2. **Bundle identifier.**
     - Pick one (e.g. reverse-DNS of a domain you own).
     - Set it as `appId` in `capacitor.config.ts`, then run `npx cap sync ios`.
     - In Xcode, set Signing & Capabilities → Team, with automatic signing. Make sure the bundle identifier matches.
  3. **App Store Connect record.** My Apps → + → New App, iOS, name "XIV" (or another neutral name if taken), with the bundle id from step 2 and an SKU.
  4. **Production web bundle in the app.** Put the production `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BUNNY_CDN_URL` and `VITE_NATIVE_UPDATE_URL` in `.env.native.local`. Remove any local-testing values first. Then run `npm run ios:sync`.
  5. **Archive and upload.**
     - Bump `CURRENT_PROJECT_VERSION` (the build number) for every upload.
     - Bump `MARKETING_VERSION` only for a new shell.
     - Xcode → Product → Archive → Distribute App → App Store Connect → Upload.
  6. **Internal testers.** App Store Connect → Users and Access: add the partner as a user (role Developer or Marketing). Then TestFlight → Internal Testing → add a group with both people. They install TestFlight and accept.
  7. **Undoing a bad web release.** Roll forward: revert in git and deploy a new image. Redeploying an old image does nothing for the phones, because they only install newer stamps (see DEPLOY.md).
  8. **Every ~80 days.** TestFlight builds expire after 90 days. Upload a new build (step 5) even if only web code changed.
  9. **When a web change needs a new plugin or native code.**
     - Raise `MARKETING_VERSION` and upload that shell first.
     - Once both phones have it, raise `minNative` in `native-shell.json` to match, then deploy.
     - Older shells skip bundles they can't run.
  10. **Checking an update arrived.** About → Version shows the package version. The live bundle's version is `__BUNDLE_VERSION__`, visible in Safari Web Inspector (Develop menu → the device → the app) as `[updates]` log lines.

- [ ] **Step 2: Checklist.** Append to `docs/testing/iphone-checklist.md` a section "Native app (simulator first, then both iPhones through TestFlight)", with the same table format and these rows:
  1. **App switcher:** with the chat open, swipe up to the switcher. The card shows the FF14 picker, never the chat. Repeat with a sheet open (profile, emoji picker, media viewer) and with the in-app Safari view open from a link.
  2. **Cold start:** the launch screen is the FF14 picker. With a PIN, the app opens on the FF14 page, locked.
  3. **Resume:** background the app, send a message from the other user (desktop), and return. The disguise is up. After unlocking, the message is there without a refresh. Presence shows "online" again within a few seconds.
  4. **Keyboard:** the composer sits on the keyboard with the header in view, the same as checklist item 6.
  5. **Photos:**
     - pick from the library (avatar, Add emoji, composer)
     - take a photo with the camera, and record a video from the composer's camera option
     - the permission prompts use the neutral texts
  6. **Links:** a link in a message opens in the Safari view. Closing it returns to the chat.
  7. **Status bar text:** light on dark themes and the disguise, dark on light themes. It follows a theme switch.
  8. **Live update:** the steps below. The new bundle is applied after backgrounding, and About → Built shows the new date or a visibly changed string.
  9. **Rollback:** the steps below. The app comes back on the previous bundle within about 10 s, and later checks don't download the broken version again.
  10. **Interruptions aren't "background":** with a sheet open (the avatar crop), pull down Control Center and dismiss it, and answer the first photo or camera permission prompt. The sheet is still there and the disguise did not come up.
  11. **Update applied in the background:** queue an update (row 8), with a half-typed message in the box. Then background the app for a minute. Check twice, once as a user with a PIN and once with only the passphrase. On return, the disguise is up in both cases. The other user saw this device go offline and doesn't see it online while it was away. Note whether the half-typed message survived (it may not; record the result).

  Then add the live-update and rollback procedures as numbered steps:

  **Live update procedure (simulator):**
  1. `.env.native.local` = the `.env.test` values plus `VITE_NATIVE_UPDATE_URL=http://localhost:8080`.
  2. Run `npm run ios:sim` (this installs bundle A).
  3. Change a visible string (e.g. the About "Built" label to "Built (B)"), then run `docker compose build` with the same `VITE_*` values exported, and `docker compose up -d`.
  4. Background and resume the app. Background it again and resume. "Built (B)" shows.
  5. Revert the string.

  **Rollback procedure:**
  1. With the container from the live-update procedure running, build a bundle that never renders, on the host:
     ```bash
     B=$(mktemp -d) && echo '<!doctype html><script>throw new Error("bad bundle")</script>' > "$B/index.html"
     (cd "$B" && zip -qX bad.zip index.html)
     SUM=$(shasum -a 256 "$B/bad.zip" | cut -d' ' -f1)
     V="0.1.0-$(date -u +%Y%m%d%H%M%S)"
     docker compose cp "$B/bad.zip" "app:/usr/share/nginx/html/native/bundle-$V.zip"
     printf '{"version":"%s","url":"bundle-%s.zip","checksum":"%s","minNative":"1.0.0"}\n' "$V" "$V" "$SUM" > "$B/latest.json"
     docker compose cp "$B/latest.json" app:/usr/share/nginx/html/native/latest.json
     ```
  2. Background and resume the app, then background and resume it again. The broken bundle loads, and after about 10 s the app comes back on the previous bundle.
  3. Resume once more. Safari Web Inspector shows no new download of that version (the check returns `failed-before`).
  4. `docker compose up -d --build` puts the real bundle back.

- [ ] **Step 3: SETUP.md.** Add an "iOS app (local)" section with:
  - Xcode installed
  - `.env.native.local` as above
  - `npm run ios:sim`
  - `npm run ios:assets` after changing the FF14 screen or the icon
  - Safari → Develop → Simulator for the web inspector
  - a link to the runbook

- [ ] **Step 4: Update the design doc.** Add a short "Changed while planning (2026-10-20)" list to `docs/plans/2026-10-20-ios-app-design.md` with items 1–9 from this plan's deviations table, one line each.

- [ ] **Step 5: Run the simulator checks.**
  - Work through the new checklist rows 1–9 in the simulator against the local stack.
  - Record the date, the simulator model, the iOS version and each result.
  - Rows needing a real camera (5, the camera part) are marked "device only".
  - Fix anything that fails in its own commit, with a unit test where the cause is in TypeScript.

- [ ] **Step 6: Final verification**

```bash
npx tsc -b && npm run lint && npm test
npm run test:db && npm run test:migration
npm run db:reset && npm run e2e
npm run build && ! grep -lE "CapacitorUpdater|PrivacyScreen|appStateChange" dist/assets/*.js
npm run build:native && npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination "platform=iOS Simulator,name=iPhone 16 Pro" -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build | tail -1
VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=x VITE_BUNNY_CDN_URL=x VITE_NATIVE_UPDATE_URL=http://localhost:8080 docker compose build
```
Expected:
- every command passes
- e2e matches 3b (120 passed, 28 skipped)
- `** BUILD SUCCEEDED **`
- the main web bundle size is unchanged from 3b, within 1 KB gzipped

- [ ] **Step 7: Commit**

```bash
git add docs/ios/testflight-runbook.md docs/testing/iphone-checklist.md SETUP.md docs/plans/2026-10-20-ios-app-design.md
git commit -m "Docs for the iOS app: TestFlight runbook, native checklist, local setup"
```

## Known open issues and deferrals

- **Real-device checks** (TestFlight on both iPhones) wait for enrolment. The checklist rows are the same as for the simulator.
- **The in-app Safari view and the switcher cover:** privacy-screen 2.0.1 presents its cover over the topmost presented view controller, so it should cover the Safari view too. Checklist row 1 confirms it on the simulator.
- **Recent emoji and other per-device settings** start empty in the app (a new web view), as on any new device.
