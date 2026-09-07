import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './AppTransport.jsx'
import './transport-ui-polish.css'
import './transport-ui-enterprise.css'
import './sidebar-polish.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
