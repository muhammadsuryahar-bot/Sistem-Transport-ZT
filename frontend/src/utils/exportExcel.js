function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function printableValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  return value
}

export function exportToExcel(filename, sections) {
  const generatedAt = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date())

  const body = sections.map((section) => {
    const columns = section.columns || []
    const rows = section.rows || []

    return `
      <table>
        <tr><th colspan="${columns.length}" class="section-title">${escapeHtml(section.title || 'Rekap')}</th></tr>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label || column.key)}</th>`).join('')}</tr>
        ${rows.length
          ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(printableValue(row[column.key]))}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}">Tidak ada data</td></tr>`
        }
      </table>
      <div class="section-gap"></div>
    `
  }).join('')

  const html = `﻿<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Rekap Sistem Transport ZT</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#17211c}
  h1{font-size:18pt;margin:0 0 4px}
  p{margin:0 0 14px;color:#55635c}
  table{border-collapse:collapse;width:100%;margin:0}
  th,td{border:1px solid #cfdad4;padding:6px 8px;vertical-align:top}
  th{background:#123b2a;color:#fff;font-weight:700;text-align:left}
  td{mso-number-format:"@"}
  .section-title{background:#dfeee6;color:#123b2a;font-size:13pt;text-align:left}
  .section-gap{height:18px}
</style>
</head>
<body>
<h1>Rekap Sistem Transport PT Zaman Teknindo</h1>
<p>Dibuat dari data yang tersedia pada sistem • ${escapeHtml(generatedAt)}</p>
${body}
</body>
</html>`

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.toLowerCase().endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
