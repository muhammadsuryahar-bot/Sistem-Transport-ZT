import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/xlsxXmlCompat.js'
import './index.css'
import App from './AppTransport.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import './transport-ui-polish.css'
import './transport-ui-enterprise.css'
import './sidebar-polish.css'
import './sidebar-fixed.css'
import './module-export.css'
import './transport-ui-final.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
