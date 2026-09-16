const STORAGE_KEY = 'transport_excel_preview_deleted_v2'

function readDeleted(context) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const store = raw ? JSON.parse(raw) : {}
    return new Set(Array.isArray(store?.[context]) ? store[context].map(String) : [])
  } catch {
    return new Set()
  }
}

function writeDeleted(context, rows) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const store = raw ? JSON.parse(raw) : {}
    store[context] = [...new Set(rows.map(String))]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    return
  }
}

function getPreviewContext() {
  const label = document.querySelector('.dpt-toolbar b')?.textContent?.trim()
  const labels = {
    'Kendaraan': 'kendaraan',
    'Pengajuan Service': 'pengajuan',
    'Service & Perbaikan': 'service',
    'Kendaraan Sewa': 'sewa',
    'Dokumen Kendaraan': 'dokumen',
  }
  return labels[label] || document.body.dataset.importContext || 'excel'
}

function getRowNumber(row) {
  if (row.dataset.excelRow) return String(row.dataset.excelRow)
  const first = row.querySelector('td:first-child')
  const inputValue = first?.querySelector('input')?.value?.trim()
  if (/^\d+$/.test(inputValue || '')) return String(inputValue)
  const textValue = first?.textContent?.trim()
  if (/^\d+$/.test(textValue || '')) return String(textValue)
  return ''
}

function visibleRows(table) {
  return [...table.querySelectorAll('tbody tr')].filter(row => row.style.display !== 'none' && row.dataset.excelDeleted !== '1' && !row.querySelector('td[colspan]'))
}

function selectedRows(table) {
  return visibleRows(table).filter(row => row.querySelector('.epv-row-check')?.checked)
}

function updateToolbar(preview, table) {
  const toolbar = preview.querySelector('.epv-toolbar')
  if (!toolbar) return
  const rows = visibleRows(table)
  const selected = selectedRows(table)
  const count = toolbar.querySelector('.epv-count')
  const remove = toolbar.querySelector('.epv-remove')
  const head = table.querySelector('.epv-head-check')
  if (count) count.textContent = `${selected.length} dipilih`
  if (remove) remove.disabled = selected.length === 0
  if (head) {
    head.checked = rows.length > 0 && selected.length === rows.length
    head.indeterminate = selected.length > 0 && selected.length < rows.length
  }
  rows.forEach(row => row.classList.toggle('epv-selected-row', Boolean(row.querySelector('.epv-row-check')?.checked)))
}

function addSelectionUi(table, preview, context) {
  if (table.dataset.epvSelectionMode === '1') return
  table.dataset.epvSelectionMode = '1'
  const header = table.querySelector('thead tr')
  if (!header) return

  if (!header.querySelector('.epv-select-head')) {
    const th = document.createElement('th')
    th.className = 'epv-select-head'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'epv-head-check'
    cb.setAttribute('aria-label', 'Pilih semua baris Excel')
    cb.addEventListener('change', () => {
      visibleRows(table).forEach(row => {
        const item = row.querySelector('.epv-row-check')
        if (item) item.checked = cb.checked
      })
      updateToolbar(preview, table)
    })
    th.appendChild(cb)
    header.insertBefore(th, header.firstChild)
  }

  visibleRows(table).forEach(row => {
    if (row.querySelector('.epv-row-check')) return
    const td = document.createElement('td')
    td.className = 'epv-select-cell'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'epv-row-check'
    cb.setAttribute('aria-label', 'Pilih baris Excel')
    cb.addEventListener('change', () => updateToolbar(preview, table))
    td.appendChild(cb)
    row.insertBefore(td, row.firstChild)
  })

  let toolbar = preview.querySelector('.epv-toolbar')
  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.className = 'epv-toolbar'
    toolbar.innerHTML = '<div><strong>Mode pilih Excel</strong><span class="epv-count">0 dipilih</span></div><div class="epv-actions"><button type="button" class="epv-all">Pilih semua</button><button type="button" class="epv-cancel">Batal pilih</button><button type="button" class="epv-remove" disabled>Hapus dari import</button></div>'
    preview.insertBefore(toolbar, preview.firstChild)
  }

  const all = toolbar.querySelector('.epv-all')
  if (all && !all.dataset.bound) {
    all.dataset.bound = '1'
    all.addEventListener('click', () => {
      visibleRows(table).forEach(row => {
        const cb = row.querySelector('.epv-row-check')
        if (cb) cb.checked = true
      })
      updateToolbar(preview, table)
    })
  }

  const cancel = toolbar.querySelector('.epv-cancel')
  if (cancel && !cancel.dataset.bound) {
    cancel.dataset.bound = '1'
    cancel.addEventListener('click', () => {
      visibleRows(table).forEach(row => {
        const cb = row.querySelector('.epv-row-check')
        if (cb) cb.checked = false
      })
      const head = table.querySelector('.epv-head-check')
      if (head) {
        head.checked = false
        head.indeterminate = false
      }
      delete table.dataset.epvSelectionMode
      preview.querySelector('.epv-toolbar')?.remove()
      table.querySelectorAll('.epv-select-cell').forEach(cell => cell.remove())
      table.querySelector('.epv-select-head')?.remove()
      table.querySelectorAll('.epv-selected-row').forEach(row => row.classList.remove('epv-selected-row'))
    })
  }

  const remove = toolbar.querySelector('.epv-remove')
  if (remove && !remove.dataset.bound) {
    remove.dataset.bound = '1'
    remove.addEventListener('click', () => {
      const rows = selectedRows(table)
      const ids = rows.map(getRowNumber).filter(Boolean)
      if (!ids.length) return
      if (!window.confirm(`Keluarkan ${ids.length} baris dari proses import? File Excel asli tidak diubah.`)) return
      const merged = [...readDeleted(context), ...ids]
      writeDeleted(context, merged)
      rows.forEach(row => {
        row.style.display = 'none'
        row.dataset.excelDeleted = '1'
      })
      updateToolbar(preview, table)
    })
  }

  updateToolbar(preview, table)
}

function applyDeletedRows(table, context) {
  const deleted = readDeleted(context)
  visibleRows(table).forEach(row => {
    const number = getRowNumber(row)
    if (number && deleted.has(number)) {
      row.style.display = 'none'
      row.dataset.excelDeleted = '1'
    }
  })
}

function bindLongPress(table, preview, context, row) {
  if (row.dataset.epvLongPressBound === '1') return
  row.dataset.epvLongPressBound = '1'
  let timer = null
  let startX = 0
  let startY = 0
  let triggered = false
  const clear = () => {
    if (timer) window.clearTimeout(timer)
    timer = null
  }
  row.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target?.closest?.('input, select, textarea, button, a')) return
    startX = event.clientX
    startY = event.clientY
    triggered = false
    clear()
    timer = window.setTimeout(() => {
      triggered = true
      addSelectionUi(table, preview, context)
      const number = getRowNumber(row)
      const target = visibleRows(table).find(item => getRowNumber(item) === number) || row
      const cb = target.querySelector('.epv-row-check')
      if (cb) cb.checked = true
      updateToolbar(preview, table)
    }, 520)
  })
  row.addEventListener('pointermove', event => {
    if (!timer) return
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) clear()
  })
  row.addEventListener('pointerup', clear)
  row.addEventListener('pointercancel', clear)
  row.addEventListener('click', event => {
    if (triggered) {
      triggered = false
      return
    }
    if (table.dataset.epvSelectionMode !== '1') return
    if (event.target?.closest?.('input, select, textarea, button, a')) return
    const cb = row.querySelector('.epv-row-check')
    if (cb) {
      cb.checked = !cb.checked
      updateToolbar(preview, table)
      event.preventDefault()
      event.stopPropagation()
    }
  })
}

export function initExcelPreviewSelection() {
  if (typeof document === 'undefined' || window.__transportExcelPreviewSelection) return
  window.__transportExcelPreviewSelection = true
  let timer = null
  const run = () => {
    document.querySelectorAll('.dpt-preview table').forEach(table => {
      const preview = table.closest('.dpt-preview')
      if (!preview) return
      const context = getPreviewContext()
      applyDeletedRows(table, context)
      visibleRows(table).forEach(row => bindLongPress(table, preview, context, row))
    })
  }
  run()
  const observer = new MutationObserver(() => {
    clearTimeout(timer)
    timer = window.setTimeout(run, 60)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
