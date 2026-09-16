import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/xlsxXmlCompat.js'
import { initExcelTableUiFixes } from './utils/excelTableUiFixes.js'
import { initGlobalTableSelection } from './utils/globalTableSelection.js'
import { initExcelPreviewSelection } from './utils/excelPreviewSelection.js'
import './index.css'
import App from './AppTransport.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import './transport-ui-polish.css'
import './transport-ui-enterprise.css'
import './sidebar-polish.css'
import './sidebar-fixed.css'
import './module-export.css'
import './transport-ui-final.css'
import './table-scroll-ui-fix.css'
import './master-vehicle-table-final.css'
import './global-table-selection.css'
import './data-row-mark-legend.css'

initExcelTableUiFixes()
initGlobalTableSelection()
initExcelPreviewSelection()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
