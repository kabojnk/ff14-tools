import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// The iOS app only. The mode is a build-time constant, so website builds don't contain the native code.
if (import.meta.env.MODE === 'native') {
  void import('./native/bootstrap').then((m) => m.startNative())
}
