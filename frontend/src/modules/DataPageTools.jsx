import { useEffect, useRef, useState } from 'react'
import UnifiedExcelImportModalSafe from './UnifiedExcelImportModalSafe.jsx'
import VehicleExcelImportV2 from './VehicleExcelImportModalV2.jsx'
import EditableServiceExcelImportModal from './EditableServiceExcelImportModal.jsx'
import VehicleDocumentsImportModal from './VehicleDocumentsImportModal.jsx'
import PengajuanExcelImportModal from './PengajuanExcelImportModal.jsx'
import RentalHistoryImportModalV2 from './RentalHistoryImportModalV2.jsx'
import './DataPageTools.css'

const CONTEXT_LABEL = { kendaraan: 'Kendaraan', pengajuan: 'Data Service', service: 'Service & Perbaikan', sewa: 'Administrasi Sewa', dokumen: 'Dokumen Kendaraan', laporan: 'Laporan', pengguna: 'Pengguna' }
const DATA_TABLE_SELECTOR = {
  kendaraan: '.mep-table',
  pengajuan: '.request-table',
  service: '.x-table',
  sewa: '.x-table',
  dokumen: '.x-table',
  laporan: '.x-table',
  pengguna: '.x-table',
}
const ROW_MARKS = {
  NONE: { label: 'Belum ditandai', className: '' },
  TODO: { label: 'Perlu dikerjakan', className: 'dpt-row-mark-todo' },
  PROCESS: { label: 'Sedang dikerjakan', className: 'dpt-row-mark-process' },
  DONE: { label: 'Sudah selesai', className: 'dpt-row-mark-done' },
  CHECKED: { label: 'Sudah dicek', className: 'dpt-row-mark-checked' },
}
const ROW_MARK_STORAGE = 'transport_excel_row_marks_v2'
const ROW_MARK_VISIBILITY_STORAGE = 'transport_row_mark_visibility_v6'
const COLUMN_VISIBILITY_STORAGE = 'transport_column_visibility_v5'
const CLEAN_TABLE_VIEW_STORAGE = 'transport_clean_table_view_v12'
const hasReport = value => value && typeof value === 'object' && value.context

function readRowMarks() {
  try {
    const raw = localStorage.getItem(ROW_MARK_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}
function writeRowMarks(value) {
  try { localStorage.setItem(ROW_MARK_STORAGE, JSON.stringify(value)); return true } catch { return false }
}
function readRowMarkVisibility(context) {
  try {
    const raw = localStorage.getItem(ROW_MARK_VISIBILITY_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' && value[context] === true
  } catch { return false }
}
function writeRowMarkVisibility(context, visible) {
  try {
    const raw = localStorage.getItem(ROW_MARK_VISIBILITY_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    const next = value && typeof value === 'object' ? value : {}
    next[context] = visible
    localStorage.setItem(ROW_MARK_VISIBILITY_STORAGE, JSON.stringify(next))
    return true
  } catch { return false }
}

function readColumnVisibility(context) {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    const columns = value && typeof value === 'object' ? value[context] : null
    return columns && typeof columns === 'object' ? columns : {}
  } catch { return {} }
}
function writeColumnVisibility(context, columns) {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    const next = value && typeof value === 'object' ? value : {}
    next[context] = columns
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE, JSON.stringify(next))
    return true
  } catch { return false }
}
function readCleanTableView(context) {
  try {
    const raw = localStorage.getItem(CLEAN_TABLE_VIEW_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' && value[context] !== undefined ? value[context] !== false : true
  } catch { return true }
}
function writeCleanTableView(context, enabled) {
  try {
    const raw = localStorage.getItem(CLEAN_TABLE_VIEW_STORAGE)
    const value = raw ? JSON.parse(raw) : {}
    const next = value && typeof value === 'object' ? value : {}
    next[context] = enabled
    localStorage.setItem(CLEAN_TABLE_VIEW_STORAGE, JSON.stringify(next))
    return true
  } catch { return false }
}
function applyCleanRoot(enabled) {
  document.querySelector('.content-container')?.classList.toggle('dpt-clean-table-view', enabled)
}
function normalizeColumnLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
function columnSlug(value, index) {
  const clean = normalizeColumnLabel(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return clean || `column_${index + 1}`
}
function isColumnVisible(column, visibility, showRowMarks = false) {
  if (!column) return false
  if (column.kind === 'mark') return showRowMarks && visibility[column.key] !== false
  if (column.kind === 'action') return visibility[column.key] !== false
  return visibility[column.key] !== false
}
function isMainOperationalTable(table) {
  return Boolean(
    table &&
    !table.closest('.dpt-preview, .dpt-overlay, .x-overlay, .m-overlay, .x-modal, .m-modal, .dpt-modal')
  )
}
function getPrimaryDataTable(context) {
  const selector = DATA_TABLE_SELECTOR[context]
  if (!selector) return null
  const visible = table => {
    const rect = table?.getBoundingClientRect?.()
    return Boolean(table && (!rect || (rect.width > 0 && rect.height > 0)))
  }
  return Array.from(document.querySelectorAll(selector))
    .filter(table => isMainOperationalTable(table) && !table.matches('.m-table') && !table.hasAttribute('data-no-row-marks') && visible(table))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null
}
function getColumnDescriptors(context, table) {
  const header = table?.querySelector('thead tr')
  if (!header) return []
  const counts = {}
  return Array.from(header.children).map((cell, index) => {
    const label = normalizeColumnLabel(cell.textContent)
    const slug = columnSlug(label, index)
    counts[slug] = (counts[slug] || 0) + 1
    const key = `${context}:${slug}${counts[slug] > 1 ? `_${counts[slug]}` : ''}`
    const lower = label.toLowerCase()
    return {
      key,
      label: label || `Kolom ${index + 1}`,
      index,
      kind: lower === 'tanda' || lower === 'penanda' ? 'mark' : lower === 'aksi' ? 'action' : 'data',
      utility: lower === 'tanda' || lower === 'penanda' || lower === 'aksi',
    }
  }).filter(column => column.label)
}
function applyDirectColumnDisplay(table, descriptors, visibility, cleanMode, showRowMarks) {
  if (!table) return
  const rows = Array.from(table.rows)
  for (const column of descriptors) {
    const hidden = !isColumnVisible(column, visibility, showRowMarks) || (cleanMode && (column.kind === 'mark' || column.kind === 'action'))
    for (const row of rows) {
      if (row.querySelector?.('td[colspan]')) continue
      const cell = row.children[column.index]
      if (!cell) continue
      cell.style.display = hidden ? 'none' : ''
      cell.setAttribute('aria-hidden', hidden ? 'true' : 'false')
    }
  }
}
function applyColumnVisibility(context, table, descriptors, visibility, cleanMode = readCleanTableView(context)) {
  if (!table) return
  const showMarks = readRowMarkVisibility(context)
  let dataColumns = 0
  let visibleDataColumns = 0
  let utilityColumns = 0
  let hiddenUtilityColumns = 0

  for (const column of descriptors) {
    const hiddenBySetting = !isColumnVisible(column, visibility, showMarks)
    const hiddenByCleanView = cleanMode && (column.kind === 'mark' || column.kind === 'action')
    const hidden = hiddenBySetting || hiddenByCleanView
    if (column.kind === 'data') {
      dataColumns += 1
      if (!hidden) visibleDataColumns += 1
    } else {
      utilityColumns += 1
      if (hidden) hiddenUtilityColumns += 1
    }
    for (const row of table.rows) {
      // Utility rows injected by DataPageTools (selected-row action panel)
      // are not data columns and must never be hidden by column visibility.
      if (row.querySelector?.('td[colspan]') || row.classList.contains('dpt-inline-row-actions')) continue
      const cell = row.children[column.index]
      if (cell) {
        cell.classList.toggle('dpt-col-hidden', hidden)
        cell.classList.toggle('dpt-column-utility', column.kind === 'mark' || column.kind === 'action')
        cell.classList.toggle('dpt-action-utility', column.kind === 'action')
        cell.classList.toggle('dpt-mark-utility', column.kind === 'mark')
        cell.dataset.dptColumnKind = column.kind
        cell.dataset.dptColumnHidden = hidden ? 'true' : 'false'
      }
    }
  }

  applyDirectColumnDisplay(table, descriptors, visibility, cleanMode, showMarks)
  const cleanModeActive = dataColumns > 0 && visibleDataColumns === dataColumns && utilityColumns > 0 && hiddenUtilityColumns === utilityColumns
  const header = table.querySelector('thead tr')
  if (header) {
    for (const column of descriptors) {
      const headerCell = header.children[column.index]
      if (headerCell) {
        const hidden = !isColumnVisible(column, visibility, showMarks) || (cleanMode && (column.kind === 'mark' || column.kind === 'action'))
        headerCell.classList.toggle('dpt-col-hidden', hidden)
        headerCell.classList.toggle('dpt-column-utility', column.kind === 'mark' || column.kind === 'action')
        headerCell.classList.toggle('dpt-action-utility', column.kind === 'action')
        headerCell.classList.toggle('dpt-mark-utility', column.kind === 'mark')
      }
    }
  }
  table.classList.toggle('dpt-clean-data-table', cleanModeActive)
  table.dataset.dptCleanDataMode = cleanModeActive ? 'true' : 'false'
  const tableWrap = table.closest('.x-table-wrap, .request-table-wrap, .mep-table-wrap')
  tableWrap?.classList.toggle('dpt-clean-data-wrap', cleanModeActive)
  tableWrap?.closest('.x-card, .request-panel, .master-excel-page')?.classList.toggle('dpt-clean-mode', cleanModeActive)
}
function getAllOperationalTables(context) {
  const selector = DATA_TABLE_SELECTOR[context]
  if (!selector) return []
  return Array.from(document.querySelectorAll(selector))
    .filter(table => isMainOperationalTable(table) && !table.matches('.m-table') && !table.hasAttribute('data-no-row-marks'))
    .filter(table => {
      const rect = table.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
}


function getRowActionButton(row, labels) {
  const wanted = labels.map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const matches = button => {
    const candidates = [
      normalize(button.textContent),
      normalize(button.getAttribute('aria-label')),
      normalize(button.getAttribute('title')),
      normalize(button.dataset?.action),
      normalize(button.dataset?.testid),
    ].filter(Boolean)
    return wanted.some(target => candidates.some(value => (
      value === target ||
      value.startsWith(`${target} `) ||
      value.endsWith(` ${target}`) ||
      value.includes(` ${target} `) ||
      value.includes(`${target} `)
    )))
  }
  return Array.from(row.querySelectorAll('button, [role="button"]')).find(matches) || null
}

function clearRowSelection(table) {
  if (!table) return
  table.querySelectorAll('tbody tr.dpt-row-selected').forEach(row => {
    row.classList.remove('dpt-row-selected')
    row.setAttribute('aria-selected', 'false')
  })
  table.querySelectorAll('tbody tr.dpt-inline-row-actions').forEach(row => row.remove())
  table.parentElement?.querySelectorAll('.dpt-selected-row-actions').forEach(toolbar => toolbar.remove())
}

function ensureRowSelection(context, table) {
  if (!table || !isMainOperationalTable(table)) return
  if (table.closest('.dpt-preview')) return
  // Native-selection pages own their row click/double-click events.
  if (hasNativeBulkSelection(table, context)) return

  const buildInlineActions = (row, sourceMark, detailTarget, editTarget, deleteTarget) => {
    const old = row.nextElementSibling
    if (old?.classList.contains('dpt-inline-row-actions')) old.remove()

    const actionRow = document.createElement('tr')
    actionRow.className = 'dpt-inline-row-actions'
    actionRow.setAttribute('aria-label', 'Aksi data terpilih')

    const td = document.createElement('td')
    td.colSpan = Math.max(1, row.children.length)
    td.innerHTML = `
      <div class="dpt-inline-row-panel">
        <div class="dpt-inline-row-title">
          <span class="dpt-selected-row-badge">DATA DIPILIH</span>
          <b class="dpt-inline-row-label"></b>
        </div>
        <div class="dpt-inline-row-tools">
          <button type="button" class="dpt-inline-action dpt-inline-detail">Detail</button>
          <label class="dpt-inline-mark-wrap">
            <span>Penanda</span>
            <select class="dpt-inline-mark">
              <option value="NONE">Belum ditandai</option>
              <option value="TODO">Perlu dikerjakan</option>
              <option value="PROCESS">Sedang dikerjakan</option>
              <option value="DONE">Sudah selesai</option>
              <option value="CHECKED">Sudah dicek</option>
            </select>
          </label>
          <button type="button" class="dpt-inline-action dpt-inline-edit">Edit</button>
          <button type="button" class="dpt-inline-action danger dpt-inline-delete">Hapus</button>
          <button type="button" class="dpt-inline-close" aria-label="Batalkan pilihan">×</button>
        </div>
      </div>
    `

    const primary = Array.from(row.children)
      .filter(cell =>
        !cell.classList.contains('dpt-row-mark-cell') &&
        cell.dataset.dptColumnKind !== 'action' &&
        cell.dataset.dptColumnKind !== 'mark'
      )
      .slice(0, 3)
      .map(cell => String(cell.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    td.querySelector('.dpt-inline-row-label').textContent = primary.join(' • ') || 'Data dipilih'

    const detailButton = td.querySelector('.dpt-inline-detail')
    const editButton = td.querySelector('.dpt-inline-edit')
    const deleteButton = td.querySelector('.dpt-inline-delete')
    const markWrap = td.querySelector('.dpt-inline-mark-wrap')
    const markSelect = td.querySelector('.dpt-inline-mark')
    const closeButton = td.querySelector('.dpt-inline-close')

    detailButton.hidden = !detailTarget
    editButton.hidden = !editTarget
    deleteButton.hidden = !deleteTarget
    markWrap.hidden = !sourceMark
    detailButton.disabled = Boolean(detailTarget?.disabled)
    editButton.disabled = Boolean(editTarget?.disabled)
    deleteButton.disabled = Boolean(deleteTarget?.disabled)

    detailButton.onclick = () => {
      if (!detailTarget?.disabled) detailTarget.click()
    }
    editButton.onclick = () => {
      if (!editTarget?.disabled) editTarget.click()
    }
    deleteButton.onclick = () => {
      if (!deleteTarget?.disabled) deleteTarget.click()
    }

    const actionCell = row.querySelector('[data-dpt-column-kind="action"], .mep-actions, .request-actions, .x-action-compact, .x-row-actions')
    const isFixedAction = sourceButton => Boolean(
      getRowActionButton({ querySelectorAll: () => [sourceButton] }, ['detail', 'lihat']) ||
      getRowActionButton({ querySelectorAll: () => [sourceButton] }, ['edit', 'ubah']) ||
      getRowActionButton({ querySelectorAll: () => [sourceButton] }, ['hapus', 'delete'])
    )
    if (actionCell) {
      Array.from(actionCell.querySelectorAll('button, [role="button"]')).forEach(sourceButton => {
        const label = String(
          sourceButton.textContent ||
          sourceButton.getAttribute('aria-label') ||
          sourceButton.getAttribute('title') ||
          ''
        ).replace(/\s+/g, ' ').trim()
        if (!label || isFixedAction(sourceButton)) return
        const extra = document.createElement('button')
        extra.type = 'button'
        extra.className = 'dpt-inline-action'
        extra.textContent = label
        extra.disabled = sourceButton.disabled
        extra.onclick = () => {
          if (!sourceButton.disabled) sourceButton.click()
        }
        td.querySelector('.dpt-inline-row-tools')?.insertBefore(extra, closeButton)
      })
    }

    markSelect.value = sourceMark?.value || 'NONE'
    markSelect.onchange = () => {
      if (!sourceMark) return
      sourceMark.value = markSelect.value
      sourceMark.dispatchEvent(new Event('change', { bubbles: true }))
      applyMark(row, markSelect.value)
    }

    closeButton.onclick = () => clearRowSelection(table)

    actionRow.appendChild(td)
    row.parentElement?.insertBefore(actionRow, row.nextSibling)
  }

  const applySelection = row => {
    if (!row || row.querySelector('td[colspan]') || row.classList.contains('dpt-inline-row-actions')) return

    table.querySelectorAll('tbody tr.dpt-row-selected').forEach(item => {
      item.classList.remove('dpt-row-selected')
      item.setAttribute('aria-selected', 'false')
    })
    table.querySelectorAll('tbody tr.dpt-inline-row-actions').forEach(item => item.remove())

    const sourceMark = row.querySelector('.dpt-row-mark-select')
    const detailTarget = getRowActionButton(row, ['detail', 'lihat'])
    const editTarget = getRowActionButton(row, ['edit', 'ubah'])
    const deleteTarget = getRowActionButton(row, ['hapus', 'delete'])
    const actionCell = row.querySelector('[data-dpt-column-kind="action"], .mep-actions, .request-actions, .x-action-compact, .x-row-actions')
    const sourceActionButtons = actionCell ? Array.from(actionCell.querySelectorAll('button, [role="button"]')) : []
    const hasTools = Boolean(sourceMark || detailTarget || editTarget || deleteTarget || sourceActionButtons.length)

    if (!hasTools) return

    row.classList.add('dpt-row-selected')
    row.setAttribute('aria-selected', 'true')
    buildInlineActions(row, sourceMark, detailTarget, editTarget, deleteTarget)
  }

  if (!table.dataset.dptRowSelectionReady) {
    table.dataset.dptRowSelectionReady = '1'
    table.addEventListener('click', event => {
      const row = event.target.closest('tbody tr')
      if (!row || row.classList.contains('dpt-inline-row-actions')) return
      if (event.target.closest('button, input, select, textarea, a')) return
      if (!table.contains(row) || row.querySelector('td[colspan]')) return
      if (table.dataset.dptBulkMode === 'true') {
        row.dataset.dptBulkSelected = row.dataset.dptBulkSelected === 'true' ? 'false' : 'true'
        const toolbar = table.parentElement?.parentElement?.querySelector('.dpt-bulk-selection-toolbar')
        syncGenericBulkUI(table, toolbar)
        return
      }
      applySelection(row)
    })
    table.addEventListener('dblclick', event => {
      const row = event.target.closest('tbody tr')
      if (!row || row.classList.contains('dpt-inline-row-actions')) return
      // Native selection pages own their double-click behavior.
      if (hasNativeBulkSelection(table, context)) return
      if (event.target.closest('button, input, select, textarea, a')) return
      if (table.dataset.dptBulkMode === 'true') {
        removeGenericBulkUI(table)
        clearRowSelection(table)
        return
      }
      clearRowSelection(table)
      enterGenericBulkMode(table, row, context)
    })
  }

  const selected = table.querySelector('tbody tr.dpt-row-selected:not(.dpt-inline-row-actions)')
  if (selected) {
    const inlineActions = selected.nextElementSibling
    if (!inlineActions?.classList.contains('dpt-inline-row-actions')) {
      applySelection(selected)
    }
  } else {
    clearRowSelection(table)
  }
}

function hasNativeBulkSelection(table, context = '') {
  if (table?.dataset?.nativeRowSelection === 'true') return true
  return Boolean(table?.querySelector('thead .mep-check, thead .request-select-cell, thead .x-select-cell'))
}

function getBulkDeleteButton(row) {
  return getRowActionButton(row, ['hapus', 'delete'])
}

function getBulkRows(table) {
  return Array.from(table.querySelectorAll('tbody tr'))
    .filter(row => !row.querySelector('td[colspan]') && !row.classList.contains('dpt-inline-row-actions'))
}

function createGenericBulkToolbar(table) {
  const toolbar = document.createElement('div')
  toolbar.className = 'dpt-bulk-selection-toolbar'
  toolbar.innerHTML = '<div class="dpt-bulk-selection-main"><span class="dpt-selected-row-badge">MODE PILIH</span><strong class="dpt-bulk-selection-count">0 dipilih</strong></div><div class="dpt-bulk-selection-actions"><button type="button" class="dpt-inline-action dpt-bulk-select-all">Pilih semua</button><button type="button" class="dpt-inline-action danger dpt-bulk-delete">Hapus 0</button><button type="button" class="dpt-inline-close dpt-bulk-cancel" aria-label="Batal pilih">×</button></div>'
  const tableWrap = table.closest('.x-table-wrap, .request-table-wrap, .mep-table-wrap') || table.parentElement
  tableWrap?.parentElement?.insertBefore(toolbar, tableWrap)
  return toolbar
}

function syncGenericBulkUI(table, toolbar) {
  if (!table || !toolbar) return
  const rows = getBulkRows(table)
  const selected = rows.filter(row => row.dataset.dptBulkSelected === 'true')
  const deletable = selected.filter(row => { const button = getBulkDeleteButton(row); return Boolean(button && !button.disabled) })
  const allSelected = rows.length > 0 && selected.length === rows.length
  const count = toolbar.querySelector('.dpt-bulk-selection-count')
  const selectAll = toolbar.querySelector('.dpt-bulk-select-all')
  const deleteButton = toolbar.querySelector('.dpt-bulk-delete')
  if (count) count.textContent = `${selected.length} dipilih`
  if (selectAll) selectAll.textContent = allSelected ? 'Batalkan semua' : 'Pilih semua'
  if (deleteButton) { deleteButton.textContent = `Hapus ${deletable.length}`; deleteButton.disabled = deletable.length === 0 }
  rows.forEach(row => {
    const checkbox = row.querySelector('.dpt-bulk-select-input')
    if (checkbox) checkbox.checked = row.dataset.dptBulkSelected === 'true'
    row.classList.toggle('dpt-bulk-selected-row', row.dataset.dptBulkSelected === 'true')
  })
  const headCheckbox = table.querySelector('thead .dpt-bulk-select-head-input')
  if (headCheckbox) headCheckbox.checked = allSelected
}

function removeGenericBulkUI(table) {
  if (!table) return
  table.querySelectorAll('thead .dpt-bulk-select-head').forEach(cell => cell.remove())
  table.querySelectorAll('tbody .dpt-bulk-select-cell').forEach(cell => cell.remove())
  table.querySelectorAll('tbody tr.dpt-bulk-selected-row').forEach(row => { delete row.dataset.dptBulkSelected; row.classList.remove('dpt-bulk-selected-row') })
  table.parentElement?.parentElement?.querySelectorAll('.dpt-bulk-selection-toolbar').forEach(toolbar => toolbar.remove())
  delete table.dataset.dptBulkMode
}

function enterGenericBulkMode(table, firstRow = null, context = '') {
  if (!table || hasNativeBulkSelection(table, context)) return
  const rows = getBulkRows(table)
  if (!rows.length || !rows.some(row => getBulkDeleteButton(row))) return
  clearRowSelection(table)
  table.dataset.dptBulkMode = 'true'
  const header = table.querySelector('thead tr')
  if (header && !header.querySelector('.dpt-bulk-select-head')) {
    const th = document.createElement('th')
    th.className = 'dpt-bulk-select-head'
    th.innerHTML = '<input class="dpt-bulk-select-head-input" type="checkbox" aria-label="Pilih semua data">'
    header.insertBefore(th, header.firstChild)
  }
  getBulkRows(table).forEach(row => {
    if (row.querySelector('.dpt-bulk-select-cell')) return
    const td = document.createElement('td')
    td.className = 'dpt-bulk-select-cell'
    td.innerHTML = '<input class="dpt-bulk-select-input" type="checkbox" aria-label="Pilih baris">'
    row.insertBefore(td, row.firstChild)
    const checkbox = td.querySelector('input')
    checkbox.addEventListener('click', event => event.stopPropagation())
    checkbox.addEventListener('change', () => { row.dataset.dptBulkSelected = checkbox.checked ? 'true' : 'false'; syncGenericBulkUI(table, toolbar) })
  })
  const toolbar = table.parentElement?.parentElement?.querySelector('.dpt-bulk-selection-toolbar') || createGenericBulkToolbar(table)
  if (firstRow) firstRow.dataset.dptBulkSelected = 'true'
  syncGenericBulkUI(table, toolbar)
  const selectAll = toolbar.querySelector('.dpt-bulk-select-all')
  if (selectAll && !selectAll.dataset.bound) {
    selectAll.dataset.bound = '1'
    selectAll.addEventListener('click', () => {
      const rowsNow = getBulkRows(table)
      const all = rowsNow.length > 0 && rowsNow.every(row => row.dataset.dptBulkSelected === 'true')
      rowsNow.forEach(row => { row.dataset.dptBulkSelected = all ? 'false' : 'true' })
      syncGenericBulkUI(table, toolbar)
    })
  }
  const cancel = toolbar.querySelector('.dpt-bulk-cancel')
  if (cancel && !cancel.dataset.bound) { cancel.dataset.bound = '1'; cancel.addEventListener('click', () => removeGenericBulkUI(table)) }
  const deleteButton = toolbar.querySelector('.dpt-bulk-delete')
  if (deleteButton && !deleteButton.dataset.bound) {
    deleteButton.dataset.bound = '1'
    deleteButton.addEventListener('click', async () => {
      const selectedRows = getBulkRows(table).filter(row => row.dataset.dptBulkSelected === 'true')
      const deletableRows = selectedRows.filter(row => { const button = getBulkDeleteButton(row); return Boolean(button && !button.disabled) })
      if (!deletableRows.length) return
      if (!window.confirm(`Hapus ${deletableRows.length} data terpilih?`)) return
      const originalConfirm = window.confirm
      const previousBulkFlag = window.__transportBulkDeleteActive
      window.__transportBulkDeleteActive = true
      window.confirm = () => true
      try {
        for (const row of deletableRows) {
          if (!row.isConnected) continue
          const button = getBulkDeleteButton(row)
          if (!button || button.disabled) continue
          button.click()
          await new Promise(resolve => {
            const started = performance.now()
            const check = () => { if (!row.isConnected || !table.contains(row) || performance.now() - started >= 4500) return resolve(); window.setTimeout(check, 60) }
            check()
          })
        }
      } finally {
        window.confirm = originalConfirm
        window.__transportBulkDeleteActive = previousBulkFlag
        removeGenericBulkUI(table)
      }
    })
  }
  const headCheckbox = header?.querySelector('.dpt-bulk-select-head-input')
  if (headCheckbox && !headCheckbox.dataset.bound) {
    headCheckbox.dataset.bound = '1'
    headCheckbox.addEventListener('click', event => event.stopPropagation())
    headCheckbox.addEventListener('change', () => {
      const all = getBulkRows(table).every(row => row.dataset.dptBulkSelected === 'true')
      getBulkRows(table).forEach(row => { row.dataset.dptBulkSelected = all ? 'false' : 'true' })
      syncGenericBulkUI(table, toolbar)
    })
  }
}

function columnSignature(descriptors) {
  return descriptors.map(column => `${column.key}=${column.label}=${column.index}`).join('|')
}
function simpleHash(value) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return (hash >>> 0).toString(16) }
function rowKey(context, row) { const cells = Array.from(row.children).filter(cell => !cell.classList.contains('dpt-row-mark-cell')); const values = cells.map(cell => { const control = cell.querySelector('input,select,textarea'); return control ? `${control.tagName}:${control.defaultValue || control.value}` : cell.textContent.trim() }); return `${context}:${simpleHash(values.join('\u241f') || `row-${row.rowIndex}`)}` }
function applyMark(row, mark) { Object.values(ROW_MARKS).forEach(item => { if (item.className) row.classList.remove(item.className) }); if (ROW_MARKS[mark]?.className) row.classList.add(ROW_MARKS[mark].className) }
function createRowMarkToolbar() { const toolbar = document.createElement('div'); toolbar.className = 'dpt-row-mark-toolbar'; toolbar.innerHTML = '<div class="dpt-row-mark-title"><b>Penanda</b><span>Status kerja baris utama</span></div><div class="dpt-row-mark-controls"><label>Filter <select class="dpt-row-mark-filter"><option value="ALL">Semua</option><option value="NONE">Belum ditandai</option><option value="TODO">Perlu dikerjakan</option><option value="PROCESS">Sedang dikerjakan</option><option value="DONE">Sudah selesai</option><option value="CHECKED">Sudah dicek</option></select></label><button type="button" class="dpt-row-mark-clear">Reset tanda</button></div>'; return toolbar }
function ensureTableMarks(context, table, scope) {
  if (!table) return

  const marks = readRowMarks()
  const showRowMarks = readRowMarkVisibility(context)
  scope?.classList.toggle('dpt-row-marks-hidden', !showRowMarks)
  table.dataset.dptRowMarksReady = '1'

  let toolbar = scope.querySelector('.dpt-row-mark-toolbar')
  if (!toolbar) {
    toolbar = createRowMarkToolbar()
    const tableHost = table.closest('.x-table-wrap, .request-table-wrap, .dpt-preview') || table.parentElement
    tableHost?.parentElement?.insertBefore(toolbar, tableHost)
  }

  const header = table.querySelector('thead tr')
  if (header && !header.querySelector('.dpt-row-mark-head')) {
    const th = document.createElement('th')
    th.className = 'dpt-row-mark-head'
    th.textContent = 'Tanda'
    header.insertBefore(th, header.firstChild)
  }

  table.querySelectorAll('tbody tr').forEach(row => {
    if (row.querySelector('.dpt-row-mark-cell') || row.querySelector('td[colspan]')) return

    const key = rowKey(context, row)
    row.dataset.dptRowMarkKey = key

    const td = document.createElement('td')
    td.className = 'dpt-row-mark-cell'
    const select = document.createElement('select')
    select.className = 'dpt-row-mark-select'

    Object.entries(ROW_MARKS).forEach(([value, item]) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = item.label
      select.appendChild(option)
    })

    const current = marks[key] || 'NONE'
    select.value = current
    applyMark(row, current)

    select.addEventListener('change', () => {
      const latest = readRowMarks()
      if (select.value === 'NONE') delete latest[key]
      else latest[key] = select.value
      writeRowMarks(latest)
      applyMark(row, select.value)
    })

    td.appendChild(select)
    row.insertBefore(td, row.firstChild)
  })

  const filter = toolbar.querySelector('.dpt-row-mark-filter')
  const applyFilter = () => {
    const latest = readRowMarks()
    const value = filter?.value || 'ALL'
    table.querySelectorAll('tbody tr').forEach(row => {
      if (row.querySelector('td[colspan]')) return
      const key = row.dataset.dptRowMarkKey
      row.style.display = value === 'ALL' || (latest[key] || 'NONE') === value ? '' : 'none'
    })
  }

  if (filter && !filter.dataset.bound) {
    filter.dataset.bound = '1'
    filter.addEventListener('change', applyFilter)
  }

  const clear = toolbar.querySelector('.dpt-row-mark-clear')
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = '1'
    clear.addEventListener('click', () => {
      const latest = readRowMarks()
      table.querySelectorAll('tbody tr').forEach(row => {
        const key = row.dataset.dptRowMarkKey
        if (key) delete latest[key]
        const select = row.querySelector('.dpt-row-mark-select')
        if (select) select.value = 'NONE'
        row.style.display = ''
        applyMark(row, 'NONE')
      })
      writeRowMarks(latest)
      if (filter) filter.value = 'ALL'
    })
  }

  applyFilter()
}
function ensureRowMarks(context) {
  const visible = table => {
    if (!table || table.closest('.dpt-preview')) return true
    const rect = table.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const previewTables = Array.from(document.querySelectorAll('.dpt-preview table'))
    .filter(visible)
    .slice(0, 1)
    .map(table => ({ table, scope: table.closest('.dpt-preview') || document.body }))

  const selector = DATA_TABLE_SELECTOR[context]
  const dataTables = selector
    ? Array.from(document.querySelectorAll(selector))
      .filter(table => isMainOperationalTable(table) && !table.matches('.m-table') && !table.hasAttribute('data-no-row-marks') && visible(table))
      .sort((a, b) => {
        const aTop = a.getBoundingClientRect().top
        const bTop = b.getBoundingClientRect().top
        return aTop - bTop
      })
      .slice(0, 1)
      .map(table => ({ table, scope: table.closest('.x-card, .request-panel, .master-excel-page') || table.parentElement || document.body }))
    : []

  ;[...previewTables, ...dataTables].forEach(({ table, scope }) => ensureTableMarks(context, table, scope))
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false)
  const [importReport, setImportReport] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showRowMarks, setShowRowMarks] = useState(() => readRowMarkVisibility(context))
  const [cleanTableView, setCleanTableView] = useState(() => readCleanTableView(context))
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [columns, setColumns] = useState([])
  const [columnVisibility, setColumnVisibility] = useState(() => readColumnVisibility(context))
  const columnMenuRef = useRef(null)
  const primaryTableRef = useRef(null)
  const canImport = ['kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen'].includes(context) && ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canExport = ['kendaraan', 'pengajuan', 'service', 'sewa', 'dokumen'].includes(context)

  useEffect(() => {
    const clean = readCleanTableView(context)
    setShowRowMarks(readRowMarkVisibility(context))
    setCleanTableView(clean)
    setColumnVisibility(readColumnVisibility(context))
    setShowColumnMenu(false)
    applyCleanRoot(clean)
  }, [context])

  useEffect(() => {
    const handleOutside = event => {
      if (showColumnMenu && columnMenuRef.current && !columnMenuRef.current.contains(event.target)) setShowColumnMenu(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showColumnMenu])

  useEffect(() => {
    const onVisibilityChange = event => {
      if (!event.detail || event.detail.context === context) {
        ensureRowMarks(context)
        const nextVisibility = readColumnVisibility(context)
        const clean = readCleanTableView(context)
        applyCleanRoot(clean)
        getAllOperationalTables(context).forEach(table => applyColumnVisibility(context, table, getColumnDescriptors(context, table), nextVisibility, clean))
      }
    }
    window.addEventListener('transport:row-mark-visibility', onVisibilityChange)
    window.addEventListener('transport:column-visibility', onVisibilityChange)
    window.addEventListener('transport:clean-table-view', onVisibilityChange)
    return () => {
      window.removeEventListener('transport:row-mark-visibility', onVisibilityChange)
      window.removeEventListener('transport:column-visibility', onVisibilityChange)
      window.removeEventListener('transport:clean-table-view', onVisibilityChange)
    }
  }, [context])

  useEffect(() => {
    try { const saved = sessionStorage.getItem('transport_import_report'); if (saved) { const parsed = JSON.parse(saved); if (hasReport(parsed) && parsed.context === context) setImportReport(parsed); sessionStorage.removeItem('transport_import_report') } }
    catch { sessionStorage.removeItem('transport_import_report') }
  }, [context])

  useEffect(() => {
    let timer
    const run = () => {
      ensureRowMarks(context)
      const table = getPrimaryDataTable(context)
      primaryTableRef.current = table
      const nextColumns = getColumnDescriptors(context, table)
      setColumns(current => columnSignature(current) === columnSignature(nextColumns) ? current : nextColumns)
      const latestVisibility = readColumnVisibility(context)
      const clean = readCleanTableView(context)
      setColumnVisibility(latestVisibility)
      setCleanTableView(clean)
      applyCleanRoot(clean)
      getAllOperationalTables(context).forEach(item => {
        applyColumnVisibility(context, item, getColumnDescriptors(context, item), latestVisibility, clean)
        ensureRowSelection(context, item)
        if (!hasNativeBulkSelection(item, context) && item.dataset.dptBulkMode === 'true') enterGenericBulkMode(item, null)
      })
      if (clean) {
        window.requestAnimationFrame(() => getAllOperationalTables(context).forEach(item => {
          applyColumnVisibility(context, item, getColumnDescriptors(context, item), latestVisibility, true)
          ensureRowSelection(context, item)
        }))
      }
    }
    run()
    const observerTarget = document.querySelector('.content-container') || document.body
    const isOwnedDataToolsNode = node => {
      if (!(node instanceof Element)) return true
      return node.matches('.dpt-inline-row-actions, .dpt-row-mark-cell, .dpt-row-mark-head, .dpt-bulk-select-cell, .dpt-bulk-select-head, .dpt-bulk-selection-toolbar') ||
        Boolean(node.closest('.dpt-inline-row-actions, .dpt-bulk-selection-toolbar'))
    }
    const mutationNeedsScan = mutations => mutations.some(mutation => {
      if (!mutation.addedNodes.length && !mutation.removedNodes.length) return false
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]
      return changedNodes.some(node => !isOwnedDataToolsNode(node))
    })
    const scheduleRun = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(run, { timeout: 260 })
      } else {
        timer = window.setTimeout(run, 120)
      }
    }
    let idleId = 0
    const observer = new MutationObserver(mutations => {
      if (!mutationNeedsScan(mutations)) return
      if (idleId && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      clearTimeout(timer)
      scheduleRun()
    })
    observer.observe(observerTarget, { childList: true, subtree: true })
    return () => {
      if (idleId && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      clearTimeout(timer)
      observer.disconnect()
      applyCleanRoot(false)
    }
  }, [context])

  if (!CONTEXT_LABEL[context]) return null
  const doExport = async () => { if (!onExport || exporting) return; setExporting(true); try { await onExport() } finally { setExporting(false) } }
  const toggleCleanTableView = () => {
    const next = !cleanTableView
    const nextVisibility = { ...columnVisibility }
    columns.forEach(column => {
      if (!next && (column.kind === 'action' || column.kind === 'mark')) nextVisibility[column.key] = true
      if (next && column.kind === 'action') nextVisibility[column.key] = false
      if (next && column.kind === 'mark') nextVisibility[column.key] = false
    })
    setCleanTableView(next)
    setColumnVisibility(nextVisibility)
    setShowRowMarks(!next)
    writeCleanTableView(context, next)
    writeColumnVisibility(context, nextVisibility)
    writeRowMarkVisibility(context, !next)
    applyCleanRoot(next)
    getAllOperationalTables(context).forEach(item => applyColumnVisibility(context, item, getColumnDescriptors(context, item), nextVisibility, next))
    window.requestAnimationFrame(() => getAllOperationalTables(context).forEach(item => applyColumnVisibility(context, item, getColumnDescriptors(context, item), nextVisibility, next)))
    window.dispatchEvent(new CustomEvent('transport:row-mark-visibility', { detail: { context, visible: !next } }))
    window.dispatchEvent(new CustomEvent('transport:clean-table-view', { detail: { context, enabled: next } }))
  }
  const visibleColumnCount = columns.filter(column => {
    const hiddenByClean = cleanTableView && (column.kind === 'mark' || column.kind === 'action')
    return column.label && !hiddenByClean && isColumnVisible(column, columnVisibility, showRowMarks)
  }).length
  const hiddenColumnCount = columns.filter(column => column.label && (cleanTableView && (column.kind === 'mark' || column.kind === 'action') ? true : !isColumnVisible(column, columnVisibility, showRowMarks))).length
  const setColumnVisible = (column, visible) => {
    if (!column) return
    if (cleanTableView && (column.kind === 'action' || column.kind === 'mark')) return
    if (!visible && visibleColumnCount <= 1) return
    const nextVisibility = { ...columnVisibility, [column.key]: visible }
    setColumnVisibility(nextVisibility)
    writeColumnVisibility(context, nextVisibility)
    if (column.kind === 'mark') {
      setShowRowMarks(visible)
      writeRowMarkVisibility(context, visible)
      window.dispatchEvent(new CustomEvent('transport:row-mark-visibility', { detail: { context, visible } }))
    }
    getAllOperationalTables(context).forEach(item => applyColumnVisibility(context, item, getColumnDescriptors(context, item), nextVisibility, readCleanTableView(context)))
    window.dispatchEvent(new CustomEvent('transport:column-visibility', { detail: { context, column: column.key, visible } }))
  }
  const showAllColumns = () => {
    const nextVisibility = {}
    columns.forEach(column => { nextVisibility[column.key] = true })
    setColumnVisibility(nextVisibility)
    setShowRowMarks(true)
    setCleanTableView(false)
    writeColumnVisibility(context, nextVisibility)
    writeRowMarkVisibility(context, true)
    writeCleanTableView(context, false)
    applyCleanRoot(false)
    getAllOperationalTables(context).forEach(item => applyColumnVisibility(context, item, getColumnDescriptors(context, item), nextVisibility, false))
    window.dispatchEvent(new CustomEvent('transport:row-mark-visibility', { detail: { context, visible: true } }))
    window.dispatchEvent(new CustomEvent('transport:clean-table-view', { detail: { context, enabled: false } }))
  }
  const closeImport = () => setShowImport(false)
  const finishImport = report => {
    setShowImport(false)
    if (hasReport(report)) setImportReport(report)
    window.dispatchEvent(new CustomEvent('transport:data-imported', { detail: { context, source: 'excel-import' } }))
  }
  const refreshAfterImport = () => { setImportReport(null); window.dispatchEvent(new CustomEvent('transport:data-imported', { detail: { context, source: 'excel-import' } })) }
  const modal = showImport && (context === 'kendaraan' ? <VehicleExcelImportV2 profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'pengajuan' ? <PengajuanExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'service' ? <EditableServiceExcelImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'dokumen' ? <VehicleDocumentsImportModal profile={profile} onClose={closeImport} onDone={finishImport} /> : context === 'sewa' ? <RentalHistoryImportModalV2 profile={profile} onClose={closeImport} onDone={finishImport} /> : <UnifiedExcelImportModalSafe context={context} profile={profile} onClose={closeImport} onDone={finishImport} />)

  return <div className="dpt-tools-host" data-clean-table-view={cleanTableView ? 'true' : 'false'} data-context={context}>
    {modal}
    {importReport && <div className="dpt-overlay" role="dialog" aria-modal="true"><section className="dpt-modal import-result-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT SELESAI</span><h3>Rekonsiliasi Data {CONTEXT_LABEL[importReport.context] || 'Excel'}</h3><p>Perbedaan jumlah antara Excel dan data sistem dijelaskan di sini.</p></div><button type="button" className="dpt-icon" onClick={() => setImportReport(null)}>×</button></header><div className="service-import-stats"><div><b>{importReport.sourceRows ?? 0}</b><span>baris sumber</span></div><div><b>{importReport.validRows ?? importReport.sourceRows ?? 0}</b><span>baris valid</span></div><div><b>{importReport.uniqueVehicles ?? importReport.imported ?? 0}</b><span>data unik</span></div><div><b>{importReport.mergedDuplicates ?? importReport.skipped ?? 0}</b><span>duplikat/skip</span></div></div><div className="vehicle-import-explanation"><b>Hasil penyimpanan</b>{importReport.added != null && <span>Data baru: <strong>{importReport.added}</strong></span>}{importReport.updated != null && <span>Data diperbarui: <strong>{importReport.updated}</strong></span>}{importReport.driversCreated != null && <span>Driver dibuat: <strong>{importReport.driversCreated}</strong></span>}</div>{importReport.message && <div className="vehicle-import-note"><b>Detail hasil import</b><span>{importReport.message}</span></div>}<div className="dpt-actions"><button type="button" className="dpt-button" onClick={() => setImportReport(null)}>Tutup</button><button type="button" className="dpt-button primary" onClick={refreshAfterImport}>Refresh Data Sistem</button></div></section></div>}
    <div className="dpt-toolbar">
      <div className="dpt-toolbar-title">
        <span className="eyebrow">AKSI TAMPILAN</span>
        <b>{CONTEXT_LABEL[context]}</b>
        <span className="dpt-toolbar-help">Klik 1x pada baris untuk menampilkan aksi. Klik 2x untuk masuk mode pilih banyak data jika modul mendukung.</span>
      </div>
      <div className="dpt-toolbar-actions">
        <button className={`dpt-button clean-action${cleanTableView ? ' active' : ''}`} type="button" onClick={toggleCleanTableView} title={cleanTableView ? 'Tampilkan kembali tombol Aksi dan Penanda' : 'Sembunyikan tombol Aksi dan Penanda agar tabel hanya fokus pada data'}>
          <span className="dpt-button-icon" aria-hidden="true">▤</span>
          <span>{cleanTableView ? 'Mode Excel: Data Bersih' : 'Tampilkan Fitur'}</span>
        </button>
        <div className="dpt-column-popover" ref={columnMenuRef}>
          <button className="dpt-button secondary" type="button" onClick={() => setShowColumnMenu(current => !current)} disabled={!columns.length} aria-expanded={showColumnMenu} aria-haspopup="menu">
            <span className="dpt-button-icon" aria-hidden="true">☷</span>
            <span>Atur Kolom{hiddenColumnCount ? ` (${hiddenColumnCount})` : ''}</span>
          </button>
          {showColumnMenu && <div className="dpt-column-menu" role="menu">
            <div className="dpt-column-menu-head">
              <div><b>Atur Kolom Data</b><span>Pilih kolom yang ingin ditampilkan.</span></div>
              <button type="button" className="dpt-column-close" onClick={() => setShowColumnMenu(false)} aria-label="Tutup">×</button>
            </div>
            <div className="dpt-column-quick">
              <button type="button" onClick={toggleCleanTableView}>{cleanTableView ? 'Tampilkan Fitur' : 'Mode Data Bersih'}</button>
              <button type="button" onClick={showAllColumns}>Tampilkan Semua</button>
            </div>
            <div className="dpt-column-list">{columns.map(column => {
              const forcedHidden = cleanTableView && (column.kind === 'mark' || column.kind === 'action')
              const visible = forcedHidden ? false : isColumnVisible(column, columnVisibility, showRowMarks)
              const disableToggle = forcedHidden || (visible && visibleColumnCount <= 1)
              return <label className="dpt-column-item" key={column.key}>
                <input type="checkbox" checked={visible} disabled={disableToggle} onChange={event => setColumnVisible(column, event.target.checked)} />
                <span>{column.label}</span>
                <small>{forcedHidden ? 'Disembunyikan' : column.kind === 'mark' ? 'Penanda' : column.kind === 'action' ? 'Aksi baris' : 'Data'}</small>
              </label>
            })}</div>
            <div className="dpt-column-note">{hiddenColumnCount ? `${hiddenColumnCount} kolom disembunyikan.` : 'Semua kolom sedang ditampilkan.'}</div>
          </div>}
        </div>
        {canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}><span className="dpt-button-icon" aria-hidden="true">⇧</span><span>Import Excel</span></button>}
        {canExport && <button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}><span className="dpt-button-icon" aria-hidden="true">⇩</span><span>{exporting ? 'Sedang Export...' : 'Export Excel'}</span></button>}
      </div>
    </div>
  </div>
}