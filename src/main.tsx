import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { App } from './App'
import { ExportPage } from './components/editor/export-page'
import { isTauriRuntime } from './lib/runtime'
import './index.css'
import 'sonner/dist/styles.css'

const isExportWindow = isTauriRuntime() && getCurrentWindow().label === 'export'

ReactDOM.createRoot(document.getElementById('root')!).render(
  isExportWindow ? <ExportPage /> : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ),
)
