import '@fontsource-variable/geist'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createAppController } from './hooks/useTimer'
import './styles.css'

const controller = createAppController()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
)
