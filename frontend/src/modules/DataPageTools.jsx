import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const aliases = {
  nomor_polisi: ['nomor_polisi', 'no_polisi', 'no_polisi_', 'no_polisi_kendaraan', 'no_pol', 'plat', 'no_plat'],
  merk: ['merk', 'brand'],
  tipe: ['tipe', 'type'],
  jenis_kendaraan: ['jenis', 'jenis_kendaraan'],
  tahun: ['tahun'],
  nomor_mesin: ['no_mesin', 'nomor_mesin'],
  nomor_rangka: ['no_rangka', 'nomor_rangka', 'no_ranka'],
  pemilik: ['pemilik', 'nama_pemilik', 'nama_pemilik_kendaraan', 'nama_pemilik_pic'],
  lokasi: ['lokasi', 'lokasi_kerja', 'lokasi_kerja_', 'homebase', 'home_base'],
  kode_kendaraan: ['kode_kendaraan', 'kode'],
  kilometer: ['km', 'kilometer', 'kilometer_pengajuan', 'km_terakhir'],
  driver: ['driver', 'nama_driver'],
  tanggal: ['tanggal', 'tgl', 'tanggal_service', 'tanggal_pengajuan'],
  jenis_permintaan: ['jenis_permintaan', 'jenis_perbaikan', 'jenis_service'],
  keluhan: ['keluhan', 'keluhan_kerusakan', 'uraian_kerusakan', 'uraian'],
  prioritas: ['prioritas'],
  jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'jenis_pekerjaan_'],
  bengkel: ['nama_bengkel', 'bengkel', 'nama_bengkel_service'],
  qty: ['qty', 'jumlah'],
  satuan: ['sat', 'satuan', 'unit'],
  harga_satuan: ['harga_satuan_rp', 'harga_satuan', 'harga'],
  nilai_dpp: ['nilai_dpp', 'dpp'],
  ppn: ['ppn', 'ppn_'],
  total: ['total', 'jumlah_rp', 'jumlah'],
  keterangan: ['keterangan', 'catatan'],
  stnk: ['stnk'],
  kir: ['kir'],
  lima_tahun: ['5_tahun', 'lima_tahun'],
  nomor_kontrak: ['nomor_kontrak', 'no_kontrak'],
  nama_perusahaan: ['nama_perusahaan', 'perusahaan'],
  jenis_pemilik: ['jenis_pemilik'],
  tanggal_mulai: ['tanggal_mulai', 'mulai'],
  tanggal_selesai: ['tanggal_selesai', 'selesai'],
  nilai_sewa_bulanan: ['nilai_sewa_bulanan', 'sewa_bulanan', 'harga_sewa'],
  tanggal_jatuh_tempo_bulanan: ['tanggal_jatuh_tempo_bulanan', 'jatuh_tempo_bulanan'],
}

const CONTEXT_LABEL = {
  kendaraan: 'Kendaraan',
  pengajuan: 'Pengajuan Service',
  service: 'Service & Perbaikan',
  sewa: 'Kendaraan Sewa',
  dokumen: 'Dokumen Kendaraan',
}
const RELEVANT_SHEETS = {
  kendaraan: ['kendaraan', 'list kendaraan', 'data kendaraan'],
  service: ['data service', 'service'],
  dokumen: ['stnk', 'stnk dan kir', 'kir'],
  pengajuan: ['pengajuan perbaikan', 'permintaan perbaikan', 'permintaan service'],
  sewa: ['sewa kendaraan', 'sewa kendaraan'],
}

function readU16(view, offset) { return view.getUint16(offset, true) }
function readU32(view, offset) { return view.getUint32(offset, true) }
function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome atau Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
async function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = readU16(view, eocd + 10), centralOffset = readU32(view, eocd + 16)
  const entries = new Map(); let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, p) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = readU16(view, p + 10), compSize = readU32(view, p + 20), nameLen = readU16(view, p + 28), extraLen = readU16(view, p + 30), commentLen = readU16(view, p + 32), localOffset = readU32(view, p + 42)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const lv = new DataView(buffer, localOffset), localNameLen = readU16(lv, 26), localExtraLen = readU16(lv, 28)
    const start = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { read: async name => { const entry = entries.get(name); if (!entry) return null; if (entry.method === 0) return entry.bytes; if (entry.method === 8) return inflate(entry.bytes); throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`) } }
}
function colIndex(name) { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach(row => {
    const values = []
    row.querySelectorAll(':scope > c').forEach(cell => {
      const ref = cell.getAttribute('r') || '', m = ref.match(/^([A-Z]+)/); if (!m) return
      const idx = colIndex(m[1]), type = cell.getAttribute('t') || ''
      let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(cell.querySelector('is')?.textContent)
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    rows.push(values)
  })
  return rows
}
async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer())
  const workbookXml = text(await zip.read('xl/workbook.xml') || new Uint8Array())
  const relsXml = text(await zip.read('xl/_rels/workbook.xml.rels') || new Uint8Array())
  if (!workbookXml || !relsXml) throw new Error('Workbook XLSX tidak lengkap.')
  const workbook = new DOMParser().parseFromString(workbookXml, 'application/xml')
  const rels = new DOMParser().parseFromString(relsXml, 'application/xml')
  const sharedStrings = []
  const shared = await zip.read('xl/sharedStrings.xml')
  if (shared) { const d = new DOMParser().parseFromString(text(shared), 'application/xml'); d.querySelectorAll('si').forEach(si => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map(t => t.textContent).join('')))) }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const s of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[s.getAttribute('r:id')]; if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    sheets.push({ name: s.getAttribute('name') || target, rows: parseSheetXml(text(await zip.read(target) || new Uint8Array()), sharedStrings) })
  }
  return sheets
}
function findHeader(rows) {
  let best = { index: 0, row: [] }
  rows.slice(0, 30).forEach((row, idx) => { const score = row.filter(Boolean).map(norm).filter(Boolean).length; if (score > best.row.filter(Boolean).length) best = { index: idx, row } })
  return best
}
function valueOf(row, headers, key) {
  const idx = headers.findIndex(h => aliases[key]?.includes(norm(h)))
  return idx >= 0 ? clean(row[idx]) : ''
}
function excelDate(value) {
  const v = clean(value); if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(v)) { const [d,m,y] = v.split(/[/-]/); return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
  const n = Number(v); if (Number.isFinite(n) && n > 20000 && n < 80000) { const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return dt.toISOString().slice(0,10) }
  const dt = new Date(v); return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0,10)
}
function numberValue(value) {
  const v = clean(value); if (!v) return null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g,'').replace(',','.'))
  const n = Number(v.replace(/,/g,'')); return Number.isFinite(n) ? n : null
}
function moneyValue(value) { return numberValue(value) }
function likelyContext(name, rows, wanted) {
  const n = norm(name)
  if (RELEVANT_SHEETS[wanted].some(k => n.includes(norm(k)))) return true
  const h = findHeader(rows).row.map(norm)
  const score = {
    kendaraan: ['nomor_polisi','no_polisi','no_pol','plat','no_plat','merk','type','tipe'].filter(x => h.includes(x)).length,
    service: ['jenis_pekerjaan','uraian','qty','sat','harga_satuan','nilai_dpp'].filter(x => h.includes(x)).length,
    dokumen: ['nomor_polisi','nomor_polisi','stnk','kir','5_tahun'].filter(x => h.includes(x)).length,
    pengajuan: ['nomor_polisi','keluhan','jenis_permintaan','kilometer'].filter(x => h.includes(x)).length,
    sewa: ['nomor_kontrak','nomor_polisi','nama_pemilik','nilai_sewa_bulanan'].filter(x => h.includes(x)).length,
  }
  return score[wanted] >= (wanted === 'kendaraan' ? 2 : 3)
}
async function importKendaraan(sheet, profile) {
  const { index, row: headerRow } = findHeader(sheet.rows), headers = headerRow
  const rows = sheet.rows.slice(index + 1).filter(r => r.some(v => clean(v)))
  if (!headers.some(h => ['nomor_polisi', 'no_polisi', 'no_pol', 'plat', 'no_plat'].includes(norm(h)))) throw new Error('Kolom Nomor Polisi tidak ditemukan pada sheet kendaraan.')
  if (!headers.some(h => ['merk', 'brand'].includes(norm(h)))) throw new Error('Kolom Merk/Brand tidak ditemukan pada sheet kendaraan.')

  const [existingResult, driverResult] = await Promise.all([
    supabase.from('kendaraan').select('id,nomor_polisi,kode_kendaraan'),
    supabase.from('driver').select('id,nama_lengkap'),
  ])
  if (existingResult.error) throw existingResult.error
  if (driverResult.error) throw driverResult.error

  const existingByPlate = Object.fromEntries((existingResult.data || []).map(v => [clean(v.nomor_polisi).toUpperCase(), v]))
  const existingCodes = new Set((existingResult.data || []).map(v => clean(v.kode_kendaraan).toUpperCase()).filter(Boolean))
  const driverByName = Object.fromEntries((driverResult.data || []).map(d => [clean(d.nama_lengkap).toUpperCase(), d]))
  const seen = new Set()
  const prepared = []
  let skipped = 0

  for (const row of rows) {
    const plate = valueOf(row, headers, 'nomor_polisi').toUpperCase()
    if (!plate || seen.has(plate)) { skipped += 1; continue }
    const merk = valueOf(row, headers, 'merk')
    if (!merk) { skipped += 1; continue }
    seen.add(plate)

    const sourceStatusIndex = headers.findIndex(h => norm(h) === 'status')
    const ownershipSource = clean(sourceStatusIndex >= 0 ? row[sourceStatusIndex] : '').toUpperCase()
    const isRental = ownershipSource === 'SEWA'
    const owner = valueOf(row, headers, 'pemilik') || null
    const ownerUpper = clean(owner).toUpperCase()
    const rentalType = isRental
      ? (/^(PT|CV|UD|PD|KOPERASI|YAYASAN)\b|\bRENTAL\b|\bCAR\s+RENTAL\b/.test(ownerUpper) ? 'SEWA_RENTAL' : 'SEWA_PERORANGAN')
      : null
    const driverName = valueOf(row, headers, 'driver')
    const driverId = driverByName[clean(driverName).toUpperCase()]?.id || null
    let code = (valueOf(row, headers, 'kode_kendaraan') || `IMP-${plate.replace(/\W+/g,'')}`).toUpperCase()
    const current = existingByPlate[plate]
    if (!current && existingCodes.has(code)) code = `${code}-${plate.replace(/\W+/g,'')}`
    if (!current) existingCodes.add(code)

    prepared.push({
      existingId: current?.id || null,
      payload: {
        kode_kendaraan: current ? (valueOf(row, headers, 'kode_kendaraan') || current.kode_kendaraan).toUpperCase() : code,
        nomor_polisi: plate,
        merk,
        tipe: valueOf(row, headers, 'tipe') || null,
        jenis_kendaraan: valueOf(row, headers, 'jenis_kendaraan') || null,
        tahun: numberValue(valueOf(row, headers, 'tahun')) || null,
        nomor_mesin: valueOf(row, headers, 'nomor_mesin') || null,
        nomor_rangka: valueOf(row, headers, 'nomor_rangka') || null,
        pemilik: owner,
        driver_id: driverId,
        lokasi: valueOf(row, headers, 'lokasi') || null,
        kilometer_terakhir: numberValue(valueOf(row, headers, 'kilometer')) ?? 0,
        kepemilikan: isRental ? 'SEWA' : 'ASET_KANTOR',
        jenis_sewa: rentalType,
        status: 'ACTIVE',
        keterangan: valueOf(row, headers, 'keterangan') || null,
      },
    })
  }

  if (!prepared.length) throw new Error('Tidak ada baris kendaraan valid yang siap diimport.')

  let added = 0, updated = 0
  for (const item of prepared) {
    const r = item.existingId
      ? await supabase.from('kendaraan').update(item.payload).eq('id', item.existingId)
      : await supabase.from('kendaraan').insert(item.payload)
    if (r.error) throw new Error(`Gagal menyimpan kendaraan ${item.payload.nomor_polisi}: ${r.error.message}`)
    if (item.existingId) updated += 1
    else added += 1
  }
  return `${added} kendaraan baru, ${updated} diperbarui, ${skipped} dilewati.`
}

async function importService(sheet, profile) {
  const { index, row: headers } = findHeader(sheet.rows)
  const rows = sheet.rows.slice(index + 1).filter(r => r.some(v => clean(v)))
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'); if (vehicles.error) throw vehicles.error
  const vmap = Object.fromEntries((vehicles.data || []).map(v => [clean(v.nomor_polisi).toUpperCase(), v]))
  const groups = new Map()
  for (const row of rows) {
    const plate = valueOf(row, headers, 'nomor_polisi').toUpperCase(), date = excelDate(valueOf(row, headers, 'tanggal')), shop = valueOf(row, headers, 'bengkel')
    if (!plate || !date || !vmap[plate]) continue
    const key = `${plate}|${date}|${shop.toUpperCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  let created = 0, skipped = 0, items = 0
  for (const group of groups.values()) {
    const first = group[0], plate = valueOf(first, headers, 'nomor_polisi').toUpperCase(), vehicle = vmap[plate]
    const date = excelDate(valueOf(first, headers, 'tanggal')), shop = valueOf(first, headers, 'bengkel') || null
    const duplicate = await supabase.from('service').select('id').eq('kendaraan_id', vehicle.id).eq('tanggal_service', date).eq('bengkel', shop).limit(1)
    if (duplicate.error) throw duplicate.error
    if (duplicate.data?.length) { skipped += 1; continue }
    const totalFromRows = group.reduce((sum, row) => sum + (moneyValue(valueOf(row, headers, 'nilai_dpp')) || 0), 0)
    const ppn = group.reduce((sum, row) => sum + (moneyValue(valueOf(row, headers, 'ppn')) || 0), 0)
    const total = group.reduce((sum, row) => sum + (moneyValue(valueOf(row, headers, 'total')) || 0), 0) || totalFromRows + ppn
    const km = numberValue(valueOf(first, headers, 'kilometer')) || 0
    const complaint = valueOf(first, headers, 'keluhan') || 'Import histori service dari Excel.'
    const typeRaw = group.map(r => valueOf(r, headers, 'jenis_pekerjaan')).join(' ').toUpperCase()
    const jenis = /BAN/.test(typeRaw) ? 'GANTI_BAN' : /AKI|BATERAI/.test(typeRaw) ? 'GANTI_AKI' : 'SERVICE'
    const req = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: vehicle.id, tanggal_pengajuan: date, kilometer_pengajuan: km, jenis_permintaan: jenis, keluhan: complaint, prioritas: 'NORMAL', status: 'MENUNGGU_TRANSPORT' }).select('id').single()
    if (req.error) throw req.error
    const svc = await supabase.from('service').insert({ nomor_service: `IMP-SRV-${Date.now()}-${created + 1}`, permintaan_service_id: req.data.id, kendaraan_id: vehicle.id, tanggal_service: date, kilometer: km, bengkel: shop, jenis_service: jenis, keluhan: complaint, estimasi_biaya: totalFromRows, biaya_aktual: total || totalFromRows, status: 'DRAFT', diproses_oleh: profile.id, nilai_dpp: totalFromRows, ppn, total: total || totalFromRows + ppn, catatan: `Import histori Excel: ${sheet.name}` }).select('id').single()
    if (svc.error) throw svc.error
    const payloadItems = group.map(row => ({ service_id: svc.data.id, nama_item: valueOf(row, headers, 'keluhan') || valueOf(row, headers, 'jenis_pekerjaan') || 'Item Excel', kategori: /JASA/i.test(valueOf(row, headers, 'jenis_pekerjaan')) ? 'JASA_SERVICE' : /PENGADAAN/i.test(valueOf(row, headers, 'jenis_pekerjaan')) ? 'PENGADAAN_BARANG' : /BAN/i.test(valueOf(row, headers, 'keluhan')) ? 'BAN' : /AKI|BATERAI/i.test(valueOf(row, headers, 'keluhan')) ? 'AKI_BATERAI' : 'MATERIAL_SPAREPART', jumlah: numberValue(valueOf(row, headers, 'qty')) || 1, satuan: valueOf(row, headers, 'satuan') || 'pcs', harga_satuan: numberValue(valueOf(row, headers, 'harga_satuan')) || 0, subtotal: moneyValue(valueOf(row, headers, 'nilai_dpp')) || 0, keterangan: valueOf(row, headers, 'keterangan') || null }))
    if (payloadItems.length) { const r = await supabase.from('service_item').insert(payloadItems); if (r.error) throw r.error; items += payloadItems.length }
    const reqUpdate = await supabase.from('permintaan_service').update({ status: 'DALAM_PROSES', diproses_oleh: profile.id, diproses_at: new Date().toISOString() }).eq('id', req.data.id); if (reqUpdate.error) throw reqUpdate.error
    created += 1
  }
  return `${created} transaksi service dibuat, ${items} item tercatat, ${skipped} transaksi dilewati karena terdeteksi duplikat.`
}

async function importDokumen(sheet, profile) {
  const { index, row: headers } = findHeader(sheet.rows), rows = sheet.rows.slice(index + 1).filter(r => r.some(v => clean(v)))
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi'); if (vehicles.error) throw vehicles.error
  const vmap = Object.fromEntries((vehicles.data || []).map(v => [clean(v.nomor_polisi).toUpperCase(), v]))
  let inserted = 0, skipped = 0
  for (const row of rows) {
    const plate = valueOf(row, headers, 'nomor_polisi').toUpperCase(), vehicle = vmap[plate]; if (!vehicle) { skipped += 1; continue }
    for (const [key, type] of [['stnk','STNK'],['kir','KIR'],['lima_tahun','5_TAHUN']]) {
      const due = excelDate(valueOf(row, headers, key)); if (!due) continue
      const duplicate = await supabase.from('dokumen_kendaraan').select('id').eq('kendaraan_id', vehicle.id).eq('jenis_dokumen', type).eq('tanggal_jatuh_tempo', due).limit(1)
      if (duplicate.error) throw duplicate.error
      if (duplicate.data?.length) { skipped += 1; continue }
      const r = await supabase.from('dokumen_kendaraan').insert({ kendaraan_id: vehicle.id, jenis_dokumen: type, tanggal_jatuh_tempo: due, keterangan: `Import Excel: ${sheet.name}` }); if (r.error) throw r.error
      inserted += 1
    }
  }
  return `${inserted} dokumen ditambahkan, ${skipped} baris/dokumen dilewati.`
}

async function importPengajuan(sheet, profile) {
  const { index, row: headers } = findHeader(sheet.rows)
  const dataRows = sheet.rows.slice(index + 1).filter(r => r.some(v => clean(v)))
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'); if (vehicles.error) throw vehicles.error
  const vmap = Object.fromEntries((vehicles.data || []).map(v => [clean(v.nomor_polisi).toUpperCase(), v]))
  let added = 0, skipped = 0
  for (const row of dataRows) {
    const plate = valueOf(row, headers, 'nomor_polisi').toUpperCase(), vehicle = vmap[plate], complaint = valueOf(row, headers, 'keluhan'); if (!vehicle || !complaint) { skipped += 1; continue }
    const date = excelDate(valueOf(row, headers, 'tanggal')) || new Date().toISOString().slice(0,10), km = numberValue(valueOf(row, headers, 'kilometer')) ?? vehicle.kilometer_terakhir ?? 0
    const r = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: vehicle.id, tanggal_pengajuan: date, kilometer_pengajuan: km, jenis_permintaan: valueOf(row, headers, 'jenis_permintaan') || 'SERVICE', keluhan: complaint, prioritas: valueOf(row, headers, 'prioritas') || 'NORMAL', status: 'MENUNGGU_TRANSPORT' }); if (r.error) throw r.error
    added += 1
  }
  return `${added} pengajuan ditambahkan, ${skipped} baris dilewati karena nomor polisi tidak ditemukan atau keluhan kosong.`
}

async function importSewa(sheet, profile) {
  const { index, row: headers } = findHeader(sheet.rows), rows = sheet.rows.slice(index + 1).filter(r => r.some(v => clean(v)))
  const required = ['nomor_kontrak','nomor_polisi','tanggal_mulai','tanggal_selesai','nilai_sewa_bulanan']
  const headerNames = headers.map(norm)
  if (!required.every(k => headerNames.includes(k))) throw new Error('Sheet rental belum memiliki format tabel kontrak yang aman. Gunakan kolom: Nomor Kontrak, Nomor Polisi, Nama Pemilik, Jenis Pemilik, Tanggal Mulai, Tanggal Selesai, Nilai Sewa Bulanan, Jatuh Tempo Bulanan.')
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi'); if (vehicles.error) throw vehicles.error
  const vmap = Object.fromEntries((vehicles.data || []).map(v => [clean(v.nomor_polisi).toUpperCase(), v]))
  let added = 0, skipped = 0
  for (const row of rows) {
    const plate = valueOf(row, headers, 'nomor_polisi').toUpperCase(), vehicle = vmap[plate], nomorKontrak = valueOf(row, headers, 'nomor_kontrak'); if (!vehicle || !nomorKontrak) { skipped += 1; continue }
    let ownerQuery = supabase.from('pemilik_sewa').select('id').eq('nama_pemilik', valueOf(row, headers, 'pemilik')).maybeSingle()
    let owner = await ownerQuery
    if (owner.error) throw owner.error
    if (!owner.data) { const created = await supabase.from('pemilik_sewa').insert({ jenis_pemilik: valueOf(row, headers, 'jenis_pemilik') || 'PERORANGAN', nama_pemilik: valueOf(row, headers, 'pemilik') || '-', nama_perusahaan: valueOf(row, headers, 'nama_perusahaan') || null, aktif: true }).select('id').single(); if (created.error) throw created.error; owner = created }
    const r = await supabase.from('kontrak_sewa').insert({ nomor_kontrak: nomorKontrak, kendaraan_id: vehicle.id, pemilik_sewa_id: owner.data.id, tanggal_mulai: excelDate(valueOf(row, headers, 'tanggal_mulai')), tanggal_selesai: excelDate(valueOf(row, headers, 'tanggal_selesai')), periode_bulan: 6, nilai_sewa_bulanan: moneyValue(valueOf(row, headers, 'nilai_sewa_bulanan')) || 0, tanggal_jatuh_tempo_bulanan: excelDate(valueOf(row, headers, 'tanggal_jatuh_tempo_bulanan')), status: 'AKTIF', catatan: `Import Excel: ${sheet.name}`, dibuat_oleh: profile.id }); if (r.error) throw r.error
    added += 1
  }
  return `${added} kontrak sewa ditambahkan, ${skipped} baris dilewati.`
}

function ExcelImportModal({ context, profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null), [sheets, setSheets] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const canImport = ['ADMIN','TRANSPORT'].includes(profile?.role)
  const scan = async f => {
    setFile(f); setSheets([]); setSelected(null); setError(''); setMessage('')
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) { setError('Gunakan file .xlsx.'); return }
    setLoading(true)
    try {
      const parsed = await parseXlsx(f)
      const prepared = parsed.map(s => { const { index, row } = findHeader(s.rows); return { ...s, headerIndex: index, headers: row, relevant: likelyContext(s.name, s.rows, context) } })
      setSheets(prepared)
      const matches = prepared.filter(s => s.relevant)
      if (matches.length) {
        setSelected(matches[0])
        setMessage(`${matches.length} sheet cocok untuk ${CONTEXT_LABEL[context]}. Sistem memilih "${matches[0].name}" secara otomatis. Sheet lain tidak akan dipakai kecuali dipilih.`)
      } else {
        setMessage(`${parsed.length} sheet dibaca, tetapi belum ada yang cocok untuk ${CONTEXT_LABEL[context]}.`)
      }
    } catch (e) { setError(e.message || 'File Excel tidak dapat dibaca.') }
    finally { setLoading(false) }
  }
  const relevant = useMemo(() => sheets.filter(s => s.relevant), [sheets])
  const start = async () => { if (!selected || !canImport) return; setSaving(true); setError(''); setMessage(''); try { let result; if (context === 'kendaraan') result = await importKendaraan(selected, profile); else if (context === 'service') result = await importService(selected, profile); else if (context === 'dokumen') result = await importDokumen(selected, profile); else if (context === 'pengajuan') result = await importPengajuan(selected, profile); else result = await importSewa(selected, profile); setMessage(`Import ${CONTEXT_LABEL[context]} berhasil. ${result}`); onDone?.() } catch (e) { setError(e.message || 'Import gagal. Data yang sudah terbuat sebelum error tetap mungkin tersimpan; periksa hasil import sebelum mengulang.') } finally { setSaving(false) } }
  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label={`Import ${CONTEXT_LABEL[context]}`}><section className="dpt-modal"><header><div><span className="eyebrow">IMPORT EXCEL</span><h3>Import {CONTEXT_LABEL[context]}</h3><p>Pilih file → sistem mencari sheet yang cocok → preview → validasi → cek duplikat → import.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>{error && <div className="dpt-alert error">{error}</div>}{message && <div className="dpt-alert success">{message}</div>}<div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx" onChange={e => scan(e.target.files?.[0])}/><button type="button" className="dpt-button primary" onClick={() => inputRef.current?.click()} disabled={loading}>{loading ? 'Membaca Excel...' : file ? file.name : 'Pilih File Excel (.xlsx)'}</button></div>{file && <><div className="dpt-sheet-list"><div className="dpt-sheet-title"><b>Sheet cocok untuk {CONTEXT_LABEL[context]}</b><span>{relevant.length} sheet</span></div>{(relevant.length ? relevant : sheets).map((s, i) => <button type="button" key={`${s.name}-${i}`} className={`dpt-sheet ${selected?.name === s.name ? 'selected' : ''} ${!s.relevant ? 'muted' : ''}`} onClick={() => s.relevant && setSelected(s)} disabled={!s.relevant}><div><b>{s.name}</b><small>{Math.max(0, s.rows.length - s.headerIndex - 1)} baris data • {s.relevant ? 'siap dipakai' : 'bukan untuk halaman ini'}</small></div><span>{s.relevant ? '✓' : '•'}</span></button>)}</div>{selected && <div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview: {selected.name}</b><span>maks. 8 baris</span></div><div className="dpt-preview-wrap"><table><thead><tr>{selected.headers.map((h,i)=><th key={`${h}-${i}`}>{h || `Kolom ${i+1}`}</th>)}</tr></thead><tbody>{selected.rows.slice(selected.headerIndex + 1, selected.headerIndex + 9).map((row,r)=><tr key={r}>{selected.headers.map((_,c)=><td key={c}>{clean(row[c]) || '-'}</td>)}</tr>)}</tbody></table></div></div>}{relevant.length === 0 && <div className="dpt-note">Tidak ada sheet yang cocok. Jangan dipaksa import. Gunakan sheet yang memang sesuai dengan halaman <b>{CONTEXT_LABEL[context]}</b>.</div>}<div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={!selected || saving || !canImport}>{saving ? 'Mengimport...' : `Import ${CONTEXT_LABEL[context]}`}</button></div></>}</section></div>
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false), [exporting, setExporting] = useState(false)
  const canImport = ['ADMIN','TRANSPORT'].includes(profile?.role)
  const doExport = async () => { if (!onExport) return; setExporting(true); try { await onExport() } finally { setExporting(false) } }
  if (!CONTEXT_LABEL[context]) return null
  return <><div className="dpt-toolbar"><div><span className="eyebrow">DATA</span><b>{CONTEXT_LABEL[context]}</b></div><div className="dpt-toolbar-actions">{canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}>⇧ Import Excel</button>}<button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}>⇩ {exporting ? 'Exporting...' : 'Export Excel'}</button></div></div>{showImport && <ExcelImportModal context={context} profile={profile} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); window.setTimeout(() => window.location.reload(), 400) }}/>}</>
}