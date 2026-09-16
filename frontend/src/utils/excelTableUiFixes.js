const normalizeHeader = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.:]/g, '').replace(/_/g, ' ')

const NO_HEADERS = new Set(['no', 'nomor', 'nomor urut', 'nomor urutan', 'baris', 'row'])
const HEADER_RENAMES = new Map([
  ['nomor polisi', 'No. Pol'],
  ['no polisi', 'No. Pol'],
  ['no pol', 'No. Pol'],
  ['nomor mesin', 'No. Mesin'],
  ['no mesin', 'No. Mesin'],
  ['nomor rangka', 'No. Rangka'],
  ['no rangka', 'No. Rangka'],
  ['lokasi', 'Lokasi Kerja'],
  ['lokasi kerja', 'Lokasi Kerja'],
])

function ensureNumberColumn(table) {
  const headerRow = table.tHead?.rows?.[0]
  if (!headerRow) return
  const headers = Array.from(headerRow.cells)
  const noIndex = headers.findIndex(cell => NO_HEADERS.has(normalizeHeader(cell.textContent)))

  if (noIndex >= 0) {
    const header = headers[noIndex]
    header.textContent = 'No'
    table.tBodies.forEach(body => {
      Array.from(body.rows).forEach((row, index) => {
        const cell = row.cells[noIndex]
        if (cell && !cell.querySelector('input,select,textarea,button')) cell.textContent = String(index + 1)
      })
    })
  } else {
    const th = document.createElement('th')
    th.textContent = 'No'
    headerRow.insertBefore(th, headerRow.firstChild)
    table.tBodies.forEach(body => {
      Array.from(body.rows).forEach((row, index) => {
        const td = document.createElement('td')
        td.textContent = String(index + 1)
        row.insertBefore(td, row.firstChild)
      })
    })
  }
}

function normalizeHeaders(table) {
  const headerRow = table.tHead?.rows?.[0]
  if (!headerRow) return
  Array.from(headerRow.cells).forEach(cell => {
    const normalized = normalizeHeader(cell.textContent)
    const replacement = HEADER_RENAMES.get(normalized)
    if (replacement) cell.textContent = replacement
  })
}

function enhanceImportTables() {
  document.querySelectorAll('.dpt-preview table').forEach(table => {
    if (table.dataset.excelUiFixed === '1') return
    normalizeHeaders(table)
    ensureNumberColumn(table)
    table.dataset.excelUiFixed = '1'
  })
}

let timer = 0
const observer = new MutationObserver(() => {
  window.clearTimeout(timer)
  timer = window.setTimeout(enhanceImportTables, 30)
})

export function initExcelTableUiFixes() {
  enhanceImportTables()
  observer.observe(document.body, { childList: true, subtree: true })
}
