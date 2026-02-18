import { useState, useCallback } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { getRandomDuties, getDifficultyColor, type FF14Duty } from '@/lib/ff14data'

export function EepMode() {
  const { setEepMode } = useUiStore()
  const [duties, setDuties] = useState<FF14Duty[]>([])
  const [customRaid, setCustomRaid] = useState('')
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [passphraseLoaded, setPassphraseLoaded] = useState(false)

  // Load passphrase from Supabase on mount
  useState(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase
        .from('settings')
        .select('value')
        .eq('key', 'eep_passphrase')
        .single()
        .then(({ data }) => {
          if (data) setPassphrase(data.value)
          setPassphraseLoaded(true)
        })
    })
  })

  const rollContent = useCallback(() => {
    const count = Math.floor(Math.random() * 3) + 3 // 3-5 duties
    setDuties(getRandomDuties(count))
  }, [])

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (passphraseLoaded && passphrase && customRaid === passphrase) {
      setEepMode(false)
      return
    }
    // Wrong passphrase — just treat it as a search
    setCustomRaid('')
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: '#16213e', borderBottom: '2px solid #0f3460' }}
      >
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#e94560' }}>
            FF14 Random Content Running Agenda Picker
          </h1>
          <p className="text-sm" style={{ color: '#a0a0b0' }}>
            Can&apos;t decide what to run? Let fate choose!
          </p>
        </div>
        <div
          className="text-xs"
          style={{ color: '#606080' }}
        >
          v2.1.4
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto p-8">
        {/* Roll button */}
        <button
          onClick={rollContent}
          className="mb-8 rounded-lg px-8 py-3 text-lg font-bold text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #e94560, #0f3460)',
            boxShadow: '0 4px 15px rgba(233, 69, 96, 0.3)',
          }}
        >
          Roll Random Content
        </button>

        {/* Results */}
        {duties.length > 0 && (
          <div className="w-full max-w-2xl">
            <h2 className="mb-4 text-center text-lg font-semibold" style={{ color: '#a0a0b0' }}>
              Today&apos;s Agenda ({duties.length} duties)
            </h2>
            <div className="space-y-3">
              {duties.map((duty, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg p-4"
                  style={{
                    background: '#16213e',
                    border: '1px solid #0f3460',
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-white">{i + 1}. {duty.name}</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs" style={{ color: '#808090' }}>
                      <span>{duty.expansion}</span>
                      <span>&middot;</span>
                      <span>{duty.type}</span>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      color: getDifficultyColor(duty.difficulty),
                      border: `1px solid ${getDifficultyColor(duty.difficulty)}40`,
                      background: `${getDifficultyColor(duty.difficulty)}15`,
                    }}
                  >
                    {duty.difficulty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {duties.length === 0 && (
          <div className="text-center" style={{ color: '#606080' }}>
            <p className="text-4xl mb-4">🎲</p>
            <p>Click the button above to generate a random content agenda</p>
          </div>
        )}
      </main>

      {/* Custom raid input (secret passphrase entry) */}
      <footer
        className="px-6 py-4"
        style={{ background: '#16213e', borderTop: '1px solid #0f3460' }}
      >
        <form onSubmit={handleCustomSubmit} className="flex gap-3">
          <div className="flex-1">
            <label
              htmlFor="custom-raid"
              className="mb-1 block text-xs font-medium"
              style={{ color: '#808090' }}
            >
              Or enter in a custom raid
            </label>
            <input
              id="custom-raid"
              type="text"
              value={customRaid}
              onChange={(e) => setCustomRaid(e.target.value)}
              placeholder="e.g. The Binding Coil Turn 5"
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{
                background: '#1a1a2e',
                border: '1px solid #0f3460',
                color: '#e0e0e0',
              }}
            />
          </div>
          <button
            type="submit"
            className="self-end rounded px-4 py-2 text-sm font-medium text-white"
            style={{ background: '#0f3460' }}
          >
            Add
          </button>
        </form>
      </footer>
    </div>
  )
}
