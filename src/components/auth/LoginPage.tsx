import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'

interface LoginPageProps {
  onCancel?: () => void
}

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
      <div className="relative w-full max-w-sm rounded-lg bg-primary p-8 shadow-lg">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-primary"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary">XIV Tools</h1>
          <p className="mt-1 text-sm text-muted">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[3px] border border-input bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[hsl(var(--color-brand))]"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase text-secondary">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[3px] border border-input bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[hsl(var(--color-brand))]"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[3px] bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {loading ? 'Please wait...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

