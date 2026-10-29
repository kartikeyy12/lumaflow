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
