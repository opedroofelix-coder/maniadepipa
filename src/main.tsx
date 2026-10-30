import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// fontes empacotadas no build (e não do Google Fonts) para o app instalado
// manter a cara certa mesmo sem internet
import '@fontsource-variable/baloo-2'
import '@fontsource-variable/nunito'
import './index.css'
import App from './App.tsx'
import { setupPwa } from './lib/pwa'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
