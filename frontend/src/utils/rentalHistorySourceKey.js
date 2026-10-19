/**
 * Composite identity for a rental-history row from an imported workbook.
 * Row numbers repeat across different Excel files; they are only unique inside
 * a particular source file and worksheet.
 */
export function rentalHistorySourceRowKey(row) {
  const file = String(row?.source_file ?? '').trim()
  const sheet = String(row?.source_sheet ?? '').trim()
  const excelRow = Number(row?.excel_row)
  if (!file || !sheet || !Number.isInteger(excelRow) || excelRow < 1) {
    throw new TypeError('Identitas sumber Rental harus berisi nama file, nama sheet, dan nomor baris Excel positif.')
  }
  return JSON.stringify([file, sheet, excelRow])
}
