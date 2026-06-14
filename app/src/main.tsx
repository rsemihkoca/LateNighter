import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'dockview-react/dist/styles/dockview.css'
import './styles/tokens.css'
import './styles/tailwind.css'
import './styles/app.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
