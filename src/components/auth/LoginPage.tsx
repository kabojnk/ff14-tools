import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'

interface LoginPageProps {
  onCancel?: () => void
}

// Opened from the FF14 disguise, so it uses fixed colours (the original dark look) and never the chat theme.
export function LoginPage({ onCancel }: LoginPageProps) {
  const { signIn, loading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const result = await signIn(email, password)
    if (result.error) setError(result.error)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      <div className="relative w-full max-w-sm rounded-lg bg-[#2f3137] p-8 shadow-lg">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#71767f] transition-colors hover:bg-[#393c41] hover:text-[#ebedef]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-[#ebedef]">XIV Tools</h1>
          <p className="mt-1 text-sm text-[#71767f]">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase text-[#a4aab2]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[3px] border border-[#4d4f56] bg-[#1f2023] px-3 py-2 text-sm text-[#ebedef] outline-none focus:border-[#5966f3]"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase text-[#a4aab2]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[3px] border border-[#4d4f56] bg-[#1f2023] px-3 py-2 text-sm text-[#ebedef] outline-none focus:border-[#5966f3]"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-[#ed4043]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[3px] bg-[#5966f3] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4651c3] disabled:opacity-50"
          >
            {loading ? 'Please wait...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

