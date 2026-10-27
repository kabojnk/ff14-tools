import { useCallback, useState } from 'react'

const PREFIX = 'aetherdesk:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * State kept on this device only (checklists, collections, raid plans): the disguise's own data never goes to
 * the server. Storage that throws or holds junk falls back to `initial`; the state still works in memory.
 */
export function useStored<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial))
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(v))
        } catch {
          // Not persisted; the in-memory state still applies.
        }
        return v
      })
    },
    [key],
  )
  return [value, set]
}
