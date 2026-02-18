import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function LoginPage() {
  const { signIn, signUp, loading } = useAuthStore()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isSignUp) {
      if (!nickname.trim()) {
        setError('Display name is required')
        return
      }
      const result = await signUp(email, password, nickname.trim())
      if (result.error) setError(result.error)
    } else {
      const result = await signIn(email, password)
      if (result.error) setError(result.error)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-tertiary">
      <div className="w-full max-w-sm rounded-lg bg-primary p-8 shadow-lg">
        {/* Non-descript header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary">Internal Tools Portal</h1>
          <p className="mt-1 text-sm text-muted">
            {isSignUp ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="nickname" className="mb-1 block text-xs font-semibold uppercase text-secondary">
                Display Name
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-[3px] border border-input bg-input px-3 py-2 text-sm text-primary outline-none focus:border-[hsl(var(--color-brand))]"
                required
              />
            </div>
          )}

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
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setIsSignUp(false); setError(null) }}
                className="text-link hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Need an account?{' '}
              <button
                onClick={() => { setIsSignUp(true); setError(null) }}
                className="text-link hover:underline"
              >
                Register
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
