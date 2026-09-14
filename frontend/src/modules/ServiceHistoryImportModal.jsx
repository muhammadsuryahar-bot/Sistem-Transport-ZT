import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'
import './ServiceHistoryImportModal.css'

const ALIASES = {
  nomor_polisi: ['no_polisi', 'no_pol', 'nomor_polisi', 'no_plat', 'plat'],
  merk: ['merk', 'brand'],
  tipe: ['tipe', 'type'],
  jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'],
  driver: ['driver_pic', 'driver', 'nama_driver'],
  tanggal: ['tanggal', 'tgl', 'tanggal_service'],
  jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'pekerjaan'],
  uraian: ['uraian', 'keterangan', 'catatan', 'deskripsi'],
  qty: ['qty', 'jumlah'],
  satuan: ['sat', 'satuan', 'unit'],
  harga_satuan: ['harga_satuan', 'harga_satuan_rp', 'harga'],
  nilai_dpp: ['nilai_dpp', 'dpp'],
  ppn: ['ppn', 'ppn_rp'],
  total: ['total', 'nilai_total', 'jumlah_rp', 'biaya', 'biaya_rp', 'biaya_service'],
  kilometer: ['km', 'kilometer', 'km_terakhir'],
  bengkel: ['nama_bengkel', 'bengkel', 'nama_bengkel_service'],
  keterangan: ['keterangan', 'catatan'],
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (value) => clean(value).toUpperCase()
const MAX_FILE_SIZE = 10 * 1024 * 1024

function colIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}

function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = view.getUint16(eocd + 10, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  const entries = new Map()
  let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const local = new DataView(buffer, localOffset)
    const localNameLen = local.getUint16(26, true)
    const localExtraLen = local.getUint16(28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return {
    read: async (name) => {
      const entry = entries.get(name)
      if (!entry) return null
      if (entry.method === 0) return entry.bytes
      if (entry.method === 8) return inflate(entry.bytes)
      throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`)
    },
  }
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach((row) => {
    const values = []
    row.querySelectorAll(':scope > c').forEach((cell) => {
      const ref = cell.getAttribute('r') || ''
      const match = ref.match(/^([A-Z]+)/)
      if (!match) return
      const idx = colIndex(match[1])
      const type = cell.getAttribute('t') || ''
      let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map((node) => node.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    if (values.some((value) => clean(value))) rows.push({ excelRow: Number(row.getAttribute('r') || rows.length + 1), values })
  })
  return rows
}

async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbook = new DOMParser().parseFromString(text(await zip.read('xl/workbook.xml') || new Uint8Array()), 'application/xml')
  const rels = new DOMParser().parseFromString(text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array()), 'application/xml')
  const sharedStrings = []
  const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) {
    const doc = new DOMParser().parseFromString(text(shared), 'application/xml')
    doc.querySelectorAll('si').forEach((si) => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join(''))))
  }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]
    if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    sheets.push({ name: sheet.getAttribute('name') || target, rows: parseSheetXml(text(await zip.read(target) || new Uint8Array()), sharedStrings) })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1, excelRow: 1 }
  sheet.rows.slice(0, 80).forEach((item, idx) => {
    const score = item.values.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row: item.values, score, excelRow: item.excelRow }
  })
  return best
}

function getValue(row, headers, key) {
  const aliases = ALIASES[key] || [key]
  const index = headers.findIndex((header) => aliases.includes(norm(header)))
  return index >= 0 ? clean(row.values[index]) : ''
}

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[/-]/)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function formatDate(v) {
  if (!v) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${v}T00:00:00`))
}

function parseRow(row, headers) {
  return {
    excelRow: row.excelRow,
    nomor_polisi: upper(getValue(row, headers, 'nomor_polisi')),
    merk: getValue(row, headers, 'merk'),
    tipe: getValue(row, headers, 'tipe'),
    jenis: getValue(row, headers, 'jenis'),
    driver: getValue(row, headers, 'driver'),
    tanggal: excelDate(getValue(row, headers, 'tanggal')),
    jenis_pekerjaan: getValue(row, headers, 'jenis_pekerjaan'),
    uraian: getValue(row, headers, 'uraian'),
    qty: numberValue(getValue(row, headers, 'qty')) ?? 1,
    satuan: getValue(row, headers, 'satuan') || 'pcs',
    harga_satuan: numberValue(getValue(row, headers, 'harga_satuan')) ?? 0,
    nilai_dpp: numberValue(getValue(row, headers, 'nilai_dpp')) ?? 0,
    ppn: numberValue(getValue(row, headers, 'ppn')) ?? 0,
    total: numberValue(getValue(row, headers, 'total')) ?? 0,
    kilometer: numberValue(getValue(row, headers, 'kilometer')) ?? 0,
    bengkel: getValue(row, headers, 'bengkel') || null,
    keterangan: getValue(row, headers, 'keterangan') || null,
  }
}

function transactionType(rows) {
  const raw = rows.map((row) => upper(row.jenis_pekerjaan)).join(' ')
  if (/BAN/.test(raw)) return 'GANTI_BAN'
  if (/AKI|BATERAI/.test(raw)) return 'GANTI_AKI'
  if (/PEMERIKSA/.test(raw)) return 'PEMERIKSAAN'
  return 'SERVICE'
}

function normalizeItemCategory(textValue) {
  const raw = upper(textValue)
  if (/BAN/.test(raw)) return 'BAN'
  if (/AKI|BATERAI/.test(raw)) return 'AKI_BATERAI'
  if (/JASA|SERVICE/.test(raw)) return 'JASA_SERVICE'
  return 'MATERIAL_SPAREPART'
}

function chooseServiceSheet(sheets) {
  return sheets
    .map((sheet) => {
      const header = findHeader(sheet)
      const h = header.row.map(norm)
      let score = 0
      const name = norm(sheet.name)
      if (name.includes('data_service')) score += 12
      if (name.includes('rekapan_permintaan')) score += 10
      if (name.includes('monitoring_perbaikan')) score += 10
      if (h.includes('no_polisi') || h.includes('no_pol')) score += 5
      if (h.includes('tanggal')) score += 4
      if (h.includes('uraian')) score += 3
      if (h.includes('nilai_dpp') || h.includes('biaya')) score += 3
      return { sheet, header, score }
    })
    .sort((a, b) => b.score - a.score)[0]
}

function groupRows(rows) {
  const groups = new Map()
  rows.forEach((row) => {
    const key = `${row.nomor_polisi}|${row.tanggal}|${upper(row.bengkel || '-')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })
  return [...groups.entries()].map(([key, values]) => ({ key, values }))
}

async function importServiceHistory(rows, profile, sheetName) {
  const valid = rows.filter((row) => row.nomor_polisi && row.tanggal)
  if (!valid.length) throw new Error('Tidak ada baris Service valid. Pastikan kolom No. Polisi dan Tanggal tersedia.')
  const groups = groupRows(valid)
  const plates = [...new Set(valid.map((row) => row.nomor_polisi))]
  const [{ data: vehicles, error: vehicleError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'),
    supabase.from('service').select('id,kendaraan_id,tanggal_service,bengkel,biaya_aktual,total'),
  ])
  if (vehicleError) throw new Error(`Tidak bisa membaca master kendaraan: ${vehicleError.message}`)
  if (existingError) throw new Error(`Tidak bisa membaca histori service: ${existingError.message}`)
  const vehicleMap = Object.fromEntries((vehicles || []).map((vehicle) => [upper(vehicle.nomor_polisi), vehicle]))
  const existingKeys = new Set((existing || []).map((service) => `${service.kendaraan_id}|${service.tanggal_service}|${upper(service.bengkel || '-')}`))
  const unknownPlates = [...new Set(plates.filter((plate) => !vehicleMap[plate]))]
  const importedGroups = []
  const skippedGroups = []
  let itemCount = 0
  let kmUpdated = 0

  for (const group of groups) {
    const first = group.values[0]
    const vehicle = vehicleMap[first.nomor_polisi]
    if (!vehicle) continue
    const duplicateKey = `${vehicle.id}|${first.tanggal}|${upper(first.bengkel || '-')}`
    if (existingKeys.has(duplicateKey)) {
      skippedGroups.push(group)
      continue
    }
    const dpp = group.values.reduce((sum, row) => sum + row.nilai_dpp, 0)
    const ppn = group.values.reduce((sum, row) => sum + row.ppn, 0)
    const total = group.values.reduce((sum, row) => sum + row.total, 0)
    const kilometer = Math.max(...group.values.map((row) => row.kilometer || 0))
    const jenisService = transactionType(group.values)
    const label = group.values.find((row) => row.jenis_pekerjaan)?.jenis_pekerjaan || 'Service'
    const complaint = group.values.find((row) => row.uraian)?.uraian || `Riwayat ${label}`
    const serviceNumber = `IMP-SRV-${Date.now()}-${importedGroups.length + 1}`
    const request = await supabase.from('permintaan_service').insert({
      pemohon_id: profile.id,
      kendaraan_id: vehicle.id,
      tanggal_pengajuan: first.tanggal,
      kilometer_pengajuan: kilometer,
      jenis_permintaan: jenisService,
      keluhan: complaint,
      prioritas: 'NORMAL',
      status: 'SELESAI',
      diproses_oleh: profile.id,
      diproses_at: new Date().toISOString(),
    }).select('id').single()
    if (request.error) throw new Error(`Gagal membuat histori pengajuan ${first.nomor_polisi} (baris ${first.excelRow}): ${request.error.message}`)

    const service = await supabase.from('service').insert({
      nomor_service: serviceNumber,
      permintaan_service_id: request.data.id,
      kendaraan_id: vehicle.id,
      tanggal_service: first.tanggal,
      kilometer,
      bengkel: first.bengkel,
      jenis_service: jenisService,
      keluhan: complaint,
      estimasi_biaya: total,
      biaya_aktual: total,
      status: 'SELESAI',
      diproses_oleh: profile.id,
      nilai_dpp: dpp,
      ppn,
      total,
      catatan: `Import histori Excel: ${sheetName}`,
      selesai_at: new Date().toISOString(),
    }).select('id').single()
    if (service.error) throw new Error(`Gagal membuat histori service ${first.nomor_polisi} (baris ${first.excelRow}): ${service.error.message}`)

    const itemRows = group.values.map((row) => {
      const subtotal = row.nilai_dpp || row.total || (row.qty * row.harga_satuan)
      const harga = row.qty ? subtotal / row.qty : subtotal
      return {
        service_id: service.data.id,
        nama_item: row.uraian || row.jenis_pekerjaan || 'Item Excel',
        kategori: normalizeItemCategory(row.jenis_pekerjaan || row.uraian),
        jumlah: row.qty > 0 ? row.qty : 1,
        satuan: row.satuan || 'pcs',
        harga_satuan: harga || 0,
        subtotal: subtotal || 0,
        keterangan: row.keterangan || null,
      }
    })
    if (itemRows.length) {
      const itemResult = await supabase.from('service_item').insert(itemRows)
      if (itemResult.error) throw new Error(`Gagal menyimpan item service ${first.nomor_polisi} (baris ${first.excelRow}): ${itemResult.error.message}`)
      itemCount += itemRows.length
    }

    if (kilometer > Number(vehicle.kilometer_terakhir || 0)) {
      const kmResult = await supabase.from('kendaraan').update({ kilometer_terakhir: kilometer }).eq('id', vehicle.id)
      if (kmResult.error) throw new Error(`Histori service masuk, tetapi KM kendaraan ${first.nomor_polisi} gagal diperbarui: ${kmResult.error.message}`)
      kmUpdated += 1
      vehicle.kilometer_terakhir = kilometer
    }

    existingKeys.add(duplicateKey)
    importedGroups.push(group)
  }

  return {
    sourceRows: rows.length,
    validRows: valid.length,
    transactions: groups.length,
    imported: importedGroups.length,
    skipped: skippedGroups.length,
    unknownPlates,
    items: itemCount,
    kmUpdated,
  }
}

export default function ServiceHistoryImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async (nextFile) => {
    setFile(nextFile || null)
    setWorkbook(null)
    setError('')
    setMessage('')
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 10 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const chosen = chooseServiceSheet(sheets)
      if (!chosen || chosen.score < 9) throw new Error('Sheet histori service tidak ditemukan secara meyakinkan. Gunakan sheet Data Service/Rekapan Permintaan yang memiliki No. Polisi dan Tanggal.')
      const dataRows = chosen.sheet.rows.slice(chosen.header.index + 1).filter((row) => row.values.some((value) => clean(value)))
      const parsed = dataRows.map((row) => parseRow(row, chosen.header.row))
      const valid = parsed.filter((row) => row.nomor_polisi && row.tanggal)
      const invalid = parsed.length - valid.length
      const transactions = groupRows(valid)
      const uniquePlates = [...new Set(valid.map((row) => row.nomor_polisi))]
      setWorkbook({ sheet: chosen.sheet, header: chosen.header, dataRows: parsed, valid, invalid, transactions, uniquePlates })
      setMessage(`Sheet “${chosen.sheet.name}” terdeteksi: ${parsed.length} baris sumber • ${valid.length} valid • ${transactions.length} transaksi service.`)
    } catch (e) {
      setError(e.message || 'File Excel tidak dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }

  const start = async () => {
    if (!workbook || !canImport || saving) return
    setSaving(true)
    setError('')
    setMessage('Import histori service berjalan...')
    try {
      const result = await importServiceHistory(workbook.valid, profile, workbook.sheet.name)
      const unknownText = result.unknownPlates.length ? ` • ${result.unknownPlates.length} plat tidak ditemukan di master` : ''
      setMessage(`Import selesai: ${result.imported} transaksi baru • ${result.skipped} duplikat dilewati • ${result.items} item tercatat • ${result.kmUpdated} KM kendaraan diperbarui${unknownText}.`)
      if (result.unknownPlates.length) setError(`Plat yang belum ada di Master Kendaraan: ${result.unknownPlates.slice(0, 20).join(', ')}${result.unknownPlates.length > 20 ? ' …' : ''}. Data tersebut tidak dibuat otomatis.`)
      onDone?.()
    } catch (e) {
      setError(e.message || 'Import histori service gagal.')
      setMessage('')
    } finally {
      setSaving(false)
    }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Histori Service">
    <section className="dpt-modal service-import-modal">
      <header className="dpt-modal-head">
        <div>
          <span className="eyebrow">IMPORT EXCEL SERVICE</span>
          <h3>Histori Service & Perbaikan</h3>
          <p>Excel sumber dibaca berdasarkan struktur pekerjaan nyata: No. Polisi, Tanggal, Uraian, DPP, PPN, Total, KM, dan Bengkel.</p>
        </div>
        <button type="button" className="dpt-icon" onClick={onClose}>×</button>
      </header>
      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload">
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => scan(e.target.files?.[0])}/>
        <button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button>
        <div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 10 MB'}</span></div>
      </div>
      {workbook && <>
        <div className="service-import-stats">
          <div><b>{workbook.dataRows.length}</b><span>baris sumber</span></div>
          <div><b>{workbook.valid.length}</b><span>baris valid</span></div>
          <div><b>{workbook.transactions.length}</b><span>transaksi service</span></div>
          <div><b>{workbook.uniquePlates.length}</b><span>kendaraan</span></div>
        </div>
        {workbook.invalid > 0 && <div className="service-import-warning">{workbook.invalid} baris tidak memiliki No. Polisi atau Tanggal lengkap dan tidak akan diimport.</div>}
        <div className="service-import-note">
          <b>Penyesuaian sistem</b>
          <span>Beberapa baris item dengan kendaraan + tanggal + bengkel yang sama digabung menjadi 1 transaksi service.</span>
          <span>Uraian pekerjaan masuk ke detail item service.</span>
          <span>DPP, PPN, dan Total dijumlahkan dari baris sumber.</span>
          <span>Historis langsung berstatus SELESAI; tidak dibuat sebagai pengajuan aktif.</span>
          <span>Plat yang belum ada di Master Kendaraan tidak dibuat otomatis.</span>
        </div>
        <div className="service-import-map">
          <div><b>No. Polisi</b><span>→</span><span>Kendaraan</span></div>
          <div><b>Tanggal</b><span>→</span><span>Tanggal Service</span></div>
          <div><b>Jenis Pekerjan</b><span>→</span><span>Jenis Service</span></div>
          <div><b>Uraian</b><span>→</span><span>Item Service</span></div>
          <div><b>Nilai DPP</b><span>→</span><span>DPP</span></div>
          <div><b>PPn</b><span>→</span><span>PPN</span></div>
          <div><b>Total / Biaya</b><span>→</span><span>Total & Biaya Aktual</span></div>
          <div><b>KM</b><span>→</span><span>KM Service + Master Kendaraan</span></div>
          <div><b>Nama Bengkel</b><span>→</span><span>Bengkel</span></div>
        </div>
        <div className="dpt-preview">
          <div className="dpt-sheet-title"><b>Preview Sumber: {workbook.sheet.name}</b><span>8 baris pertama</span></div>
          <div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{workbook.dataRows.slice(0, 8).map((row) => <tr key={row.excelRow}>{workbook.header.row.map((header, index) => <td key={index}>{clean(row.values[index]) || '-'}</td>)}</tr>)}</tbody></table></div>
        </div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!workbook || saving || !canImport}>{saving ? 'Mengimport…' : 'Import Histori Service'}</button></div>
    </section>
  </div>
}
