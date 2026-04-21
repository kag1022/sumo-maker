import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App.tsx'
import { initializeTheme } from './shared/hooks/useTheme'
import './index.css'

initializeTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
