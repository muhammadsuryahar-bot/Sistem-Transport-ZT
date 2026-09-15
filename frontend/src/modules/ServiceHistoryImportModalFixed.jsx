import { useEffect, useRef } from 'react'
import ServiceHistoryImportModal from './ServiceHistoryImportModal.jsx'

function normalizeSequenceNumbers(root) {
  if (!root) return

  root.querySelectorAll('.dpt-preview table').forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent.trim().toLowerCase())
    const sequenceIndexes = headers
      .map((header, index) => (/^(no|no\.|nomor|nomor urut)$/.test(header) ? index : -1))
      .filter((index) => index >= 0)

    if (!sequenceIndexes.length) return

    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = Array.from(row.children)
      sequenceIndexes.forEach((index) => {
        const cell = cells[index]
        if (!cell) return
        const value = cell.textContent.trim()
        if (/^-?\d+\.0$/.test(value)) cell.textContent = value.slice(0, -2)
      })
    })
  })
}

export default function ServiceHistoryImportModalFixed(props) {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const normalize = () => normalizeSequenceNumbers(root)
    normalize()

    const observer = new MutationObserver(normalize)
    observer.observe(root, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef}>
      <ServiceHistoryImportModal {...props} />
    </div>
  )
}
