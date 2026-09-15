import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './AppTransport.jsx'
import './transport-ui-polish.css'
import './transport-ui-enterprise.css'
import './sidebar-polish.css'
import './sidebar-fixed.css'
import './module-export.css'
import './transport-ui-final.css'

const DISPLAY_SELECTOR = 'td, th, option, .x-stat, .dashboard-stat-card, .m-detail-grid, .dpt-preview, .dpt-selection, .dpt-modal'
const INTEGER_DECIMAL = /^(-?\d+)\.0+$/

function normalizeIntegerLikeText(root = document) {
  root.querySelectorAll(DISPLAY_SELECTOR).forEach((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const nodes = []
    let current
    while ((current = walker.nextNode())) nodes.push(current)
    nodes.forEach((node) => {
      const value = node.nodeValue ?? ''
      const trimmed = value.trim()
      if (!INTEGER_DECIMAL.test(trimmed)) return
      const normalized = trimmed.replace(INTEGER_DECIMAL, '$1')
      node.nodeValue = value.replace(trimmed, normalized)
    })
  })
}

function installDisplayNumberGuard() {
  normalizeIntegerLikeText()
  const observer = new MutationObserver(() => normalizeIntegerLikeText())
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}

const cleanupDisplayNumberGuard = installDisplayNumberGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

window.addEventListener('beforeunload', cleanupDisplayNumberGuard, { once: true })
