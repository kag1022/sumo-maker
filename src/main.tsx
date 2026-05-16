import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App.tsx'
import { initializeLocale } from './shared/lib/locale'
import { LocaleProvider } from './shared/ui/LocaleProvider'
import { initializeTheme } from './shared/hooks/useTheme'
import './index.css'

initializeLocale()
initializeTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
)
