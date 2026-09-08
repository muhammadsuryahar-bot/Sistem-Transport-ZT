function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function printableValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  return value
}

function safeSheetName(name, index) {
  const cleaned = String(name || `Rekap ${index + 1}`)
    .replace(/[\\/:?*\[\]]/g, '-')
    .slice(0, 31)
  return cleaned || `Rekap ${index + 1}`
}

function cellXml(value, header = false) {
  const printable = printableValue(value)
  const type = typeof printable === 'number' && Number.isFinite(printable) ? 'Number' : 'String'
  return `<Cell${header ? ' ss:StyleID="Header"' : ''}><Data ss:Type="${type}">${escapeXml(printable)}</Data></Cell>`
}

export function exportToExcel(filename, sections) {
  const generatedAt = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date())

  const safeSections = (sections || []).map((section, index) => ({
    title: section?.title || `Rekap ${index + 1}`,
    columns: section?.columns || [],
    rows: section?.rows || [],
  }))

  const worksheets = safeSections.map((section, index) => {
    const headers = section.columns.map(column => column.label || column.key)
    const rows = section.rows
    const columnsCount = Math.max(1, section.columns.length)
    const tableRows = [
      `<Row ss:AutoFitHeight="0"><Cell ss:MergeAcross="${Math.max(0, columnsCount - 1)}" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(section.title)}</Data></Cell></Row>`,
      `<Row>${headers.map(header => cellXml(header, true)).join('')}</Row>`,
      ...(rows.length
        ? rows.map(row => `<Row>${section.columns.map(column => cellXml(row?.[column.key])).join('')}</Row>`)
        : [`<Row><Cell ss:MergeAcross="${Math.max(0, columnsCount - 1)}"><Data ss:Type="String">Tidak ada data</Data></Cell></Row>`]),
    ].join('')

    return `<Worksheet ss:Name="${escapeXml(safeSheetName(section.title, index))}"><Table>${tableRows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane><ActivePane>2</ActivePane><ProtectContents>False</ProtectContents><ProtectObjects>False</WorksheetOptions></Worksheet>`
  }).join('')

  const summarySheet = `<Worksheet ss:Name="INFO"><Table><Column ss:Width="180"/><Column ss:Width="520"/><Row><Cell ss:StyleID="Title"><Data ss:Type="String">Rekap Sistem Transport PT Zaman Teknindo</Data></Cell><Cell ss:StyleID="Title"><Data ss:Type="String">Dibuat ${escapeXml(generatedAt)}</Data></Cell></Row><Row><Cell ss:StyleID="Header"><Data ss:Type="String">Isi File</Data></Cell><Cell ss:StyleID="Header"><Data ss:Type="String">Sheet terpisah per kelompok data agar mudah dibaca dan dicetak.</Data></Cell></Row>${safeSections.map((section, index) => `<Row><Cell><Data ss:Type="Number">${index + 1}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(section.title)}</Data></Cell></Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`

  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>PT Zaman Teknindo</Author><Title>Rekap Sistem Transport</Title><Created>${new Date().toISOString()}</Created></DocumentProperties><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/><Alignment ss:Vertical="Top"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4DDD8"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4DDD8"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4DDD8"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4DDD8"/></Borders></Style><Style ss:ID="Title"><Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1"/><Interior ss:Color="#DFEEE6" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="Header"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#123B2A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style></Styles>${summarySheet}${worksheets}</Workbook>`

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.toLowerCase().endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
