import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import { applyCachedBrandHue } from '@/lib/brand'
import '@/index.css'

// Paint the church's accent before the first render; church settings (the
// source of truth) arrive over the network a moment later.
applyCachedBrandHue()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
