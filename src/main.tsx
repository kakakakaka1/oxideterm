// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { i18nReady } from './i18n'
import './bootstrap/initKeybindings'
import { initializeSettings } from './store/settingsStore'

// Dev-only: register fault injection API (window.__faultInjection)
import './lib/faultInjection'

// Initialize settings (including theme) before rendering
// This loads from oxide-settings-v2, applies theme, and cleans up legacy keys
initializeSettings()

// Wait for i18n resources to load before rendering
i18nReady.then(() => {
  const root = ReactDOM.createRoot(document.getElementById('root')!)

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )

  // Cleanup on window close to prevent memory leaks
  // NOTE: UI state (sidebar) is now automatically persisted by settingsStore
  window.addEventListener('beforeunload', () => {
    root.unmount()
  })
}).catch((err) => {
  console.error('Failed to initialize i18n:', err)
  // 降级渲染：即使 i18n 加载失败也要呈现界面（翻译字符串会显示 key）
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
