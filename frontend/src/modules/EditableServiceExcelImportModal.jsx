import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearDeletedExcelRows, filterDeletedExcelRows } from '../utils/excelPreviewControls.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import './DataPageTools.css'
import { encodeExcelMeta } from '../utils/excelSourceMeta.js'
import './EditableServiceExcelImportModal.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const CONCURRENCY = 4
const PAGE_OPTIONS = [25, 50, 100]

const ALIASES = {
  nomor_polisi: ['no_polisi', 'no_pol', 'nomor_polisi', 'no_plat', 'plat'],
  merk: ['merk', 'brand'],
  tipe: ['tipe', 'type'],
  jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'],
  driver: ['driver_pic', 'driver', 'nama_driver'],
  bulan: ['bulan'],
  tanggal: ['tanggal', 'tgl', 'tanggal_service'],
  jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'pekerjaan'],
  uraian: ['uraian', 'deskripsi', 'item', 'pekerjaan_detail'],
  qty: ['qty', 'jumlah'],
  satuan: ['sat', 'satuan', 'unit'],
  harga_satuan: ['harga_satuan', 'harga_satuan_rp', 'harga_satuan_retail', 'harga'],
  nilai_dpp: ['nilai_dpp', 'nilai_dpp_rp', 'dpp', 'dpp_rp'],
  ppn: ['ppn', 'ppn_rp', 'nilai_ppn'],
  total: ['total', 'total_rp', 'nilai_total', 'nilai_total_rp', 'jumlah_rp', 'biaya', 'biaya_rp', 'biaya_service'],
  kilometer: ['km', 'kilometer', 'km_terakhir', 'kilometer_terakhir'],
  bengkel: ['nama_bengkel', 'nama_bengkel_workshop', 'nama_bengkel_service', 'bengkel', 'bengkel_service', 'workshop', 'vendor_bengkel'],
  keterangan: ['keterangan', 'catatan'],
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = value => clean(value).toUpperCase()

function fieldForHeader(header) {
  const n = norm(header)
  if (n === 'no' || n === 'nomor' || n === 'nomor_urut') return 'source_no'
  for (const [key, aliases] of Object.entries(ALIASES)) if (aliases.includes(n)) return key
  return null
}

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  const normalized = v.replace(/\s/g, '').replace(/^\((.*)\)$/, '-$1')
  if (/^-?\d{1,3}(?:[.]\d{3})+(?:[,]\d+)?$/.test(normalized)) return Number(normalized.replace(/\./g, '').replace(',', '.'))
  const n = Number(normalized.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function currencyValue(value) {
  let v = clean(value)
  if (!v) return 0
  v = v.replace(/^(rp|idr)\.?\s*/i, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!v) return 0
  const comma = v.lastIndexOf(',')
  const dot = v.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    v = comma > dot ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '')
  } else if (comma >= 0) {
    const decimals = v.length - comma - 1
    v = decimals === 1 || decimals === 2 ? v.replace(',', '.') : v.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = v.length - dot - 1
    if (decimals !== 1 && decimals !== 2) v = v.replace(/\./g, '')
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function excelDate(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) {
    const [d, m, y] = v.split(/[/-]/)
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const months = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agustus: 8, sep: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12 }
  const named = v.toLowerCase().replace(/\./g, '').match(/^(\d{1,2})[-\s/]([a-z]+)[-\s/](\d{2,4})$/)
  if (named) {
    const month = months[named[2]]
    let year = Number(named[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month) return `${year}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`
  }
  const serial = Number(v)
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function formatDisplay(value, header) {
  const raw = clean(value)
  if (!raw) return ''
  const key = fieldForHeader(header)
  if (key === 'tanggal') return excelDate(raw) || raw
  if (/^-?\d+\.0+$/.test(raw)) return raw.replace(/\.0+$/, '')
  return raw
}

function findHeader(sheet) {
  let best = { index: -1, row: [], score: -1 }
  sheet.rows.slice(0, 80).forEach((item, idx) => {
    const score = item.values.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row: item.values, score }
  })
  return best
}

function parseMoneyBase(value) {
  const raw = clean(value)
  if (!raw || raw === '-') return 0
  return currencyValue(raw)
}

function hasFullRupiahFormat(value) {
  const raw = clean(value)
  return /^-?\d{1,3}(?:[.]\d{3})+(?:[,]\d+)?$/.test(raw)
}

function normalizeMoneyField(value) {
  const raw = clean(value)
  const base = parseMoneyBase(raw)
  if (!raw || raw === '-') return 0
  if (hasFullRupiahFormat(raw)) return base
  return Number.isFinite(base) && Math.abs(base) < 1000 ? base * 1000 : base
}

function normalizePpn(dpp, rawPpn) {
  const raw = clean(rawPpn)
  if (!raw || raw === '-') return 0
  const base = parseMoneyBase(raw)
  const candidates = [base]
  if (!hasFullRupiahFormat(raw) && Math.abs(base) < 1000) candidates.push(base * 1000)
  const expected = Number(dpp || 0) * 0.11
  return candidates.reduce((best, value) => Math.abs(value - expected) < Math.abs(best - expected) ? value : best, candidates[0])
}

function normalizeServiceMoney({ qty, harga, dpp, ppn, total }) {
  const normalizedDpp = normalizeMoneyField(dpp)
  const normalizedHarga = normalizeMoneyField(harga)
  const normalizedTotal = normalizeMoneyField(total)
  const normalizedPpn = normalizePpn(normalizedDpp, ppn)
  const q = Number(qty || 0)
  const priceFromDpp = q > 0 ? normalizedDpp / q : normalizedHarga
  const finalHarga = normalizedHarga > 0 && normalizedDpp > 0 && Math.abs((normalizedHarga * q) - normalizedDpp) <= Math.max(1, normalizedDpp * 0.001)
    ? normalizedHarga
    : (priceFromDpp || normalizedHarga)
  const finalDpp = normalizedDpp || (q > 0 ? finalHarga * q : 0)
  const finalPpn = normalizedPpn
  const finalTotal = normalizedTotal || (finalDpp + finalPpn)
  return {
    harga_satuan: finalHarga,
    nilai_dpp: finalDpp,
    ppn: finalPpn,
    total: finalTotal,
    ppn_source: clean(ppn) || '-',
  }
}

function formatNumberId(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value == null ? '' : String(value)
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(numeric)
}

function displayValueForRow(row, header, key, index) {
  if (key === 'harga_satuan') return formatNumberId(row.harga_satuan)
  if (key === 'nilai_dpp') return formatNumberId(row.nilai_dpp)
  if (key === 'ppn') return row.ppn_source === '-' ? '-' : formatNumberId(row.ppn)
  if (key === 'total') return formatNumberId(row.total)
  if (key === 'kilometer') return formatNumberId(row.kilometer)
  return formatDisplay(row.values[index], header)
}

function parseRow(row, headers) {
  const get = key => {
    const index = headers.findIndex(header => fieldForHeader(header) === key)
    return index >= 0 ? clean(row.values[index]) : ''
  }
  const getSourceNo = () => {
    const index = headers.findIndex(header => fieldForHeader(header) === 'source_no')
    return index >= 0 ? clean(row.values[index]) : ''
  }
  const qty = numberValue(get('qty')) ?? 1
  const money = normalizeServiceMoney({
    qty,
    harga: get('harga_satuan'),
    dpp: get('nilai_dpp'),
    ppn: get('ppn'),
    total: get('total'),
  })
  return {
    excelRow: row.excelRow,
    values: [...row.values],
    source_no: getSourceNo(),
    nomor_polisi: upper(get('nomor_polisi')),
    merk: get('merk'),
    tipe: get('tipe'),
    jenis: get('jenis'),
    tahun: get('tahun'),
    driver: get('driver'),
    bulan: get('bulan'),
    tanggal: excelDate(get('tanggal')),
    jenis_pekerjaan: get('jenis_pekerjaan'),
    uraian: get('uraian'),
    qty,
    satuan: get('satuan') || 'pcs',
    harga_satuan: money.harga_satuan,
    nilai_dpp: money.nilai_dpp,
    ppn: money.ppn,
    ppn_source: money.ppn_source,
    total: money.total,
    kilometer: numberValue(get('kilometer')) ?? 0,
    bengkel: get('bengkel') || null,
    keterangan: get('keterangan') || null,
  }
}

function groupRows(rows) {
  const groups = new Map()
  rows.forEach(row => {
    const key = `${row.nomor_polisi}|${row.tanggal}|${upper(row.bengkel || '-')}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })
  return [...groups.entries()].map(([key, values]) => ({ key, values }))
}

function typeFor(rows) {
  const raw = rows.map(r => upper(r.jenis_pekerjaan)).join(' ')
  if (/GANTI\s+BAN|PENGGANTIAN\s+BAN/.test(raw)) return 'GANTI_BAN'
  if (/GANTI\s+(AKI|BATERAI)|PENGGANTIAN\s+(AKI|BATERAI)/.test(raw)) return 'GANTI_AKI'
  if (/PEMERIKSAAN/.test(raw)) return 'PEMERIKSAAN'
  return 'SERVICE'
}

function itemCategory(value) {
  const raw = upper(value)
  if (/BAN/.test(raw)) return 'BAN'
  if (/AKI|BATERAI/.test(raw)) return 'AKI'
  if (/JASA|SERVICE/.test(raw)) return 'JASA'
  return 'SPAREPART'
}

function chooseServiceSheet(sheets) {
  const scored = sheets.map(sheet => {
    const header = findHeader(sheet)
    const h = header.row.map(norm)
    const name = norm(sheet.name)
    let score = 0
    if (name === 'data_service') score += 30
    else if (name.includes('data_service')) score += 18
    if (name.includes('rekapan_permintaan')) score += 12
    if (name.includes('monitoring_perbaikan')) score += 10
    if (h.includes('no_polisi') || h.includes('no_pol')) score += 5
    if (h.includes('tanggal')) score += 4
    if (h.includes('uraian')) score += 4
    if (h.includes('nilai_dpp') || h.includes('dpp')) score += 3
    return { sheet, header, score }
  }).sort((a, b) => b.score - a.score)
  return scored[0]
}

async function importHistory(rows, profile, sheetName, onProgress = () => {}) {
  const valid = rows.filter(row => row.nomor_polisi && row.tanggal)
  if (!valid.length) throw new Error('Tidak ada baris Service valid. Pastikan No. Polisi dan Tanggal tersedia.')
  const groups = groupRows(valid)
  const plates = [...new Set(valid.map(row => row.nomor_polisi))]
  const [{ data: vehicles, error: vehicleError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'),
    supabase.from('service').select('id,kendaraan_id,tanggal_service,bengkel'),
  ])
  if (vehicleError) throw new Error(`Tidak bisa membaca Master Kendaraan: ${vehicleError.message}`)
  if (existingError) throw new Error(`Tidak bisa membaca histori service: ${existingError.message}`)
  const vehicleMap = Object.fromEntries((vehicles || []).map(v => [upper(v.nomor_polisi), v]))
  const existingKeys = new Set((existing || []).map(s => `${s.kendaraan_id}|${s.tanggal_service}|${upper(s.bengkel || '-')}`))
  const unknownPlates = [...new Set(plates.filter(plate => !vehicleMap[plate]))]
  const candidates = []
  let skipped = 0
  groups.forEach(group => {
    const first = group.values[0]
    const vehicle = vehicleMap[first.nomor_polisi]
    if (!vehicle) { skipped += 1; return }
    const duplicateKey = `${vehicle.id}|${first.tanggal}|${upper(first.bengkel || '-')}`
    if (existingKeys.has(duplicateKey)) skipped += 1
    else candidates.push({ group, vehicle, duplicateKey })
  })

  const results = []
  let cursor = 0
  let completed = 0
  let failure = null
  const worker = async () => {
    while (!failure) {
      const index = cursor++
      if (index >= candidates.length) return
      try {
        const { group, vehicle, duplicateKey } = candidates[index]
        const first = group.values[0]
        const dpp = group.values.reduce((sum, row) => sum + row.nilai_dpp, 0)
        const ppn = group.values.reduce((sum, row) => sum + row.ppn, 0)
        const sourceTotal = group.values.reduce((sum, row) => sum + row.total, 0)
        const total = sourceTotal > 0 ? sourceTotal : dpp + ppn
        const kilometer = Math.max(...group.values.map(row => row.kilometer || 0))
        const jenisService = typeFor(group.values)
        const label = group.values.find(row => row.jenis_pekerjaan)?.jenis_pekerjaan || 'Service'
        const complaint = group.values.find(row => row.uraian)?.uraian || `Riwayat ${label}`
        const historyNote = `Import histori Excel: ${sheetName}`

        const request = await supabase.from('permintaan_service').insert({
          pemohon_id: profile.id,
          kendaraan_id: vehicle.id,
          tanggal_pengajuan: first.tanggal,
          kilometer_pengajuan: kilometer,
          jenis_permintaan: jenisService,
          keluhan: complaint,
          prioritas: 'NORMAL',
          status: 'MENUNGGU_TRANSPORT',
        }).select('id').single()
        if (request.error) throw new Error(`Gagal membuat histori pengajuan ${first.nomor_polisi} (baris ${first.excelRow}): ${request.error.message}`)

        const serviceNumber = `IMP-SRV-${Date.now()}-${index + 1}`
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
          status: 'DALAM_PENGERJAAN',
          diproses_oleh: profile.id,
          nilai_dpp: dpp,
          ppn,
          total,
          catatan: historyNote,
        }).select('id').single()
        if (service.error) throw new Error(`Gagal membuat histori service ${first.nomor_polisi} (baris ${first.excelRow}): ${service.error.message}`)

        const itemRows = group.values.map(row => {
          const subtotal = row.nilai_dpp || (row.qty * row.harga_satuan) || row.total
          const harga = row.qty ? subtotal / row.qty : subtotal
          return {
            service_id: service.data.id,
            nama_item: row.uraian || row.jenis_pekerjaan || 'Item Excel',
            kategori: itemCategory(row.jenis_pekerjaan || row.uraian),
            jumlah: row.qty > 0 ? row.qty : 1,
            satuan: row.satuan || 'pcs',
            harga_satuan: harga || 0,
            subtotal: subtotal || 0,
            keterangan: encodeExcelMeta({ source: 'DATA_SERVICE', source_no: row.source_no, merk: row.merk, type: row.tipe, jenis: row.jenis, tahun: row.tahun, nomor_polisi: row.nomor_polisi, driver: row.driver, bulan: row.bulan, tanggal: row.tanggal, jenis_pekerjaan: row.jenis_pekerjaan, uraian: row.uraian, qty: row.qty, satuan: row.satuan, harga_satuan: row.harga_satuan, nilai_dpp: row.nilai_dpp, ppn: row.ppn, ppn_source: row.ppn_source, total: row.total, kilometer: row.kilometer, bengkel: row.bengkel, keterangan: row.keterangan || '' }, row.keterangan || ''),
          }
        })
        if (itemRows.length) {
          const itemResult = await supabase.from('service_item').insert(itemRows)
          if (itemResult.error) throw new Error(`Gagal menyimpan item service ${first.nomor_polisi} (baris ${first.excelRow}): ${itemResult.error.message}`)
        }
        const completedService = await supabase.from('service').update({ status: 'SELESAI', selesai_at: new Date().toISOString() }).eq('id', service.data.id)
        if (completedService.error) throw new Error(`Gagal menyelesaikan histori service ${first.nomor_polisi}: ${completedService.error.message}`)
        const completedRequest = await supabase.from('permintaan_service').update({ status: 'SELESAI' }).eq('id', request.data.id)
        if (completedRequest.error) throw new Error(`Gagal menutup histori pengajuan ${first.nomor_polisi}: ${completedRequest.error.message}`)

        results[index] = { group, duplicateKey, itemCount: itemRows.length, km: kilometer > Number(vehicle.kilometer_terakhir || 0) ? { kendaraan_id: vehicle.id, nomor_polisi: first.nomor_polisi, tanggal: first.tanggal, kilometer, keterangan: historyNote } : null }
        completed += 1
        onProgress({ completed, total: candidates.length })
      } catch (error) {
        failure = error
      }
    }
  }
  onProgress({ completed: 0, total: candidates.length })
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(candidates.length, 1)) }, worker))
  if (failure) throw failure

  const kmUpdates = new Map()
  const kmHistory = []
  let itemCount = 0
  results.filter(Boolean).forEach(result => {
    itemCount += result.itemCount
    if (!result.km) return
    const previous = kmUpdates.get(result.km.kendaraan_id)
    if (!previous || result.km.kilometer > previous.kilometer) kmUpdates.set(result.km.kendaraan_id, result.km)
    kmHistory.push({
      kendaraan_id: result.km.kendaraan_id,
      tanggal: result.km.tanggal,
      kilometer: result.km.kilometer,
      sumber: 'IMPORT_SERVICE',
      keterangan: result.km.keterangan,
      dicatat_oleh: profile.id,
    })
  })

  // Histori hasil import diberi sumber khusus agar log historis boleh lebih kecil
  // dari KM master saat ini. Setelah histori tersimpan, KM master dinaikkan ke nilai
  // terbesar hasil import.
  if (kmHistory.length) {
    const orderedHistory = [...kmHistory].sort((a, b) =>
      a.kendaraan_id - b.kendaraan_id ||
      a.tanggal.localeCompare(b.tanggal) ||
      Number(a.kilometer) - Number(b.kilometer)
    )
    const { error } = await supabase.from('riwayat_kilometer').insert(orderedHistory)
    if (error) throw new Error(`Histori service tersimpan tetapi riwayat KM gagal dicatat: ${error.message}`)
  }

  await Promise.all([...kmUpdates.values()].map(async update => {
    const { error } = await supabase.from('kendaraan').update({ kilometer_terakhir: update.kilometer }).eq('id', update.kendaraan_id)
    if (error) throw new Error(`Histori service tersimpan tetapi KM ${update.nomor_polisi} gagal diperbarui: ${error.message}`)
  }))

  return { sourceRows: rows.length, validRows: valid.length, transactions: groups.length, imported: results.filter(Boolean).length, skipped, unknownPlates, items: itemCount, kmUpdated: kmUpdates.size, kmHistorySaved: kmHistory.length }
}

export default function EditableServiceExcelImportModal({ profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async nextFile => {
    clearDeletedExcelRows('service')
    setFile(nextFile || null); setSheet(null); setHeaders([]); setRows([]); setError(''); setMessage(''); setPage(1); setSearch('')
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
    if (nextFile.size > MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.')
    setLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const chosen = chooseServiceSheet(sheets)
      if (!chosen || chosen.score < 12) throw new Error(`Sheet histori service tidak ditemukan. File terbaca tetapi sheet “Data Service” tidak sesuai.`)
      const sourceRows = chosen.sheet.rows.slice(chosen.header.index + 1).filter(row => row.values.some(value => clean(value)))
      const mappedFields = new Set(chosen.header.row.map(fieldForHeader).filter(Boolean))
      const requiredFields = [
        ['nomor_polisi', 'No. Polisi'],
        ['tanggal', 'Tanggal'],
        ['kilometer', 'KM'],
        ['harga_satuan', 'Harga Satuan'],
        ['nilai_dpp', 'Nilai DPP'],
        ['ppn', 'PPN'],
        ['total', 'Total'],
        ['bengkel', 'Nama Bengkel'],
      ]
      const missingFields = requiredFields.filter(([field]) => !mappedFields.has(field))
      if (missingFields.length) {
        throw new Error(`Kolom Data Service belum terbaca: ${missingFields.map(([, label]) => label).join(', ')}. Periksa nama header Excel sebelum import.`)
      }
      const parsed = sourceRows.map(row => parseRow(row, chosen.header.row))
      setSheet(chosen.sheet); setHeaders(chosen.header.row); setRows(parsed)
      setMessage(`Sheet “${chosen.sheet.name}” terbaca: ${parsed.length} baris. Kolom No. Polisi, Harga Satuan, DPP, PPN, Total, KM, dan Nama Bengkel berhasil dikenali.`)
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) }
  }

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase()
    if (!q) return rows
    return rows.filter(row => row.values.some(value => clean(value).toLowerCase().includes(q)))
  }, [rows, search])

  const validRows = useMemo(() => rows.filter(row => row.nomor_polisi && row.tanggal), [rows])
  const transactions = useMemo(() => groupRows(validRows), [validRows])
  const uniquePlates = useMemo(() => [...new Set(validRows.map(row => row.nomor_polisi))], [validRows])
  const invalidCount = rows.length - validRows.length
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)

  const updateCell = (excelRow, index, rawValue) => {
    setRows(current => current.map(row => {
      if (row.excelRow !== excelRow) return row
      const next = { ...row, values: [...row.values] }
      const header = headers[index] || ''
      const key = fieldForHeader(header)
      next.values[index] = rawValue
      if (key === 'source_no') next.source_no = rawValue
      else if (key === 'nomor_polisi') next.nomor_polisi = upper(rawValue)
      else if (key === 'merk') next.merk = rawValue
      else if (key === 'tipe') next.tipe = rawValue
      else if (key === 'jenis') next.jenis = rawValue
      else if (key === 'tahun') next.tahun = rawValue
      else if (key === 'driver') next.driver = rawValue
      else if (key === 'bulan') next.bulan = rawValue
      else if (key === 'tanggal') next.tanggal = excelDate(rawValue)
      else if (key === 'jenis_pekerjaan') next.jenis_pekerjaan = rawValue
      else if (key === 'uraian') next.uraian = rawValue
      else if (key === 'qty') next.qty = numberValue(rawValue) ?? 0
      else if (key === 'satuan') next.satuan = rawValue
      else if (key === 'kilometer') next.kilometer = numberValue(rawValue) ?? 0
      else if (key === 'bengkel') next.bengkel = rawValue || null
      else if (key === 'keterangan') next.keterangan = rawValue || null

      const getCurrent = field => {
        const i = headers.findIndex(item => fieldForHeader(item) === field)
        return i >= 0 ? clean(next.values[i]) : ''
      }
      const money = normalizeServiceMoney({
        qty: Number(next.qty || getCurrent('qty')) || 1,
        harga: getCurrent('harga_satuan'),
        dpp: getCurrent('nilai_dpp'),
        ppn: getCurrent('ppn'),
        total: getCurrent('total'),
      })
      next.harga_satuan = money.harga_satuan
      next.nilai_dpp = money.nilai_dpp
      next.ppn = money.ppn
      next.ppn_source = money.ppn_source
      next.total = money.total
      return next
    }))
  }

  const start = async () => {
    if (!rows.length || !canImport || saving) return
    setSaving(true); setError(''); setProgress({ completed: 0, total: transactions.length }); setMessage(`Memproses import ${transactions.length} transaksi...`)
    try {
      const activeRows = filterDeletedExcelRows('service', rows)
      const result = await importHistory(activeRows, profile, sheet?.name || 'Data Service', ({ completed, total }) => { setProgress({ completed, total }); setMessage(`Memproses import: ${completed}/${total} transaksi...`) })
      const report = { context: 'service', ...result, validRows: validRows.length, transactions: result.imported, fileName: file?.name || '', completedAt: new Date().toISOString(), message: `${result.imported} transaksi disimpan • ${result.skipped} dilewati • ${result.items} item tersimpan • ${result.kmUpdated} KM kendaraan diperbarui.` }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report)); setProgress({ completed: transactions.length, total: transactions.length }); setMessage(report.message)
      if (result.unknownPlates.length) setError(`Plat belum ada di Master Kendaraan: ${result.unknownPlates.slice(0, 20).join(', ')}${result.unknownPlates.length > 20 ? ' …' : ''}. Baris tersebut tidak dibuat otomatis.`)
      onDone?.(report)
    } catch (e) {
      setError(e.message || 'Import histori service gagal.')
      setMessage('Import berhenti. Data yang sudah tersimpan tidak diulang otomatis.')
    } finally { setSaving(false) }
  }

  const pageStart = filteredRows.length ? (safePage - 1) * pageSize + 1 : 0
  const pageEnd = Math.min(safePage * pageSize, filteredRows.length)

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Histori Service">
    <section className="dpt-modal editable-service-import-modal">
      <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL SERVICE</span><h3>Histori Service & Perbaikan</h3><p>Semua baris dari sheet Data Service dimuat. Tim Transport bisa memperbaiki setiap kolom langsung di sini sebelum data disimpan ke sistem.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>
      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}
      <div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>{loading ? 'Membaca Excel…' : file ? 'Ganti File' : 'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file ? `✓ .xlsx • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal 25 MB'}</span></div></div>
      {rows.length > 0 && <>
        <div className="service-import-stats"><div><b>{rows.length}</b><span>baris Excel</span></div><div><b>{validRows.length}</b><span>baris valid</span></div><div><b>{transactions.length}</b><span>transaksi service</span></div><div><b>{uniquePlates.length}</b><span>kendaraan</span></div></div>
        {invalidCount > 0 && <div className="service-import-warning">{invalidCount} baris belum valid. Edit No. Polisi/Tanggal langsung di tabel agar ikut terimport.</div>}
        <div className="editable-service-toolbar"><div><strong>Baris {pageStart}-{pageEnd} dari {filteredRows.length}{search ? ` (filter dari ${rows.length})` : ''}</strong><span>Setiap sel di bawah ini bisa diedit. Perubahan dipakai saat tombol Import ditekan.</span></div><div className="editable-service-controls"><input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Cari data…" disabled={saving}/><label>Per halaman <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }} disabled={saving}>{PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label></div></div>
        <div className="dpt-preview editable-service-preview"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead><tbody>{visibleRows.map(row => <tr data-excel-row={row.excelRow} key={row.excelRow}>{headers.map((header, index) => { const key = fieldForHeader(header); const value = displayValueForRow(row, header, key, index); const numeric = ['qty','harga_satuan','nilai_dpp','ppn','total','kilometer'].includes(key); const date = key === 'tanggal'; return <td key={`${row.excelRow}-${index}`}><input aria-label={`${header} baris ${row.excelRow}`} type={date ? 'text' : 'text'} inputMode={numeric ? 'decimal' : undefined} value={value} onChange={e => updateCell(row.excelRow, index, e.target.value)} disabled={saving} className={numeric ? 'numeric' : ''}/></td> })}</tr>)}</tbody></table></div>
        <div className="editable-service-pagination"><button type="button" className="dpt-button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1 || saving}>← Sebelumnya</button><strong>Halaman {safePage} / {pageCount}</strong><button type="button" className="dpt-button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount || saving}>Berikutnya →</button></div>
        <div className="service-import-note"><b>Yang bisa dikerjakan tanpa kembali ke Excel</b><span>Ganti No. Polisi, tanggal, pekerjaan, uraian, Qty, satuan, harga, DPP, PPN, Total, KM, driver, dan kolom lain langsung di tabel.</span><span>Semua {rows.length} baris tetap ada; tabel hanya memakai pagination supaya layar tidak berat.</span><span>Setelah diedit, sistem menghitung ulang baris valid, transaksi, kendaraan, dan item berdasarkan data terbaru.</span></div>
      </>}
      <div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!rows.length || saving || !canImport}>{saving ? `Mengimport ${progress.completed}/${progress.total}…` : `Import ${rows.length} Baris`}</button></div>
    </section>
  </div>
}