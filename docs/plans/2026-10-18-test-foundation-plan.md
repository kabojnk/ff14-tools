# Test Foundation and PIN Pad Implementation Plan

> **Design:** docs/plans/2026-10-18-test-foundation-design.md
> **Roadmap:** docs/plans/2026-10-18-rework-roadmap.md
> **For agents:** Use team-dev (parallel) or sdd (sequential) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementers follow the `tdd` skill (red → green → refactor).

**Goal:** Give the app a real safety net: local Supabase, Vitest, two-user Playwright on desktop Chromium and iPhone WebKit, and CI. Then use it to rebuild the PIN pad and fix the known bugs: live delivery, the double mount on mobile, and send-after-unlock.

**Architecture:**
- **Database:** the live Supabase schema is pulled once into a baseline migration. `supabase start` recreates it in Docker with a fixed seed (Alice and Bea).
- **Unit and component tests:** Vitest and React Testing Library, with Supabase mocked.
- **End-to-end tests:** Playwright drives two independent browser sessions against real local Realtime.
- **PIN pad:** split into a ref-backed input hook (`usePinEntry`) and a display component (`PinPad`) that never compares PINs itself.
- **Single layout:** the app renders exactly one layout tree (desktop or mobile), chosen by a media-query hook. This stops duplicate realtime subscriptions on phones.

**Tech Stack:** React 18, Vite 6, TypeScript 5.6, Zustand 5, Supabase CLI 2.x (run with `npx --yes supabase@2`, not installed as a dependency, so it stays out of the Docker image), Vitest 3, React Testing Library 16, Playwright 1.51 or later, GitHub Actions.

**Commit convention:** There's no `jig.config.md`. Use short imperative subjects (`Add …`, `Fix …`), and end every commit message with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Production safety:** No task runs `supabase db push`. Pushing migrations to production is a separate, user-run step, and it always starts with `npx --yes supabase@2 db push --dry-run`. See SETUP.md (Task 18).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Dev deps (vitest, RTL, jsdom, playwright) and scripts |
| `vite.config.ts` | Modify | Vitest `test` block |
| `.env.test` | Create | Local Supabase URL and the public local anon key |
| `.gitignore` | Modify | Ignore `e2e/.auth/`, `playwright-report/`, `test-results/` |
| `.dockerignore` | Create | Keep tests, Supabase files and env files out of the production image build |
| `eslint.config.js` | Modify | Ignore Playwright output; Node globals and no React-hooks rules for e2e code |
| `tsconfig.e2e.json`, `tsconfig.json` | Create / Modify | Type-check `e2e/` and `playwright.config.ts` as part of `tsc -b` |
| `src/test/setup.ts` | Create | jest-dom matchers, cleanup, storage reset |
| `src/lib/markdown.test.ts` | Create | Characterisation tests for the markdown parser |
| `src/stores/uiStore.ts` | Modify | `pinLength`, error-aware `setPinCode`, `clearPin` |
| `src/stores/uiStore.test.ts` | Create | Eep, lock and PIN state transitions |
| `src/components/pin/usePinEntry.ts` | Create | Ref-backed digit buffer, lock while verifying, shake timing |
| `src/components/pin/usePinEntry.test.ts` | Create | Hook behaviour for lengths 4, 5 and 6 |
| `src/components/pin/PinPad.tsx` | Rewrite | iOS-style full-screen pad with unlock and set modes |
| `src/components/pin/PinPad.test.tsx` | Create | Component behaviour (fast taps, errors, cancel, keyboard, set flow) |
| `src/index.css` | Modify | `pin-shake` and `pin-pad-exit` keyframes |
| `src/components/eep/EepMode.tsx` | Modify | Use the new `PinPad` unlock mode; clear PIN state on logout |
| `src/components/user/UserSettings.tsx` | Modify | Use the new `PinPad` set and unlock modes; 4–6 digit copy; save errors |
| `src/hooks/useMediaQuery.ts` (+ test) | Create | Reactive `matchMedia` hook |
| `src/components/layout/AppShell.tsx` | Modify | Mount exactly one layout tree (desktop or mobile) |
| `src/hooks/useMessages.ts` | Modify | Per-subscription realtime status; module-level `broadcastNewMessage` |
| `src/components/chat/MessageList.tsx` | Modify | `data-realtime` attribute for test readiness |
| `src/components/chat/MessageInput.tsx` | Modify | Broadcast new messages after insert, for text and GIF (live-delivery fix) |
| `src/stores/messageStore.ts` | Modify | Delete the unused `sendMessage` |
| `supabase/config.toml` | Create | Supabase CLI project config |
| `supabase/migrations/<ts>_remote_schema.sql` | Create (user, via `db pull`) | Baseline: the production schema |
| `supabase/migrations/<ts>_realtime_publication.sql` | Create | Idempotent realtime publication membership |
| `supabase/migrations_archive/*` | Move | Old hand-applied SQL files, kept for reference only |
| `supabase/seed.sql` | Create | Alice, Bea, the general channel, messages, emoji and the passphrase |
| `playwright.config.ts` | Create | Projects, web server, global setup |
| `e2e/users.ts` | Create | Seed constants shared by the e2e code |
| `e2e/global-setup.ts` | Create | Supabase health check and `db reset` |
| `e2e/auth.setup.ts` | Create | Log Alice and Bea in once and save their sessions |
| `e2e/stubs.ts` | Create | Route stubs for GIF search, uploads and the CDN |
| `e2e/fixtures.ts` | Create | `alice`/`bea` fixtures and the `ChatUser` page object |
| `e2e/fixtures/gifs.json`, `e2e/fixtures/media/test-image.png` | Create | Stub payloads |
| `e2e/auth.spec.ts`, `e2e/eep.spec.ts`, `e2e/messaging.spec.ts`, `e2e/pin-lock.spec.ts` | Create | E2E specs |
| `.github/workflows/ci.yml` | Create | `check` and `e2e` jobs |
| `docs/testing/iphone-checklist.md` | Create | Manual on-device checklist |
| `SETUP.md` | Modify | CLI migration workflow (with dry-run), test commands |

## Task Graph

```
T1 ─┬─ T2
    ├─ T3 ──────────┐
    ├─ T4 ─ T5 ─────┴─ T6 ─ T7 ─┐        (T5–T7 land as ONE commit)
    ├─ T8 ──────────────────────┤
    └─ T9* ─ T10 ─ T11 ─────────┴─ T12 ─ T13 ─┬─ T14 ─┐
                                              └─ T15 ─ T16 ─┬─ T17
                                                            └─ T18
```
`*` T9 Step 4 is a **user step** (it needs the database password). Ask the user to do it as soon as T1 lands, so it's ready when T10 starts.

Can run in parallel after T1: {T2, T3, T4, T8, T9}. After T13: {T14, T15}.
Must be sequential:
- T5 → T6 → T7, with a shared commit, because the type check is broken until all three are done.
- T15 → T16. The regression test needs live delivery.
- T16 → T17 and T18. CI needs the full suite; the checklist needs T16's result.

`package.json` and `package-lock.json` are changed only by T1 and T12, which are already in order.

---

### Task 1: Vitest setup

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/test/setup.ts`, `.env.test`

**Dependencies:** none

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest@^3.2.0 jsdom@^26.0.0 @testing-library/react@^16.1.0 @testing-library/dom@^10.4.0 @testing-library/user-event@^14.5.0 @testing-library/jest-dom@^6.6.0
```
Expected: installs without peer-dependency errors.

- [ ] **Step 2: Add the Vitest config to `vite.config.ts`**

Add this line as the very first line of the file:
```ts
/// <reference types="vitest/config" />
```
Then add a `test` block after the `resolve` block (inside `defineConfig({...})`):
```ts
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})
```

- [ ] **Step 4: Create `.env.test`**

Vitest runs in mode `test`, so Vite loads this file; `src/lib/supabase.ts` throws without these vars. The anon key is the public, fixed key every local Supabase CLI stack uses.
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_BUNNY_CDN_URL=http://cdn.test.local
```
Note: `.gitignore` ignores `.env.*.local` only, so `.env.test` is committed. Once Task 9 runs, confirm the key matches `npx --yes supabase@2 status` → "anon key"; if a newer CLI prints a different key, use that.

- [ ] **Step 5: Add scripts to `package.json`**

In `"scripts"` add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 6: Verify the runner works**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found, exiting with code 0`.
Run: `npx tsc -b`
Expected: exit 0, no output. Note: `tsconfig.app.json` includes all of `src/`, so every `*.test.ts(x)` and `src/test/setup.ts` is type-checked by `tsc -b` and `npm run build` under `strict` + `noUnusedLocals`. Keep test files free of unused imports.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test/setup.ts .env.test
git commit -m "Add Vitest and React Testing Library setup"
```

---

### Task 2: Markdown parser characterisation tests

**Files:**
- Test: `src/lib/markdown.test.ts`

**Dependencies:** Task 1

These pin down current behaviour of `parseMarkdown` (which survives the rebuild). No implementation change is expected.

- [ ] **Step 1: Write the tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@/lib/markdown'

describe('parseMarkdown', () => {
  it('returns plain text as a single text segment', () => {
    expect(parseMarkdown('hello')).toEqual([{ type: 'text', content: 'hello' }])
  })

  it('parses bold and italic with surrounding text', () => {
    expect(parseMarkdown('**bold** and *it*')).toEqual([
      { type: 'bold', content: 'bold' },
      { type: 'text', content: ' and ' },
      { type: 'italic', content: 'it' },
    ])
  })

  it('treats double asterisks as bold, not italic', () => {
    expect(parseMarkdown('**x**')).toEqual([{ type: 'bold', content: 'x' }])
  })

  it('parses strikethrough, inline code and spoilers', () => {
    expect(parseMarkdown('~~gone~~ `x = 1` ||secret||')).toEqual([
      { type: 'strikethrough', content: 'gone' },
      { type: 'text', content: ' ' },
      { type: 'code', content: 'x = 1' },
      { type: 'text', content: ' ' },
      { type: 'spoiler', content: 'secret' },
    ])
  })

  it('parses adjacent markers independently', () => {
    expect(parseMarkdown('**a** **b**')).toEqual([
      { type: 'bold', content: 'a' },
      { type: 'text', content: ' ' },
      { type: 'bold', content: 'b' },
    ])
  })

  it('splits lines with newline segments', () => {
    expect(parseMarkdown('a\nb')).toEqual([
      { type: 'text', content: 'a' },
      { type: 'newline', content: '\n' },
      { type: 'text', content: 'b' },
    ])
  })

  it('parses quote lines', () => {
    expect(parseMarkdown('> quoted\nnext')).toEqual([
      { type: 'quote', content: 'quoted' },
      { type: 'newline', content: '\n' },
      { type: 'text', content: 'next' },
    ])
  })

  it('parses fenced code blocks with a language', () => {
    expect(parseMarkdown('```ts\nconst a = 1\n```')).toEqual([
      { type: 'codeblock', content: 'const a = 1\n', language: 'ts' },
    ])
  })

  it('parses fenced code blocks without a language between text', () => {
    expect(parseMarkdown('before ```\ncode\n``` after')).toEqual([
      { type: 'text', content: 'before ' },
      { type: 'codeblock', content: 'code\n', language: undefined },
      { type: 'text', content: ' after' },
    ])
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/lib/markdown.test.ts`
Expected: 9 passed. These are characterisation tests: if one fails, the expectation is wrong about current behaviour — re-read `src/lib/markdown.ts`, correct the expectation, and note the quirk in the commit message. Do not change `markdown.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/markdown.test.ts
git commit -m "Add markdown parser characterisation tests"
```

---

### Task 3: `uiStore`: `pinLength`, error-aware `setPinCode`, `clearPin`

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`

**Dependencies:** Task 1

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSingle, mockUpdateEq } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
      update: () => ({ eq: mockUpdateEq }),
    }),
  },
}))

import { useUiStore } from '@/stores/uiStore'

const initialState = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initialState, true)
  mockSingle.mockReset()
  mockUpdateEq.mockReset().mockResolvedValue({ error: null })
})

describe('uiStore eep mode', () => {
  it('entering eep mode persists to sessionStorage and disguises the title', () => {
    useUiStore.getState().setEepMode(true)
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(sessionStorage.getItem('eepMode')).toBe('true')
    expect(document.title).toBe('FF14 Random Content Picker')
  })

  it('leaving eep mode restores the app title', () => {
    useUiStore.getState().setEepMode(true)
    useUiStore.getState().setEepMode(false)
    expect(useUiStore.getState().eepMode).toBe(false)
    expect(sessionStorage.getItem('eepMode')).toBe('false')
    expect(document.title).toBe('XIV Tools')
  })

  it('lockApp enters eep mode and sets pinLocked; unlockPin clears it', () => {
    useUiStore.getState().lockApp()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    useUiStore.getState().unlockPin()
    expect(useUiStore.getState().pinLocked).toBe(false)
  })
})

describe('uiStore PIN', () => {
  it('loadPin stores the PIN and its length', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin: '567890' }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '567890', pinLength: 6 })
  })

  it('loadPin with no PIN leaves pinLength null', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin: null }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('loadPin with no row clears any previous PIN', async () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4 })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await useUiStore.getState().loadPin('user-2')
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('setPinCode writes the PIN for that user and updates pinLength', async () => {
    await useUiStore.getState().setPinCode('user-1', '12345')
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '12345', pinLength: 5 })
  })

  it('setPinCode(null) clears the PIN', async () => {
    await useUiStore.getState().setPinCode('user-1', '1234')
    await useUiStore.getState().setPinCode('user-1', null)
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('setPinCode rejects and keeps the old PIN when the write fails', async () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4 })
    mockUpdateEq.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(useUiStore.getState().setPinCode('user-1', '999999')).rejects.toThrow('permission denied')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '1234', pinLength: 4 })
  })

  it('clearPin forgets the PIN and any lock (used on logout)', () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4, pinLocked: true })
    useUiStore.getState().clearPin()
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null, pinLocked: false })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: the 3 eep tests pass, and the PIN tests fail because `pinLength` is undefined, `setPinCode` doesn't reject, and `clearPin is not a function`.

- [ ] **Step 3: Implement in `src/stores/uiStore.ts`**

In `interface UiState`, after `pinCode: string | null` add:
```ts
  pinLength: number | null
```
After `setPinCode: (userId: string, pin: string | null) => Promise<void>` add:
```ts
  clearPin: () => void
```
In the initial state, after `pinCode: null,` add:
```ts
  pinLength: null,
```
Replace `loadPin` and `setPinCode` with the code below, and add `clearPin` after them:
```ts
  loadPin: async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('lock_pin')
      .eq('id', userId)
      .single()
    const pin: string | null = data?.lock_pin ?? null
    set({ pinCode: pin, pinLength: pin?.length ?? null })
  },

  // Throws if the write fails, so callers never show "saved" for a PIN that wasn't stored.
  setPinCode: async (userId: string, pin: string | null) => {
    const { error } = await supabase
      .from('profiles')
      .update({ lock_pin: pin })
      .eq('id', userId)
    if (error) throw new Error(error.message)
    set({ pinCode: pin, pinLength: pin?.length ?? null })
  },

  clearPin: () => set({ pinCode: null, pinLength: null, pinLocked: false }),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.test.ts
git commit -m "Track PIN length, surface PIN save errors, clear PIN on logout"
```

---

### Task 4: `usePinEntry` hook

**Files:**
- Create: `src/components/pin/usePinEntry.ts`
- Test: `src/components/pin/usePinEntry.test.ts`

**Dependencies:** Task 1

The digit buffer lives in a ref so taps that land before React re-renders are never lost (the root cause of the current rapid-input bug: `PinPad` builds `next` from a stale `digits` closure).

- [ ] **Step 1: Write the failing tests**

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAKE_MS, usePinEntry } from '@/components/pin/usePinEntry'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const PINS = { 4: '1234', 5: '13579', 6: '567890' } as const

describe.each([4, 5, 6] as const)('usePinEntry (length %i)', (length) => {
  const pin = PINS[length]

  function setup() {
    const onComplete = vi.fn()
    const hook = renderHook(() => usePinEntry({ length, onComplete }))
    return { onComplete, hook }
  }

  it('completes once with the full PIN and locks into verifying', () => {
    const { onComplete, hook } = setup()
    for (const d of pin) act(() => hook.result.current.press(d))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(pin)
    expect(hook.result.current.status).toBe('verifying')
    expect(hook.result.current.count).toBe(length)
    expect(hook.result.current.isLocked()).toBe(true)
  })

  it('does not lose taps that arrive before a re-render', () => {
    const { onComplete, hook } = setup()
    const { press } = hook.result.current
    act(() => {
      for (const d of pin) press(d)
    })
    expect(onComplete).toHaveBeenCalledWith(pin)
    expect(hook.result.current.count).toBe(length)
  })

  it('ignores taps while verifying', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
      hook.result.current.press('9')
      hook.result.current.backspace()
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(hook.result.current.count).toBe(length)
  })

  it('backspace removes the last digit', () => {
    const { onComplete, hook } = setup()
    act(() => {
      hook.result.current.press('1')
      hook.result.current.press('2')
      hook.result.current.backspace()
    })
    expect(hook.result.current.count).toBe(1)
    act(() => {
      for (const d of pin.slice(1)) hook.result.current.press(d)
    })
    expect(onComplete).toHaveBeenCalledWith('1' + pin.slice(1))
  })

  it('fail shows the error, then clears and unlocks after the shake', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.fail())
    expect(hook.result.current.status).toBe('error')
    expect(hook.result.current.count).toBe(length)

    act(() => vi.advanceTimersByTime(SHAKE_MS))
    expect(hook.result.current.status).toBe('idle')
    expect(hook.result.current.count).toBe(0)
    expect(hook.result.current.isLocked()).toBe(false)

    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('reset clears the buffer and unlocks immediately', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.reset())
    expect(hook.result.current).toMatchObject({ status: 'idle', count: 0 })
    act(() => hook.result.current.press('1'))
    expect(hook.result.current.count).toBe(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('succeed marks the entry successful', () => {
    const { hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.succeed())
    expect(hook.result.current.status).toBe('success')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/pin/usePinEntry.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/pin/usePinEntry"`.

- [ ] **Step 3: Implement `src/components/pin/usePinEntry.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export type PinEntryStatus = 'idle' | 'verifying' | 'error' | 'success'

export const SHAKE_MS = 400

interface UsePinEntryOptions {
  length: number
  onComplete: (pin: string) => void
  shakeMs?: number
}

/**
 * Digit buffer for the PIN pad. The buffer lives in a ref so rapid taps that
 * land before React re-renders are never dropped; `count` mirrors it for rendering.
 * Input locks once `length` digits are entered and stays locked until the caller
 * resolves the attempt with `fail`, `succeed` or `reset`.
 */
export function usePinEntry({ length, onComplete, shakeMs = SHAKE_MS }: UsePinEntryOptions) {
  const bufferRef = useRef('')
  const lockedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState<PinEntryStatus>('idle')

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const clearBuffer = useCallback(() => {
    bufferRef.current = ''
    setCount(0)
  }, [])

  const press = useCallback(
    (digit: string) => {
      if (lockedRef.current || bufferRef.current.length >= length) return
      bufferRef.current += digit
      setCount(bufferRef.current.length)
      if (bufferRef.current.length === length) {
        lockedRef.current = true
        setStatus('verifying')
        onCompleteRef.current(bufferRef.current)
      }
    },
    [length],
  )

  const backspace = useCallback(() => {
    if (lockedRef.current) return
    bufferRef.current = bufferRef.current.slice(0, -1)
    setCount(bufferRef.current.length)
  }, [])

  const fail = useCallback(() => {
    setStatus('error')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      clearBuffer()
      lockedRef.current = false
      setStatus('idle')
    }, shakeMs)
  }, [clearBuffer, shakeMs])

  const succeed = useCallback(() => setStatus('success'), [])

  const reset = useCallback(() => {
    clearTimeout(timerRef.current)
    clearBuffer()
    lockedRef.current = false
    setStatus('idle')
  }, [clearBuffer])

  // True from completion until fail/reset settles; lets callers ignore Cancel mid-verify.
  const isLocked = useCallback(() => lockedRef.current, [])

  return { count, status, press, backspace, fail, succeed, reset, isLocked }
}
```
Note: `onCompleteRef` is synced in an effect. `press` reads it at call time, and the first `press` always runs after mount, so the ref is never stale in practice.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/pin/usePinEntry.test.ts`
Expected: 21 passed (7 tests × 3 lengths).

- [ ] **Step 5: Commit**

```bash
git add src/components/pin/usePinEntry.ts src/components/pin/usePinEntry.test.ts
git commit -m "Add ref-backed usePinEntry hook for reliable rapid PIN input"
```

---

### Task 5: iOS-style `PinPad` component

**Files:**
- Rewrite: `src/components/pin/PinPad.tsx`
- Modify: `src/index.css`
- Test: `src/components/pin/PinPad.test.tsx`

**Dependencies:** Task 4

**Do not commit at the end of this task.** Tasks 5, 6 and 7 land as one commit at the end of Task 7, because the type check stays broken until both screens that use the PIN pad are migrated. For this task, run only Vitest.

- [ ] **Step 1: Write the failing tests**

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PinPad } from '@/components/pin/PinPad'

function tap(keys: string) {
  act(() => {
    for (const k of keys) fireEvent.pointerDown(screen.getByRole('button', { name: k }))
  })
}

const dots = () => screen.getByTestId('pin-dots')

const PINS = { 4: '1234', 5: '13579', 6: '567890' } as const

describe.each([4, 5, 6] as const)('PinPad unlock (length %i)', (length) => {
  const pin = PINS[length]

  it('shows one dot per digit', () => {
    render(<PinPad mode="unlock" length={length} verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(dots().children).toHaveLength(length)
  })

  it('verifies once with every rapidly tapped digit', async () => {
    const verify = vi.fn().mockResolvedValue(true)
    const onSuccess = vi.fn()
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={onSuccess} />)
    tap(pin)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledWith(pin)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(pin))
  })

  it('ignores extra taps while verifying', () => {
    const verify = vi.fn(() => new Promise<boolean>(() => {}))
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={vi.fn()} />)
    tap(pin + '1')
    expect(verify).toHaveBeenCalledTimes(1)
    expect(dots()).toHaveAttribute('data-filled', String(length))
  })

  it('shakes and clears on a wrong PIN, then accepts the right one', async () => {
    const verify = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onSuccess = vi.fn()
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={onSuccess} />)
    tap('0'.repeat(length))
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'error'))
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(dots()).toHaveAttribute('data-filled', '0')
    tap(pin)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(pin))
  })
})

describe('PinPad unlock controls', () => {
  it('switches the bottom-right button between Cancel and Delete', () => {
    const onCancel = vi.fn()
    render(<PinPad mode="unlock" length={4} verify={vi.fn()} onSuccess={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    tap('1')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Delete' }))
    expect(dots()).toHaveAttribute('data-filled', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hides Cancel when no onCancel is given', () => {
    render(<PinPad mode="unlock" length={4} verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('reports a verification error, unlocks input, and clears the message on the next tap', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('network'))
    render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={vi.fn()} />)
    tap('1234')
    expect(await screen.findByText("Couldn't verify. Try again.")).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    tap('1')
    expect(dots()).toHaveAttribute('data-filled', '1')
    expect(screen.queryByText("Couldn't verify. Try again.")).not.toBeInTheDocument()
  })

  it('accepts digits, Backspace and Escape from a hardware keyboard', () => {
    const verify = vi.fn(() => new Promise<boolean>(() => {}))
    const onCancel = vi.fn()
    render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: '9' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(dots()).toHaveAttribute('data-filled', '0')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    for (const k of '4321') fireEvent.keyDown(window, { key: k })
    expect(verify).toHaveBeenCalledWith('4321')
  })

  it('ignores Escape while a PIN is being verified', () => {
    const onCancel = vi.fn()
    render(
      <PinPad mode="unlock" length={4} verify={() => new Promise<boolean>(() => {})} onSuccess={vi.fn()} onCancel={onCancel} />,
    )
    tap('1234')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('never calls onSuccess if it is closed before verification finishes', async () => {
    let resolveVerify: (ok: boolean) => void = () => {}
    const verify = () => new Promise<boolean>((r) => { resolveVerify = r })
    const onSuccess = vi.fn()
    const { unmount } = render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={onSuccess} />)
    tap('1234')
    unmount()
    await act(async () => resolveVerify(true))
    await new Promise((r) => setTimeout(r, 300))
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('comes back usable with a message if onSuccess fails (e.g. the PIN could not be saved)', async () => {
    const onSuccess = vi.fn().mockRejectedValue(new Error('permission denied'))
    render(<PinPad mode="unlock" length={4} verify={vi.fn().mockResolvedValue(true)} onSuccess={onSuccess} />)
    tap('1234')
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(screen.getByRole('dialog')).not.toHaveClass('pin-pad-exit')
    tap('1')
    expect(dots()).toHaveAttribute('data-filled', '1')
  })

  it('uses a custom title when given', () => {
    render(<PinPad mode="unlock" length={4} title="Enter Current Passcode" verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByText('Enter Current Passcode')).toBeInTheDocument()
  })
})

describe('PinPad set mode', () => {
  it('defaults to 6 digits and lets the user pick 4 via Passcode Options', () => {
    render(<PinPad mode="set" onSuccess={vi.fn()} />)
    expect(screen.getByText('Enter New Passcode')).toBeInTheDocument()
    expect(dots().children).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Passcode Options' }))
    fireEvent.click(screen.getByRole('button', { name: '4-Digit Numeric Code' }))
    expect(dots().children).toHaveLength(4)
  })

  it('calls onSuccess when the confirmation matches', async () => {
    const onSuccess = vi.fn()
    render(<PinPad mode="set" onSuccess={onSuccess} />)
    tap('123456')
    expect(screen.getByText('Confirm New Passcode')).toBeInTheDocument()
    expect(dots()).toHaveAttribute('data-filled', '0')
    tap('123456')
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('123456'))
  })

  it('restarts with a message when the confirmation does not match', async () => {
    const onSuccess = vi.fn()
    render(<PinPad mode="set" onSuccess={onSuccess} />)
    tap('123456')
    tap('654321')
    expect(await screen.findByText('Passcodes did not match. Try again.')).toBeInTheDocument()
    expect(screen.getByText('Enter New Passcode')).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/pin/PinPad.test.tsx`
Expected: FAIL, e.g. `Unable to find an element by: [data-testid="pin-dots"]`.

- [ ] **Step 3: Add the animations to `src/index.css`**

Append at the end of the file:
```css
/* PIN pad: iOS-style wrong-passcode shake and dismiss */
@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-14px); }
  30% { transform: translateX(12px); }
  45% { transform: translateX(-9px); }
  60% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}
.pin-shake {
  animation: pin-shake 400ms ease-out;
}

@keyframes pin-pad-exit {
  to { opacity: 0; transform: scale(1.08); }
}
.pin-pad-exit {
  animation: pin-pad-exit 250ms ease-in forwards;
}

@media (prefers-reduced-motion: reduce) {
  .pin-shake,
  .pin-pad-exit {
    animation: none;
  }
}
```

- [ ] **Step 4: Rewrite `src/components/pin/PinPad.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { SHAKE_MS, usePinEntry } from '@/components/pin/usePinEntry'

/** Lengths offered when setting a new PIN. */
export type PinLength = 4 | 5 | 6

interface PinPadProps {
  mode: 'unlock' | 'set'
  /** Required in unlock mode: the stored PIN's length. Set mode lets the user choose (default 6). */
  length?: number
  /** Unlock mode: resolves true when the PIN is correct. The pad never compares PINs itself. */
  verify?: (pin: string) => Promise<boolean>
  /**
   * Unlock: the accepted PIN. Set: the confirmed new PIN.
   * If it returns a rejected promise, the pad stays open, shows "Couldn't save. Try again." and accepts input again.
   */
  onSuccess: (pin: string) => void | Promise<void>
  onCancel?: () => void
  title?: string
}

const SUCCESS_MS = 250

const KEYS: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
]

const LENGTH_OPTIONS: PinLength[] = [4, 5, 6]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function PinPad({ mode, length = 6, verify, onSuccess, onCancel, title }: PinPadProps) {
  const reduceMotion = prefersReducedMotion()
  const [chosenLength, setChosenLength] = useState<PinLength>(6)
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [message, setMessage] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const firstPinRef = useRef<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)
  const entryRef = useRef<ReturnType<typeof usePinEntry> | null>(null)

  const activeLength = mode === 'set' ? chosenLength : length

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(successTimerRef.current)
    }
  }, [])

  const finish = useCallback(
    (pin: string) => {
      entryRef.current?.succeed()
      successTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        Promise.resolve(onSuccess(pin)).catch(() => {
          if (!mountedRef.current) return
          firstPinRef.current = null
          setStep('enter')
          setMessage("Couldn't save. Try again.")
          entryRef.current?.fail()
        })
      }, reduceMotion ? 0 : SUCCESS_MS)
    },
    [onSuccess, reduceMotion],
  )

  const handleComplete = useCallback(
    (pin: string) => {
      const entry = entryRef.current
      if (!entry) return

      if (mode === 'unlock') {
        if (!verify) return
        verify(pin)
          .then((ok) => {
            if (!mountedRef.current) return
            setMessage(null)
            if (ok) finish(pin)
            else entryRef.current?.fail()
          })
          .catch(() => {
            if (!mountedRef.current) return
            setMessage("Couldn't verify. Try again.")
            entryRef.current?.fail()
          })
        return
      }

      if (firstPinRef.current === null) {
        firstPinRef.current = pin
        setMessage(null)
        entry.reset()
        setStep('confirm')
        return
      }

      if (pin === firstPinRef.current) {
        finish(pin)
      } else {
        firstPinRef.current = null
        setMessage('Passcodes did not match. Try again.')
        setStep('enter')
        entry.fail()
      }
    },
    [mode, verify, finish],
  )

  const entry = usePinEntry({
    length: activeLength,
    onComplete: handleComplete,
    shakeMs: reduceMotion ? 0 : SHAKE_MS,
  })
  entryRef.current = entry

  const pressDigit = useCallback((digit: string) => {
    const current = entryRef.current
    if (!current || current.isLocked()) return
    setMessage(null)
    current.press(digit)
  }, [])

  const cancel = useCallback(() => {
    // Once a PIN is being verified (or has succeeded), the result stands; ignore Cancel.
    if (entryRef.current?.isLocked()) return
    onCancel?.()
  }, [onCancel])

  // Hardware keyboard support (desktop)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') entryRef.current?.backspace()
      else if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pressDigit, cancel])

  const chooseLength = (next: PinLength) => {
    setChosenLength(next)
    setShowOptions(false)
    entry.reset()
  }

  const heading =
    title ??
    (mode === 'unlock' ? 'Enter Passcode' : step === 'enter' ? 'Enter New Passcode' : 'Confirm New Passcode')

  const keyDown = (digit: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    setFlashKey(digit)
    pressDigit(digit)
  }
  const keyUp = () => setFlashKey(null)

  const renderKey = (digit: string, letters: string) => (
    <button
      key={digit}
      type="button"
      aria-label={digit}
      data-pin-key={digit}
      onPointerDown={keyDown(digit)}
      onPointerUp={keyUp}
      onPointerLeave={keyUp}
      onPointerCancel={keyUp}
      className={`relative flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full text-white transition-colors duration-100 before:absolute before:-inset-2 before:content-[''] ${
        flashKey === digit ? 'bg-white/45' : 'bg-white/15'
      }`}
    >
      <span className="text-[34px] font-light leading-none">{digit}</span>
      <span className="mt-0.5 h-3 text-[10px] font-semibold tracking-[0.2em]">{letters}</span>
    </button>
  )

  const showOptionsLink = mode === 'set' && step === 'enter' && entry.count === 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className={`fixed inset-0 z-[70] flex select-none flex-col items-center justify-center bg-black/55 backdrop-blur-2xl ${
        entry.status === 'success' ? 'pin-pad-exit' : ''
      }`}
      style={{
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Lock glyph */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>

      <p className="mt-3 text-[20px] font-normal text-white">{heading}</p>

      <div
        data-testid="pin-dots"
        data-state={entry.status}
        data-filled={entry.count}
        className={`mt-5 flex gap-4 ${entry.status === 'error' ? 'pin-shake' : ''}`}
      >
        {Array.from({ length: activeLength }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-[1.5px] border-white ${i < entry.count ? 'bg-white' : 'bg-transparent'}`}
          />
        ))}
      </div>

      <p role="status" aria-live="polite" className="mt-3 h-5 text-sm text-white/80">
        {message ?? ''}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-4">
        {KEYS.map(({ digit, letters }) => renderKey(digit, letters))}
        <div />
        {renderKey('0', '')}
        {entry.count > 0 ? (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              entry.backspace()
            }}
            className="h-[78px] w-[78px] text-[17px] text-white"
          >
            Delete
          </button>
        ) : onCancel ? (
          <button type="button" onClick={cancel} className="h-[78px] w-[78px] text-[17px] text-white">
            Cancel
          </button>
        ) : (
          <div />
        )}
      </div>

      <div className="mt-6 h-10">
        {showOptionsLink && (
          <div className="relative flex flex-col items-center">
            <button type="button" onClick={() => setShowOptions((s) => !s)} className="text-[15px] text-white">
              Passcode Options
            </button>
            {showOptions && (
              <div className="absolute bottom-8 w-60 overflow-hidden rounded-xl bg-neutral-800/95 text-white shadow-xl">
                {LENGTH_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => chooseLength(n)}
                    className="block w-full border-b border-white/10 px-4 py-3 text-center text-[15px] last:border-b-0 hover:bg-white/10"
                  >
                    {n}-Digit Numeric Code
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```
Notes:
- `entryRef.current = entry` during render is deliberate. The completion and keyboard handlers run after render, so they always see the current entry.
- `mountedRef` stops a late `verify` or `onSuccess` result from acting after the pad has closed.
- The `before:-inset-2` pseudo-element gives every key a touch area larger than its visible circle.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/pin/`
Expected: `PinPad.test.tsx` passes 23 tests (12 unlock tests across the three lengths, 8 controls, 3 set mode), and `usePinEntry.test.ts` passes 21.

- [ ] **Step 6: Don't commit.** Continue to Task 6. Tasks 5–7 are committed together at the end of Task 7.

---

### Task 6: Wire `EepMode` to the new PIN pad

**Files:**
- Modify: `src/components/eep/EepMode.tsx`

**Dependencies:** Tasks 3, 5

- [ ] **Step 1: Update the store usage**

Replace:
```tsx
  const { setEepMode, eepPassphrase, pinCode, pinLocked, unlockPin } = useUiStore()
```
with:
```tsx
  const { setEepMode, eepPassphrase, pinCode, pinLength, pinLocked, unlockPin, clearPin } = useUiStore()
```
Delete the line:
```tsx
  const [pinError, setPinError] = useState(false)
```

- [ ] **Step 2: Clear the PIN on logout**

Replace:
```tsx
  const handleLogout = async () => {
    await signOut()
```
with:
```tsx
  const handleLogout = async () => {
    await signOut()
    clearPin()
```

- [ ] **Step 3: Replace `handlePinComplete`**

Replace the whole `handlePinComplete` function with:
```tsx
  const verifyPin = async (pin: string) => pin === pinCode

  const handlePinSuccess = () => {
    if (pinLocked) unlockPin()
    setShowPinPad(false)
    setEepMode(false)
  }
```

- [ ] **Step 4: Replace the PIN overlay JSX**

Replace:
```tsx
      {/* PIN overlay */}
      {overlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <PinPad
            title="Enter PIN"
            error={pinError}
            onComplete={handlePinComplete}
            onCancel={pinLocked ? undefined : () => setShowPinPad(false)}
          />
        </div>
      )}
```
with:
```tsx
      {/* PIN overlay: PinPad renders its own full-screen blurred backdrop.
          pinLength is the stored PIN's actual length, so any stored PIN (including legacy ones) can be entered. */}
      {overlayVisible && pinLength !== null && (
        <PinPad
          mode="unlock"
          length={pinLength}
          verify={verifyPin}
          onSuccess={handlePinSuccess}
          onCancel={pinLocked ? undefined : () => setShowPinPad(false)}
        />
      )}
```
(The Unlock dot is already only rendered when `pinCode` is set, so `pinLength` is non-null whenever the dot can open the pad.)

- [ ] **Step 5: Lint this file**

Run: `npx eslint src/components/eep/EepMode.tsx`
Expected: no errors. Don't commit yet; `UserSettings.tsx` still uses the old props until Task 7.

---

### Task 7: Wire `UserSettings` to the new PIN pad, then commit Tasks 5–7

**Files:**
- Modify: `src/components/user/UserSettings.tsx`

**Dependencies:** Task 6

- [ ] **Step 1: Update the `PinStep` type and imports**

Replace the whole `type PinStep = ...` declaration with:
```tsx
type PinStep = 'idle' | 'set' | 'change-verify' | 'change-set' | 'remove-verify'
```
Change the first import line to:
```tsx
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 2: Replace the PIN wizard state and handlers**

Change:
```tsx
  const { theme, setTheme, pinCode, setPinCode } = useUiStore()
```
to:
```tsx
  const { theme, setTheme, pinCode, pinLength, setPinCode } = useUiStore()
```
Replace everything from `const [pinStep, setPinStep] = useState<PinStep>('idle')` through the closing `}` of `const pinPadSubtitle = {...}` with:
```tsx
  const [pinStep, setPinStep] = useState<PinStep>('idle')
  const [pinSuccess, setPinSuccess] = useState<string | null>(null)
  const pinSuccessTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(pinSuccessTimerRef.current), [])

  const resetPinWizard = () => {
    clearTimeout(pinSuccessTimerRef.current)
    setPinStep('idle')
    setPinSuccess(null)
  }

  const finishPinWizard = (message: string) => {
    clearTimeout(pinSuccessTimerRef.current)
    setPinStep('idle')
    setPinSuccess(message)
    pinSuccessTimerRef.current = setTimeout(() => setPinSuccess(null), 2500)
  }

  const verifyCurrentPin = async (pin: string) => pin === pinCode

  // Errors propagate to PinPad, which stays open and shows "Couldn't save. Try again."
  const handlePinSuccess = async (pin: string) => {
    if (!profile) throw new Error('Not signed in')
    switch (pinStep) {
      case 'set':
        await setPinCode(profile.id, pin)
        finishPinWizard('PIN set successfully')
        break
      case 'change-verify':
        setPinStep('change-set')
        break
      case 'change-set':
        await setPinCode(profile.id, pin)
        finishPinWizard('PIN changed successfully')
        break
      case 'remove-verify':
        await setPinCode(profile.id, null)
        finishPinWizard('PIN removed')
        break
    }
  }
```

- [ ] **Step 3: Update the security copy and the Set button**

Replace:
```tsx
          ? 'A 4-digit PIN is required to unlock the app after it goes to the background.'
          : 'Set a 4-digit PIN to lock the app when it loses focus.'}
```
with:
```tsx
          ? 'A 4–6 digit PIN is required to unlock the app after it goes to the background.'
          : 'Set a 4–6 digit PIN to lock the app when it loses focus.'}
```
Replace:
```tsx
            onClick={() => setPinStep('set-new')}
```
with:
```tsx
            onClick={() => setPinStep('set')}
```

- [ ] **Step 4: Replace the PIN modal JSX**

Replace:
```tsx
      {/* PIN entry modal — sits above both mobile and desktop layouts */}
      {pinStep !== 'idle' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
          <PinPad
            key={pinStep}
            title={pinPadTitle[pinStep]}
            subtitle={pinPadSubtitle[pinStep]}
            error={pinError}
            onComplete={handlePinComplete}
            onCancel={resetPinWizard}
          />
        </div>
      )}
```
with:
```tsx
      {/* PIN entry: PinPad is full-screen (z-70) above both mobile and desktop layouts */}
      {(pinStep === 'set' || pinStep === 'change-set') && (
        <PinPad key={pinStep} mode="set" onSuccess={handlePinSuccess} onCancel={resetPinWizard} />
      )}
      {(pinStep === 'change-verify' || pinStep === 'remove-verify') && pinLength !== null && (
        <PinPad
          key={pinStep}
          mode="unlock"
          length={pinLength}
          title="Enter Current Passcode"
          verify={verifyCurrentPin}
          onSuccess={handlePinSuccess}
          onCancel={resetPinWizard}
        />
      )}
```
(Change and Remove buttons only render when `pinCode` is set, so `pinLength` is non-null in those steps.)

- [ ] **Step 5: Verify the whole app type-checks, lints and tests**

Run: `npx tsc -b && npm run lint && npm test`
Expected: tsc exits 0; lint shows 0 errors (the existing 6 warnings are acceptable); all Vitest tests pass.

- [ ] **Step 6: Manual smoke test (optional; needs your existing `.env`)**

Run `npm run dev`. Settings → Security → Set PIN → choose 4 under Passcode Options → enter and confirm → "PIN set successfully". Switch the app to the background, then unlock with the blue dot.

- [ ] **Step 7: Commit Tasks 5–7 together**

```bash
git add src/components/pin/PinPad.tsx src/components/pin/PinPad.test.tsx src/index.css src/components/eep/EepMode.tsx src/components/user/UserSettings.tsx
git commit -m "Rebuild PinPad as iOS-style passcode screen (4–6 digits) and adopt it in Eep and settings"
```

---

### Task 8: Render one layout at a time (fixes duplicate chat on phones)

**Files:**
- Create: `src/hooks/useMediaQuery.ts`, `src/hooks/useMediaQuery.test.ts`
- Modify: `src/components/layout/AppShell.tsx`

**Dependencies:** Task 1

**Why:** `AppShell` mounts the desktop tree (`hidden md:flex`) *and* the mobile tree (`md:hidden`). CSS hides one of them, but both stay mounted. On a phone, the hidden desktop `MessageList`/`MessageInput` subscribe to `channel:<id>` alongside the mobile ones. realtime-js hands both the *same* channel object, so when either one unmounts (StrictMode in dev, or switching views) it tears down the channel the other one is using, and nothing rejoins. Live delivery on iPhone breaks, and every e2e locator finds two composers.

- [ ] **Step 1: Write the failing test `src/hooks/useMediaQuery.test.ts`**

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initial,
    addEventListener: (_: 'change', l: Listener) => listeners.add(l),
    removeEventListener: (_: 'change', l: Listener) => listeners.delete(l),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    change(matches: boolean) {
      mql.matches = matches
      listeners.forEach((l) => l({ matches }))
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('useMediaQuery', () => {
  it('returns the current match', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the media query changes', () => {
    const mq = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
    act(() => mq.change(true))
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const mq = mockMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(mq.listenerCount()).toBe(1)
    unmount()
    expect(mq.listenerCount()).toBe(0)
  })

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/useMediaQuery.test.ts`
Expected: FAIL with `Failed to resolve import "@/hooks/useMediaQuery"`.

- [ ] **Step 3: Implement `src/hooks/useMediaQuery.ts`**

```ts
import { useSyncExternalStore } from 'react'

function getMatch(query: string) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/** Reactive `matchMedia`: re-renders when the query starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => getMatch(query),
    () => false,
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/hooks/useMediaQuery.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Make `AppShell` mount exactly one tree**

In `src/components/layout/AppShell.tsx`:
1. Add the import `import { useMediaQuery } from '@/hooks/useMediaQuery'`. As the first line inside `AppShell()`, add:
   ```tsx
   // Tailwind's md breakpoint. Only one layout tree is mounted, so chat hooks
   // (realtime channels, typing, pins) never run twice on the same device.
   const isDesktop = useMediaQuery('(min-width: 768px)')
   ```
2. Replace `<div className="hidden flex-1 overflow-hidden md:flex">` with `{isDesktop && (<div className="flex flex-1 overflow-hidden">`. Replace that div's closing `</div>`, which comes just before the `{/* ── Mobile layout` comment, with `</div>)}`.
3. Replace `<div className="flex flex-1 flex-col overflow-hidden md:hidden">` with `{!isDesktop && (<div className="flex flex-1 flex-col overflow-hidden">`. Replace that div's closing `</div>`, which comes just before `<EepShortcutListener`, with `</div>)}`.
4. Move the `{/* Channel info panel overlay — mobile + desktop */}` block, currently inside the mobile tree, out to just before `<EepShortcutListener`, so it renders in both layouts:
   ```tsx
      {/* Channel info panel overlay — mobile + desktop */}
      {showChannelInfo && activeChannel && (
        <ChannelInfoPanel
          channel={activeChannel}
          initialTab={channelInfoTab}
          onClose={() => setShowChannelInfo(false)}
        />
      )}
   ```

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npm run lint && npm test`
Expected: all green.
Manual check: `npm run dev`. In DevTools device mode (iPhone, 393 px), open general. Run `document.querySelectorAll('textarea').length` in the console. Expected: `1`. Resize past 768 px and the desktop layout appears. Expected: still `1`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useMediaQuery.ts src/hooks/useMediaQuery.test.ts src/components/layout/AppShell.tsx
git commit -m "Mount only one layout tree so chat hooks never run twice on phones"
```

---

### Task 9: Adopt Supabase CLI and pull the production baseline

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/<ts>_remote_schema.sql`
- Move: `supabase/migrations/*.sql` → `supabase/migrations_archive/`

**Dependencies:** Task 1 (it updates `.env.test`). Docker must be running.

The CLI is **not** added to `package.json`. It runs through `npx --yes supabase@2`, so its postinstall binary download never reaches the production Docker build.

- [ ] **Step 1: Initialise**

Run:
```bash
npx --yes supabase@2 init
```
Answer **N** to the VS Code and IntelliJ settings prompts.
Expected: `Finished supabase init.` and `supabase/config.toml` exists.

- [ ] **Step 2: Set the project id and seed path in `supabase/config.toml`**

Set `project_id = "ff14-tools"` at the top. Confirm the `[db.seed]` section reads:
```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

- [ ] **Step 3: Archive the hand-applied migrations**

```bash
mkdir -p supabase/migrations_archive
git mv supabase/migrations/*.sql supabase/migrations_archive/
```
Expected: `supabase/migrations/` is empty.

- [ ] **Step 4: 🧑 USER STEP — link and pull the live schema**

The user runs this, because it needs the database password (Dashboard → Project Settings → Database):
```bash
npx --yes supabase@2 login
npx --yes supabase@2 link --project-ref <YOUR_PROJECT_REF>
npx --yes supabase@2 db pull
```
If asked **"Update remote migration history table? [Y/n]"**, answer **Y**. This marks the baseline as already applied in production, so `db push` never re-runs it. The prompt wording varies between CLI versions.
Expected: `supabase/migrations/<timestamp>_remote_schema.sql` is created. Make sure the project ref you linked is **production**.

Then confirm the history:
```bash
npx --yes supabase@2 migration list
```
Expected: the baseline timestamp appears in **both** the Local and Remote columns. If Remote is empty for it, run:
```bash
npx --yes supabase@2 migration repair --status applied <baseline_timestamp>
```
This only writes migration-history metadata; it doesn't touch the schema or data. To undo it, run `migration repair --status reverted <baseline_timestamp>`.

- [ ] **Step 5: Audit the pulled baseline**

Run:
```bash
F=$(ls supabase/migrations/*_remote_schema.sql)
for s in 'create table "public"."profiles"' '"public"."channels"' '"public"."sessions"' '"public"."messages"' '"public"."reactions"' '"public"."custom_emoji"' '"public"."settings"' 'pinned_messages' 'change_sheets' 'get_channel_messages' 'lock_pin' 'banner_url' 'profiles_status_check' 'replica identity full' 'enable row level security'; do
  grep -qi "$s" "$F" && echo "OK   $s" || echo "MISS $s"
done
grep -i "supabase_realtime" "$F" || echo "NOTE realtime publication not in dump (Task 10 handles it)"
grep -i "on_auth_user_created" "$F" || echo "NOTE auth trigger not in dump (see Step 6)"
grep -iE "passphrase|password|secret|api[_-]?key" "$F" || echo "OK   no secrets"
```
Expected: every table/function line prints `OK`. If any table or function prints `MISS`, stop and tell the user. Production differs from expectations, and the seed in Task 11 needs adjusting.

- [ ] **Step 6: 🧑 USER STEP: check production's signup trigger before writing anything**

`db pull` often leaves out triggers on `auth.users`. Whatever we add must match production exactly, or it changes production the next time anyone pushes. In the Supabase dashboard's SQL editor (read-only queries), the user runs:
```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
select pg_get_functiondef('public.handle_new_user'::regproc);
```
Then follow whichever case applies:
- **The dump already contains `on_auth_user_created`:** nothing to do.
- **Production has the trigger but the dump doesn't:** create `supabase/migrations/<baseline_ts + 1s>_auth_user_trigger.sql`, containing exactly the function definition returned above, followed by:
  ```sql
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```
  Because it matches production, pushing it later is a no-op. It stays *pending* in production until the user pushes it.
- **Production has no trigger:** don't add a migration. Profiles are created by `seed.sql` locally (Task 11 upserts them), and production behaviour is unchanged.

- [ ] **Step 7: Verify locally**

Run: `npx --yes supabase@2 start`
Expected: the services start and print the API URL `http://127.0.0.1:54321` and an anon key. Compare the anon key with `.env.test` and update `.env.test` if it differs.
Run: `npx --yes supabase@2 db reset`
Expected: `Finished supabase db reset` with no SQL errors. A "seed file not found" warning is fine until Task 11.

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/migrations_archive .env.test
git commit -m "Adopt Supabase CLI with production schema baseline"
```
Make sure `supabase/.temp/` (which holds the linked project ref) isn't staged. `supabase init` adds it to `supabase/.gitignore`.

---

### Task 10: Idempotent realtime publication migration

**Files:**
- Create: `supabase/migrations/<timestamp>_realtime_publication.sql`

**Dependencies:** Task 9

The app subscribes to `postgres_changes` on `profiles`, `reactions` and `pinned_messages`, and SETUP.md says `messages` is enabled too. This migration guarantees that locally, and is a no-op in production if those tables are already members.

- [ ] **Step 1: Create the migration**

Run `npx --yes supabase@2 migration new realtime_publication`. Then put this in the created file:
```sql
-- Ensure realtime publication membership matches what the app subscribes to.
-- Idempotent: only adds tables that are not already in the publication.
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'profiles', 'reactions', 'pinned_messages'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
```

- [ ] **Step 2: Verify**

Run: `npx --yes supabase@2 db reset`, then
```bash
docker exec supabase_db_ff14-tools psql -U postgres -tAc "select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1"
```
Expected output includes `messages`, `pinned_messages`, `profiles` and `reactions`.

- [ ] **Step 3: Commit.** This migration is now *pending* in production. Do **not** push it. Pushing is a separate user step that starts with `npx --yes supabase@2 db push --dry-run` and a review of the pending list. Before pushing, the user can see what it would change with a read-only query in the dashboard: `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`.

```bash
git add supabase/migrations/*_realtime_publication.sql
git commit -m "Add idempotent realtime publication migration"
```

---

### Task 11: Seed data

**Files:**
- Create: `supabase/seed.sql`

**Dependencies:** Task 10

- [ ] **Step 1: Create `supabase/seed.sql`**

```sql
-- Local/CI seed only. Never pushed to production (db push applies migrations, not seed).
-- Empty-string token columns: GoTrue fails login with "converting NULL to string" if they are NULL.
-- If a column here doesn't exist in your local auth schema (older CLI image), remove it from both lists.
-- Fixed UUIDs so e2e tests can reference rows directly.

-- Users: alice@test.local / password123 (PIN 1234), bea@test.local / password123 (PIN 567890)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'alice@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nickname":"Alice"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'bea@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nickname":"Bea"}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   '{"sub":"11111111-1111-4111-8111-111111111111","email":"alice@test.local"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   '{"sub":"22222222-2222-4222-8222-222222222222","email":"bea@test.local"}', 'email', now(), now(), now());

-- Profiles (upsert: works whether or not the signup trigger already created them)
insert into public.profiles (id, nickname, status, lock_pin) values
  ('11111111-1111-4111-8111-111111111111', 'Alice', 'offline', '1234'),
  ('22222222-2222-4222-8222-222222222222', 'Bea', 'offline', '567890')
on conflict (id) do update set nickname = excluded.nickname, lock_pin = excluded.lock_pin;

-- Channel + visible session
insert into public.channels (id, name, description, position, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'general', 'General discussion', 0, '11111111-1111-4111-8111-111111111111')
on conflict (name) do nothing;

insert into public.sessions (id, channel_id, visible, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true, '11111111-1111-4111-8111-111111111111');

-- A little history
insert into public.messages (id, channel_id, session_id, author_id, content, created_at) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: hi Bea', now() - interval '3 minutes'),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: hey **Alice**', now() - interval '2 minutes'),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: pinned note', now() - interval '1 minute');

insert into public.reactions (message_id, user_id, emoji) values
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '❤️');

insert into public.pinned_messages (channel_id, message_id, pinned_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111');

-- Custom emoji (served by the e2e CDN stub)
insert into public.custom_emoji (name, image_url, uploaded_by) values
  ('moogle', 'http://cdn.test.local/emoji/moogle.png', '11111111-1111-4111-8111-111111111111'),
  ('chocobo', 'http://cdn.test.local/emoji/chocobo.png', '22222222-2222-4222-8222-222222222222');

-- Eep passphrase (test value only)
insert into public.settings (key, value) values ('eep_passphrase', 'test-passphrase')
on conflict (key) do update set value = excluded.value;
```

- [ ] **Step 2: Verify**

Run: `npx --yes supabase@2 db reset`
Expected: `Seeding data from supabase/seed.sql...` then `Finished supabase db reset` with no errors.
Run:
```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $(grep VITE_SUPABASE_ANON_KEY .env.test | cut -d= -f2)" -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.local","password":"password123"}' | head -c 80
```
Expected: JSON starting with `{"access_token":"`.

If a column in this seed doesn't exist in the pulled baseline, production differs from the archived migrations. Change the seed to match the baseline, never the other way round, and note the difference in the commit message.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "Add deterministic local seed (Alice, Bea, general channel)"
```

---

### Task 12: Playwright setup, global setup and login

**Files:**
- Modify: `package.json`, `.gitignore`, `eslint.config.js`, `tsconfig.json`
- Create: `.dockerignore`, `tsconfig.e2e.json`
- Create: `playwright.config.ts`, `e2e/users.ts`, `e2e/global-setup.ts`, `e2e/auth.setup.ts`

**Dependencies:** Tasks 7, 8, 11 (the e2e code relies on the new PIN pad, the single layout and the seed)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test@^1.51.0
npx playwright install chromium webkit
```

- [ ] **Step 2: Add scripts to `package.json`**

```json
    "dev:test": "vite --mode test --port 5174 --strictPort",
    "db:start": "npx --yes supabase@2 start",
    "db:stop": "npx --yes supabase@2 stop",
    "db:reset": "npx --yes supabase@2 db reset",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Ignore generated files**

Append to `.gitignore`:
```
# Playwright
e2e/.auth/
playwright-report/
test-results/
```
In `eslint.config.js` change `{ ignores: ['dist'] },` to:
```js
  { ignores: ['dist', 'playwright-report', 'test-results'] },
```
Then add this block as the **last** argument to `tseslint.config(...)`. Playwright fixtures call a parameter named `use()`, which `react-hooks/rules-of-hooks` mistakes for a React hook, and e2e code runs in Node:
```js
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
```

- [ ] **Step 3b: Type-check the e2e code**

Create `tsconfig.e2e.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "moduleDetection": "force"
  },
  "include": ["e2e", "playwright.config.ts"]
}
```
In `tsconfig.json`, add `{ "path": "./tsconfig.e2e.json" }` to `references`. `tsc -b`, and therefore CI and `npm run build`, now type-checks the e2e code.

- [ ] **Step 3c: Keep test tooling out of the production image**

`docker/Dockerfile` copies the whole build context. Create `.dockerignore`:
```
node_modules
dist
.git
e2e
playwright-report
test-results
supabase
docs
.env
.env.*
.github
```
The Dockerfile passes Vite env vars as build args, so no `.env` file is needed in the image.

- [ ] **Step 4: Create `e2e/users.ts`**

```ts
export const USERS = {
  alice: {
    key: 'alice',
    email: 'alice@test.local',
    password: 'password123',
    nickname: 'Alice',
    pin: '1234',
    storageState: 'e2e/.auth/alice.json',
  },
  bea: {
    key: 'bea',
    email: 'bea@test.local',
    password: 'password123',
    nickname: 'Bea',
    pin: '567890',
    storageState: 'e2e/.auth/bea.json',
  },
} as const

export type UserKey = keyof typeof USERS
export type SeedUser = (typeof USERS)[UserKey]

export const EEP_PASSPHRASE = 'test-passphrase'
export const EEP_HEADING = 'FF14 Random Content Running Agenda Picker'
```

- [ ] **Step 5: Create `e2e/global-setup.ts`**

```ts
import { execSync } from 'node:child_process'

export default async function globalSetup() {
  try {
    execSync('npx --yes supabase@2 status', { stdio: 'ignore' })
  } catch {
    throw new Error('Local Supabase is not running. Run `npm run db:start` first.')
  }
  if (process.env.E2E_SKIP_RESET !== '1') {
    execSync('npx --yes supabase@2 db reset', { stdio: 'inherit' })
  }
}
```

- [ ] **Step 6: Create `e2e/auth.setup.ts`**

```ts
import { expect, test as setup } from '@playwright/test'
import { USERS } from './users'

for (const user of Object.values(USERS)) {
  setup(`log in ${user.key}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Login' }).click()
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeHidden()
    await page.waitForFunction(() =>
      Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
    )
    await page.context().storageState({ path: user.storageState })
  })
}
```

- [ ] **Step 7: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // all tests share one seeded database
  retries: isCI ? 2 : 0,
  forbidOnly: isCI,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      dependencies: ['setup'],
    },
    {
      name: 'webkit-iphone',
      use: { ...devices['iPhone 15'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev:test',
    url: 'http://localhost:5174',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
```

- [ ] **Step 8: Verify that login works**

Run: `npm run db:start` (if it isn't running already), then `npx playwright test --project=setup`
Expected: `2 passed`; `e2e/.auth/alice.json` and `e2e/.auth/bea.json` exist.
Run: `npx tsc -b && npx eslint e2e playwright.config.ts`
Expected: both exit 0.
Run: `docker compose build`
Expected: the build succeeds, and the build context is small (no `e2e/`, `supabase/` or `node_modules`).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore .dockerignore eslint.config.js tsconfig.json tsconfig.e2e.json playwright.config.ts e2e/users.ts e2e/global-setup.ts e2e/auth.setup.ts
git commit -m "Add Playwright with seeded login setup"
```

---

### Task 13: Two-user fixtures, page object, stubs and a realtime readiness hook

**Files:**
- Create: `e2e/stubs.ts`, `e2e/fixtures.ts`, `e2e/fixtures/gifs.json`, `e2e/fixtures/media/test-image.png`
- Modify: `src/hooks/useMessages.ts`, `src/components/chat/MessageList.tsx`

**Dependencies:** Task 12

Two-user tests need to know when the receiver's realtime channel has joined. Without that they're flaky. A `data-realtime` attribute on the message list exposes the subscription status.

- [ ] **Step 1: Expose a per-subscription status from `useMessages`**

The status must belong to the *current* subscription. It resets when the channel changes, ignores late callbacks from a channel that has already been removed, and refetches when a channel re-joins after a drop (for example, after iOS suspends the socket in the background), so missed messages are backfilled.

In `src/hooks/useMessages.ts`, change the first import to:
```ts
import { useEffect, useRef, useState } from 'react'
```
After `const channelRef = useRef<RealtimeChannel | null>(null)` add:
```ts
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CLOSED')
```
Replace the whole `useEffect(() => { fetchMessages(channelId) ... }, [channelId, fetchMessages, addMessage, updateMessage, removeMessage])` block with:
```ts
  useEffect(() => {
    let active = true
    let joinedBefore = false
    setRealtimeStatus('JOINING')
    fetchMessages(channelId)

    // Subscribe to broadcast for this channel
    const broadcastChannel = supabase
      .channel(`channel:${channelId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        addMessage(channelId, payload as Message)
      })
      .on('broadcast', { event: 'edit_message' }, ({ payload }) => {
        updateMessage(channelId, payload as Message)
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }) => {
        removeMessage(channelId, payload.id)
      })
      .subscribe((status) => {
        if (!active) return // late callback from a channel this effect already removed
        setRealtimeStatus(status)
        if (status === 'SUBSCRIBED') {
          // A re-join means we may have missed broadcasts while disconnected; backfill.
          if (joinedBefore) fetchMessages(channelId)
          joinedBefore = true
        }
      })

    channelRef.current = broadcastChannel

    return () => {
      active = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [channelId, fetchMessages, addMessage, updateMessage, removeMessage])
```
Add `realtimeStatus,` to the returned object, after `loading,`.

Note: realtime-js rejoins channels by itself when the socket reconnects. This step only makes the status honest and backfills after a re-join. A full reconnect strategy (resubscribing on `pageshow`, a status banner) is part of the sub-project 3 UX work. Task 8's single layout guarantees that only one `useMessages` instance owns `channel:<id>` on a device.

- [ ] **Step 2: Render it on the message list**

In `src/components/chat/MessageList.tsx` change:
```tsx
  const { messages, loading, broadcastEditMessage, broadcastDeleteMessage } = useMessages(channelId)
```
to:
```tsx
  const { messages, loading, realtimeStatus, broadcastEditMessage, broadcastDeleteMessage } = useMessages(channelId)
```
Find the scroll container element that has `ref={containerRef}` and add the attribute `data-realtime={realtimeStatus}` to it.

- [ ] **Step 3: Create the stub fixtures**

```bash
mkdir -p e2e/fixtures/media
node -e "require('fs').writeFileSync('e2e/fixtures/media/test-image.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))"
```
Create `e2e/fixtures/gifs.json`:
```json
{
  "results": [
    {
      "id": "gif-1",
      "title": "Test GIF",
      "url": "http://cdn.test.local/gifs/test.gif",
      "preview": "http://cdn.test.local/gifs/test-preview.gif",
      "width": 200,
      "height": 150
    }
  ]
}
```

- [ ] **Step 4: Create `e2e/stubs.ts`**

```ts
import type { BrowserContext } from '@playwright/test'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * Keeps e2e runs off third-party services: GIF search, uploads and CDN media are
 * answered from fixtures. Exercised by GIF/upload tests in sub-project 3.
 */
export async function stubExternalServices(context: BrowserContext) {
  await context.route('**/functions/v1/gif-search**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ path: 'e2e/fixtures/gifs.json', contentType: 'application/json', headers: CORS }),
  )
  await context.route('**/functions/v1/upload-media**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: { url: 'http://cdn.test.local/messages/test-image.png', filename: 'test-image.png', type: 'image/png', size: 68 },
          headers: CORS,
        }),
  )
  await context.route('http://cdn.test.local/**', (route) =>
    route.fulfill({ path: 'e2e/fixtures/media/test-image.png', contentType: 'image/png' }),
  )
}
```

- [ ] **Step 5: Create `e2e/fixtures.ts`**

```ts
import { test as base, expect, type Page, type TestInfo, type Browser } from '@playwright/test'
import { EEP_HEADING, USERS, type SeedUser, type UserKey } from './users'
import { stubExternalServices } from './stubs'

export class ChatUser {
  constructor(
    readonly page: Page,
    readonly user: SeedUser,
  ) {}

  get composer() {
    return this.page.getByPlaceholder(/^Message #/)
  }

  get eepHeading() {
    return this.page.getByRole('heading', { name: EEP_HEADING })
  }

  get pinDots() {
    return this.page.getByTestId('pin-dots')
  }

  message(text: string) {
    return this.page.getByText(text, { exact: true })
  }

  /** Opens the chat on the seeded `general` channel and waits for its realtime channel to join. */
  async openChat() {
    await this.page.goto('/')
    // Mobile opens on the channel list; on desktop the button is in the sidebar. Either way, select it.
    await this.page.getByRole('button', { name: 'general', exact: true }).filter({ visible: true }).first().click()
    await expect(this.composer).toBeVisible()
    await expect(this.page.locator('[data-realtime="SUBSCRIBED"]')).toBeAttached()
  }

  async send(text: string) {
    await this.composer.fill(text)
    await this.composer.press('Enter')
  }

  async enterPassphrase(passphrase: string) {
    await this.page.getByLabel('Or enter in a custom raid').fill(passphrase)
    await this.page.getByRole('button', { name: 'Add' }).click()
  }

  async openPinPad() {
    await this.page.getByRole('button', { name: 'Unlock' }).click()
    await expect(this.pinDots).toBeVisible()
  }

  /** Taps PIN keys one at a time, like a person would. */
  async tapPin(pin: string) {
    for (const d of pin) await this.page.locator(`[data-pin-key="${d}"]`).dispatchEvent('pointerdown')
  }

  /** Fires every key's pointerdown synchronously in one task: faster than any human. */
  async fastPin(pin: string) {
    await this.page.evaluate((digits) => {
      for (const d of digits) {
        document
          .querySelector(`[data-pin-key="${d}"]`)!
          .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      }
    }, pin)
  }

  /** Simulates iOS sending the app to the background (visibilitychange → pagehide). */
  async background() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    })
  }

  /** Simulates returning to the app (visibilitychange → pageshow). */
  async foreground() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
  }
}

async function openUser(browser: Browser, testInfo: TestInfo, key: UserKey) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    storageState: USERS[key].storageState,
  })
  await stubExternalServices(context)
  const page = await context.newPage()
  return { context, user: new ChatUser(page, USERS[key]) }
}

type Fixtures = {
  alice: ChatUser
  bea: ChatUser
  /** Opens another device (context) for the same user. For multi-device tests in sub-project 3. */
  secondDevice: (key: UserKey) => Promise<ChatUser>
}

export const test = base.extend<Fixtures>({
  alice: async ({ browser }, use, testInfo) => {
    const { context, user } = await openUser(browser, testInfo, 'alice')
    await use(user)
    await context.close()
  },
  bea: async ({ browser }, use, testInfo) => {
    const { context, user } = await openUser(browser, testInfo, 'bea')
    await use(user)
    await context.close()
  },
  secondDevice: async ({ browser }, use, testInfo) => {
    const contexts: { close: () => Promise<void> }[] = []
    await use(async (key) => {
      const { context, user } = await openUser(browser, testInfo, key)
      contexts.push(context)
      return user
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

export { expect }
```

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npm run lint && npm test`
Expected: all green. (The fixtures are used by the specs in Tasks 14–16.)

- [ ] **Step 7: Commit**

```bash
git add e2e/stubs.ts e2e/fixtures.ts e2e/fixtures src/hooks/useMessages.ts src/components/chat/MessageList.tsx
git commit -m "Add two-user e2e fixtures, service stubs and realtime readiness hook"
```

---

### Task 14: Auth and Eep e2e specs

**Files:**
- Create: `e2e/auth.spec.ts`, `e2e/eep.spec.ts`

**Dependencies:** Tasks 6, 13

- [ ] **Step 1: Create `e2e/auth.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { EEP_HEADING, USERS } from './users'

test.use({ storageState: { cookies: [], origins: [] } })

test('logged-out visitors see the FF14 tool and can log in to the chat', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: EEP_HEADING })).toBeVisible()

  await page.getByRole('button', { name: 'Login' }).click()
  await page.getByLabel('Email').fill(USERS.alice.email)
  await page.getByLabel('Password').fill(USERS.alice.password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: EEP_HEADING })).toBeHidden()
  await expect(page.getByRole('button', { name: 'general', exact: true }).filter({ visible: true }).first()).toBeVisible()
})
```

- [ ] **Step 2: Create `e2e/eep.spec.ts`**

```ts
import { EEP_PASSPHRASE } from './users'
import { expect, test } from './fixtures'

test('/eep disguises the app and the passphrase brings the chat back', async ({ alice }) => {
  await alice.openChat()
  await alice.send('/eep')
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()

  await alice.enterPassphrase(EEP_PASSPHRASE)
  await expect(alice.composer).toBeVisible()
  await expect(alice.eepHeading).toBeHidden()
})

test('a wrong passphrase keeps the FF14 tool showing', async ({ alice }) => {
  await alice.openChat()
  await alice.send('/eep')
  await alice.enterPassphrase('The Binding Coil Turn 5')
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()
})
```

- [ ] **Step 3: Run**

Run: `npx playwright test e2e/auth.spec.ts e2e/eep.spec.ts`
Expected: 8 passed (3 tests × 2 browser setups, plus the 2 setup logins).
If a test fails, open the trace with `npx playwright show-trace test-results/<dir>/trace.zip` and fix the locator or the app. Never weaken the assertion.

- [ ] **Step 4: Commit**

```bash
git add e2e/auth.spec.ts e2e/eep.spec.ts
git commit -m "Add auth and Eep e2e specs"
```

---

### Task 15: Live delivery: failing two-user spec, then the fix

**Files:**
- Create: `e2e/messaging.spec.ts`
- Modify: `src/hooks/useMessages.ts`, `src/components/chat/MessageInput.tsx`

**Dependencies:** Task 13

- [ ] **Step 1: Write the failing spec `e2e/messaging.spec.ts`**

```ts
import { expect, test } from './fixtures'

test('messages arrive live for the other person, both ways', async ({ alice, bea }) => {
  await alice.openChat()
  await bea.openChat()

  const hello = `hello from alice ${Date.now()}`
  await alice.send(hello)
  await expect(alice.message(hello)).toBeVisible()
  await expect(alice.composer).toHaveValue('')
  await expect(bea.message(hello)).toBeVisible({ timeout: 5_000 })

  const reply = `reply from bea ${Date.now()}`
  await bea.send(reply)
  await expect(alice.message(reply)).toBeVisible({ timeout: 5_000 })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/messaging.spec.ts --project=chromium-desktop`
Expected: FAIL at `expect(bea.message(hello)).toBeVisible` with a timeout. `broadcastNewMessage` is never called, so Bea only sees the message after a reload.

- [ ] **Step 3: Make the broadcast callable from the composer**

In `src/hooks/useMessages.ts`, add above `export function useMessages`:
```ts
// Joined broadcast channels by app channel id, so the composer can announce new messages.
const broadcastChannels = new Map<string, RealtimeChannel>()

export function broadcastNewMessage(channelId: string, message: Message) {
  broadcastChannels.get(channelId)?.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  })
}
```
Inside the effect, right after `channelRef.current = broadcastChannel`, add:
```ts
    broadcastChannels.set(channelId, broadcastChannel)
```
In the effect cleanup, before `supabase.removeChannel(channelRef.current)`, add:
```ts
        if (broadcastChannels.get(channelId) === channelRef.current) broadcastChannels.delete(channelId)
```
Delete the hook-local `const broadcastNewMessage = (message: Message) => {...}` function and remove `broadcastNewMessage,` from the hook's return object. Nothing uses it.

- [ ] **Step 4: Broadcast after insert in `src/components/chat/MessageInput.tsx`**

Add the import:
```ts
import { broadcastNewMessage } from '@/hooks/useMessages'
```
This exact block appears **twice** in the file: once in `handleSend` (text, attachments, replies) and once in `handleGifSelect` (GIFs). Replace **both**:
```ts
    if (!error && data) {
      useMessageStore.getState().addMessage(channel.id, data)
    }
```
with:
```ts
    if (!error && data) {
      useMessageStore.getState().addMessage(channel.id, data)
      broadcastNewMessage(channel.id, data as Message)
    }
```
Check: `grep -c "broadcastNewMessage(channel.id" src/components/chat/MessageInput.tsx` prints `2`.

- [ ] **Step 4b: Delete the unused `sendMessage` from `src/stores/messageStore.ts`**

It inserts messages without broadcasting, so it's a trap for future code. Confirm it has no callers: `grep -rn "sendMessage" src` should list only `messageStore.ts`. Then delete the `sendMessage: (channelId: string, sessionId: string, content: string, authorId: string) => Promise<void>` line from the interface, and the whole `sendMessage: async (...) => { ... },` implementation.

- [ ] **Step 5: Run to verify it passes on both browser setups**

Run: `npx playwright test e2e/messaging.spec.ts`
Expected: 1 test × 2 browser setups passed.
Run: `npx tsc -b && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add e2e/messaging.spec.ts src/hooks/useMessages.ts src/components/chat/MessageInput.tsx src/stores/messageStore.ts
git commit -m "Fix new messages not appearing live for the other user"
```

---

### Task 16: PIN lock specs, and the send-after-unlock regression

**Files:**
- Create: `e2e/pin-lock.spec.ts`
- Modify: whatever the root cause points to (only if the regression reproduces)

**Dependencies:** Task 15 (the regression test's receive assertion needs live delivery). Task 13 comes in through Task 15.

- [ ] **Step 1: Write `e2e/pin-lock.spec.ts`**

```ts
import { expect, test } from './fixtures'

test.describe('PIN lock', () => {
  test('wrong PIN shakes and clears; right PIN opens the chat', async ({ alice }) => {
    await alice.openChat()
    await alice.background()
    await alice.foreground()
    await expect(alice.eepHeading).toBeVisible()

    await alice.openPinPad()
    await alice.tapPin('9999')
    await expect(alice.pinDots).toHaveAttribute('data-state', 'error')
    await expect(alice.pinDots).toHaveAttribute('data-state', 'idle')
    await expect(alice.pinDots).toHaveAttribute('data-filled', '0')

    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()
  })

  test('sending still works after unlocking (regression)', async ({ alice, bea }) => {
    await alice.openChat()
    await bea.openChat()

    await alice.background()
    await alice.foreground()
    await alice.openPinPad()
    await alice.tapPin(alice.user.pin)
    await expect(alice.composer).toBeVisible()

    const text = `after unlock ${Date.now()}`
    await alice.send(text)
    await expect(alice.composer).toHaveValue('')
    await expect(alice.composer).toBeEnabled()
    await expect(alice.message(text)).toBeVisible()
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })
  })

  test('fast entry of a 6-digit PIN registers every digit', async ({ bea }) => {
    await bea.openChat()
    await bea.send('/eep')
    await bea.openPinPad()
    await bea.fastPin(bea.user.pin)
    await expect(bea.composer).toBeVisible()
  })
})
```

- [ ] **Step 2: Run**

Run: `npx playwright test e2e/pin-lock.spec.ts`
Expected: the first and third tests pass on both browser setups, because of the new PIN pad. The regression test either fails, in which case go to Step 3, or passes, in which case go to Step 4.

- [ ] **Step 3: If the regression test fails, find the root cause before changing anything**

Invoke the `jig:debug` skill with the failing trace (`npx playwright show-trace …`). Check, in this order:
0. Whether two chat layouts are mounted at once. This should be impossible after Task 8; check with `document.querySelectorAll('textarea').length === 1`.
1. Whether the composer's `onKeyDown` handler fires after the unlock. If it doesn't, check focus and the composer's state while it is hidden with `display:none`.
2. Whether the `messages` insert succeeds. Look for the request in the trace's network tab.
3. Whether the realtime channel is still `SUBSCRIBED` after the visibility change. `usePresence` puts presence into a different state when the app goes hidden.
4. Whether the update order of `pinLocked`, `showPinPad` and `eepMode` in `EepMode.handlePinSuccess` leaves the app in an inconsistent state.

Fix the root cause with the smallest change, re-run the spec on both browser setups until it passes, then run `npx tsc -b && npm run lint && npm test`. Only change the unused `lockApp`/`pinLocked` path if the root cause is there.

- [ ] **Step 4: If the regression test passes straight away, record that**

Keep the test as a guard. In the Step 5 commit message, add the line `Send-after-unlock: not reproducible in emulation after Tasks 8 and 15.`. Task 18 copies this result into the iPhone checklist. Tasks 8 (duplicate layout) and 15 (missing broadcast) are the likely real causes of the reported bug.

- [ ] **Step 5: Commit**

```bash
git add e2e/pin-lock.spec.ts   # plus any files changed in Step 3
git commit -m "Add PIN lock e2e specs including send-after-unlock regression"
```
If Step 3 produced a fix, use the message `Fix sending after PIN unlock (<one-line root cause>)` instead.

---

### Task 17: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Dependencies:** Task 16 (CI only goes green once every test from Tasks 12–16 exists and passes)

- [ ] **Step 1: Check which service names `supabase start -x` accepts**

Run: `npx --yes supabase@2 start --help | grep -A3 -- '-x'`
Note the valid names. Newer CLIs call the mail service `mailpit`; older ones call it `inbucket`.

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm test

  e2e:
    needs: check
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium webkit

      - name: Start local Supabase (applies migrations + seed)
        run: npx --yes supabase@2 start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor

      - name: Run e2e
        run: npm run e2e
        env:
          CI: 'true'
          E2E_SKIP_RESET: '1' # supabase start already applied migrations + seed

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```
If Step 1 showed `inbucket` rather than `mailpit`, replace that name in the `-x` list.

- [ ] **Step 3: Validate the YAML**

Run: `npx --yes yaml-lint .github/workflows/ci.yml`. If that tool isn't available, run `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"` and review the file by eye.
Expected: no syntax errors.

- [ ] **Step 4: Commit and push a branch to try it** (check with the user before pushing)

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI: lint, typecheck, unit and two-user e2e"
```
After pushing, expected: both jobs are green on GitHub. `check` takes about 1 minute and `e2e` about 5–7 minutes.

---

### Task 18: Docs: iPhone checklist and SETUP.md

**Files:**
- Create: `docs/testing/iphone-checklist.md`
- Modify: `SETUP.md`

**Dependencies:** Task 16 (its result goes into the checklist)

- [ ] **Step 1: Create `docs/testing/iphone-checklist.md`**

```markdown
# iPhone Manual Checklist

Run on a real iPhone, using the app installed to the home screen, at the end of each milestone. Record the date, iOS version and the result of each item.

| # | Check | Pass? |
|---|---|---|
| 1 | App-switcher snapshot does not show chat content. *(Expected to fail as a PWA; tracked by sub-project 4.)* | |
| 2 | Returning from the background shows the FF14 page; the blue dot opens the PIN pad and unlocks. | |
| 3 | Fast thumb entry on the PIN pad registers every digit (4- and 6-digit PINs). | |
| 4 | Wrong PIN: the dots shake and clear; the pad accepts input again straight away. | |
| 5 | Autocorrect, predictive text and auto-capitalisation work in the message box. | |
| 6 | The keyboard doesn't cover the message box; the list stays scrolled to the bottom when the keyboard opens. | |
| 7 | A message from the other person appears without a refresh after the app was in the background. | |
| 8 | Safe areas are respected (notch / Dynamic Island, home indicator). | |
| 9 | Double-tap doesn't zoom; long-press doesn't select UI text or open the callout menu. | |
| 10 | Images and video play inline. | |
| 11 | Typing indicator and presence update within about 2 s. | |
| 12 | After unlocking with the PIN, a typed message sends and the other person receives it. | |

## Known open issues

- The message box sets `autoCorrect="off"` (`src/components/chat/MessageInput.tsx`), which explains item 5. This is fixed in sub-project 3.
```
Add Task 16's outcome under "Known open issues": either the root cause it fixed, or `Send-after-unlock: not reproducible in emulation after Tasks 8 and 15 (duplicate layout, missing broadcast). Confirm on a device with item 12.`

- [ ] **Step 2: Update `SETUP.md`, the "Run database migrations" section**

Replace the whole `### Run database migrations` section (from its heading through the line `These create all tables, RLS policies, indexes, triggers, RPC functions, and seed data.`) with:
```markdown
### Database migrations

The schema is managed with the Supabase CLI. It isn't installed as a dependency; run it with `npx --yes supabase@2`.
`supabase/migrations/` holds a baseline pulled from production plus later timestamped migrations.
The old hand-applied SQL files are kept in `supabase/migrations_archive/` for reference only.

- **New project:** `npx --yes supabase@2 link --project-ref <ref>` then `npx --yes supabase@2 db push`, then insert your
  `eep_passphrase` row into `settings` from the SQL editor (no secrets live in migrations).
- **Schema change:** `npx --yes supabase@2 migration new <name>`, write the SQL, test it locally with
  `npm run db:reset`, then push (see below). Never paste schema changes into the SQL editor:
  the repo and production drift apart.
- **Pushing to production:** always run `npx --yes supabase@2 db push --dry-run` first and read the list of pending migrations. Push only after you've reviewed each one. `npx --yes supabase@2 migration list` shows what is applied where.
```
In the `### Enable Realtime` section, add this line at the end:
```markdown
(For new projects this is handled by the `realtime_publication` migration.)
```

- [ ] **Step 3: Add a testing section to the end of `SETUP.md`**

```markdown
---

## Testing

Requires Docker.

| Command | What it does |
|---|---|
| `npm run db:start` | Start local Supabase (Postgres, Auth, Realtime) and apply migrations + `supabase/seed.sql` |
| `npm run db:reset` | Rebuild the local database from migrations + seed |
| `npm run db:stop` | Stop local Supabase |
| `npm test` | Unit/component tests (Vitest) |
| `npm run e2e` | Two-user end-to-end tests (Playwright: desktop Chromium + iPhone WebKit). Resets the DB first; set `E2E_SKIP_RESET=1` to skip. |
| `npm run e2e:ui` | Playwright UI mode for debugging |

Seeded accounts: `alice@test.local` / `bea@test.local`, password `password123`, PINs `1234` / `567890`,
Eep passphrase `test-passphrase`. These are local-only values.

Bug-fix policy: every fix starts with a failing test at the lowest layer that can reproduce it.
Before each milestone, run `docs/testing/iphone-checklist.md` on a real device.
```

- [ ] **Step 4: Commit**

```bash
git add docs/testing/iphone-checklist.md SETUP.md
git commit -m "Document CLI migration workflow, test commands and iPhone checklist"
```

---

## Final verification

- [ ] `npx tsc -b` exits 0. This now covers `src/`, the tests, `e2e/` and `playwright.config.ts`.
- [ ] `npm run lint` shows 0 errors.
- [ ] `npm test` passes everything: markdown 9, uiStore 10, usePinEntry 21, PinPad 23, useMediaQuery 4.
- [ ] `npm run e2e` passes everything on both `chromium-desktop` and `webkit-iphone`.
- [ ] `npm run build` and `docker compose build` both succeed. The image build context excludes test tooling.
- [ ] `npx --yes supabase@2 migration list` shows the baseline as applied both locally and remotely. Nothing was pushed to production.
- [ ] CI is green on a pushed branch.
- [ ] Every deliverable in the design doc maps to a completed task.
