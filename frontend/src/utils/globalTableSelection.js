const TOOLBAR_CLASS = 'gts-toolbar'
const CHECKBOX_CLASS = 'gts-row-checkbox'
const HEAD_CHECKBOX_CLASS = 'gts-head-checkbox'
const SKIP_TABLE_SELECTOR = '.dpt-preview table, .m-table, [data-no-bulk-select="true"]'

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function hasNativeSelection(table) {
  return Boolean(table.querySelector('.x-longpress-row, .m-longpress-row, .x-select-cell, .m-select-cell'))
}

function isDataTable(table) {
  if (!table || table.matches(SKIP_TABLE_SELECTOR) || hasNativeSelection(table)) return false
  const rows = [...table.querySelectorAll('tbody tr')].filter(row => !row.querySelector('td[colspan]'))
  return rows.length > 0
}

function getRows(table) {
  return [...table.querySelectorAll('tbody tr')].filter(row => !row.querySelector('td[colspan]') && row.style.display !== 'none')
}

function findDeleteButton(row) {
  const buttons = [...row.querySelectorAll('button, [role="button"], a')]
  return buttons.find(button => {
    if (button.disabled) return false
    const text = normalizeText(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent)
    return /\b(hapus|delete|hapus data|hapus permanen)\b/.test(text)
  }) || null
}

function injectRowCheckbox(row, table) {
  if (row.querySelector(`.${CHECKBOX_CLASS}`)) return
  const cell = document.createElement('td')
  cell.className = 'gts-select-cell'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = CHECKBOX_CLASS
  checkbox.setAttribute('aria-label', 'Pilih baris')
  checkbox.addEventListener('change', () => updateTableState(table))
  cell.appendChild(checkbox)
  row.insertBefore(cell, row.firstChild)
}

function injectHeaderCheckbox(table) {
  const headRow = table.querySelector('thead tr')
  if (!headRow || headRow.querySelector(`.${HEAD_CHECKBOX_CLASS}`)) return
  const th = document.createElement('th')
  th.className = 'gts-select-head'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = HEAD_CHECKBOX_CLASS
  checkbox.setAttribute('aria-label', 'Pilih semua baris')
  checkbox.addEventListener('change', () => {
    getRows(table).forEach(row => {
      const item = row.querySelector(`.${CHECKBOX_CLASS}`)
      if (item) item.checked = checkbox.checked
    })
    updateTableState(table)
  })
  th.appendChild(checkbox)
  headRow.insertBefore(th, headRow.firstChild)
}

function removeSelectionUi(table) {
  table.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach(input => input.closest('td')?.remove())
  table.querySelector(`.${HEAD_CHECKBOX_CLASS}`)?.closest('th')?.remove()
  table.parentElement?.querySelector(`.${TOOLBAR_CLASS}`)?.remove()
  delete table.dataset.gtsSelectionMode
  table.querySelectorAll('tbody tr').forEach(row => row.classList.remove('gts-selected-row'))
}

function setSelectionMode(table, active) {
  if (active) {
    table.dataset.gtsSelectionMode = '1'
    getRows(table).forEach(row => injectRowCheckbox(row, table))
    injectHeaderCheckbox(table)
    ensureToolbar(table)
  } else {
    removeSelectionUi(table)
  }
}

function ensureToolbar(table) {
  let toolbar = table.parentElement?.querySelector(`.${TOOLBAR_CLASS}`)
  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.className = TOOLBAR_CLASS
    toolbar.innerHTML = `
      <div class="gts-info"><strong>Mode pilih data</strong><span class="gts-count">0 dipilih</span></div>
      <div class="gts-actions">
        <button type="button" class="gts-select-all">Pilih semua</button>
        <button type="button" class="gts-clear">Batal pilih</button>
        <button type="button" class="gts-delete" disabled>Hapus yang dipilih</button>
      </div>
    `
    table.parentElement?.insertBefore(toolbar, table)
  }

  const selectAll = toolbar.querySelector('.gts-select-all')
  if (selectAll && !selectAll.dataset.bound) {
    selectAll.dataset.bound = '1'
    selectAll.addEventListener('click', () => {
      getRows(table).forEach(row => {
        const item = row.querySelector(`.${CHECKBOX_CLASS}`)
        if (item) item.checked = true
      })
      const head = table.querySelector(`.${HEAD_CHECKBOX_CLASS}`)
      if (head) head.checked = getRows(table).length > 0
      updateTableState(table)
    })
  }

  const clear = toolbar.querySelector('.gts-clear')
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = '1'
    clear.addEventListener('click', () => setSelectionMode(table, false))
  }

  const del = toolbar.querySelector('.gts-delete')
  if (del && !del.dataset.bound) {
    del.dataset.bound = '1'
    del.addEventListener('click', async () => {
      const rows = getRows(table).filter(row => row.querySelector(`.${CHECKBOX_CLASS}`)?.checked)
      if (!rows.length) return
      const actionable = rows.filter(row => findDeleteButton(row))
      const blocked = rows.length - actionable.length
      if (!actionable.length) {
        window.alert('Data yang dipilih tidak memiliki aksi Hapus yang aman dari halaman ini.')
        return
      }
      const warning = blocked ? `\n${blocked} data tidak memiliki aksi Hapus dan akan dilewati.` : ''
      if (!window.confirm(`Hapus ${actionable.length} data yang dipilih?${warning}\n\nPenghapusan tetap mengikuti konfirmasi dari halaman masing-masing.`)) return
      for (const row of actionable) {
        const button = findDeleteButton(row)
        if (button) {
          button.click()
          await new Promise(resolve => setTimeout(resolve, 180))
        }
      }
      setSelectionMode(table, false)
    })
  }
  updateTableState(table)
}

function updateTableState(table) {
  if (!table?.dataset.gtsSelectionMode) return
  const rows = getRows(table)
  const selected = rows.filter(row => row.querySelector(`.${CHECKBOX_CLASS}`)?.checked)
  const toolbar = table.parentElement?.querySelector(`.${TOOLBAR_CLASS}`)
  const count = toolbar?.querySelector('.gts-count')
  if (count) count.textContent = `${selected.length} dipilih`
  const del = toolbar?.querySelector('.gts-delete')
  if (del) del.disabled = selected.length === 0
  const head = table.querySelector(`.${HEAD_CHECKBOX_CLASS}`)
  if (head) {
    head.checked = rows.length > 0 && selected.length === rows.length
    head.indeterminate = selected.length > 0 && selected.length < rows.length
  }
  rows.forEach(row => row.classList.toggle('gts-selected-row', Boolean(row.querySelector(`.${CHECKBOX_CLASS}`)?.checked)))
}

function bindRowInteractions(table, row) {
  if (row.dataset.gtsBound === '1') return
  row.dataset.gtsBound = '1'
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
    if (event.target?.closest?.('button, input, select, textarea, a')) return
    startX = event.clientX
    startY = event.clientY
    triggered = false
    clear()
    timer = window.setTimeout(() => {
      triggered = true
      setSelectionMode(table, true)
      const checkbox = row.querySelector(`.${CHECKBOX_CLASS}`)
      if (checkbox) checkbox.checked = true
      updateTableState(table)
    }, 520)
  })

  row.addEventListener('pointermove', event => {
    if (!timer) return
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) clear()
  })

  row.addEventListener('pointerup', clear)
  row.addEventListener('pointercancel', clear)
  row.addEventListener('click', event => {
    if (!table.dataset.gtsSelectionMode || triggered) {
      triggered = false
      return
    }
    if (event.target?.closest?.('button, input, select, textarea, a')) return
    const checkbox = row.querySelector(`.${CHECKBOX_CLASS}`)
    if (checkbox) {
      checkbox.checked = !checkbox.checked
      updateTableState(table)
      event.preventDefault()
      event.stopPropagation()
    }
  })
}

function enhanceTable(table) {
  if (!isDataTable(table)) return
  table.dataset.gtsEnhanced = '1'
  getRows(table).forEach(row => bindRowInteractions(table, row))
  if (table.dataset.gtsSelectionMode === '1') ensureToolbar(table)
}

export function initGlobalTableSelection() {
  if (typeof document === 'undefined' || window.__transportGlobalTableSelection) return
  window.__transportGlobalTableSelection = true
  let timer = null
  const run = () => document.querySelectorAll('table').forEach(enhanceTable)
  run()
  const observer = new MutationObserver(() => {
    clearTimeout(timer)
    timer = window.setTimeout(run, 60)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true })
}
