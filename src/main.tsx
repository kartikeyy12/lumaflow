import '@fontsource-variable/geist'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createTaskStore } from './hooks/useTasks'
import { createAppController } from './hooks/useTimer'
import './styles.css'

const controller = createAppController()
const taskStore = createTaskStore()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App controller={controller} taskStore={taskStore} />
  </StrictMode>,
)

// Offline use and installing as an app. Only in the built site, never while developing.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Private windows and some browsers refuse. The app works the same without it.
    })
  })
}
