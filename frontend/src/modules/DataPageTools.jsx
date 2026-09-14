import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const norm = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = (value) => clean(value).toUpperCase()

const CONTEXT_LABEL = {
  kendaraan: 'Kendaraan',
  pengajuan: 'Pengajuan Service',
  service: 'Service & Perbaikan',
  sewa: 'Kendaraan Sewa',
  dokumen: 'Dokumen Kendaraan',
}

const ALIASES = {
  nomor_polisi: ['nomor_polisi', 'no_polisi', 'no_pol', 'no_plat', 'plat', 'nomor_kendaraan'],
  kode_kendaraan: ['kode_kendaraan', 'kode', 'kode_unit'],
  merk: ['merk', 'brand'],
  tipe: ['tipe', 'type'],
  jenis_kendaraan: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'],
  warna: ['warna'],
  nomor_rangka: ['nomor_rangka', 'no_rangka', 'no_rangka_kendaraan'],
  nomor_mesin: ['nomor_mesin', 'no_mesin', 'no_mesin_kendaraan'],
  kepemilikan: ['kepemilikan', 'status_kepemilikan', 'ownership'],
  jenis_sewa: ['jenis_sewa', 'jenis_pemilik'],
  pemilik: ['pemilik', 'nama_pemilik', 'pemilik_pic', 'nama_pemilik_pic'],
  driver: ['driver', 'nama_driver', 'driver_pic'],
  lokasi: ['lokasi', 'lokasi_kerja', 'home_base', 'homebase'],
  unit_kerja: ['unit_kerja', 'penggunaan_unit', 'pengunaan_unit'],
  kilometer: ['km', 'kilometer', 'km_terakhir', 'kilometer_terakhir', 'kilometer_pengajuan'],
  status_operasional: ['status_operasional', 'status_unit', 'status_kendaraan'],
  kondisi: ['kondisi', 'kondisi_kendaraan'],
  masa_berlaku_pajak: ['masa_berlaku_pajak', 'masa_pajak', 'jatuh_tempo_pajak', 'pajak_jatuh_tempo'],
  status_pajak: ['status_pajak'],
  catatan_hutang: ['catatan_hutang'],
  keterangan: ['keterangan', 'catatan'],
  tanggal: ['tanggal', 'tgl', 'tanggal_pengajuan', 'tanggal_service'],
  jenis_permintaan: ['jenis_permintaan', 'jenis_perbaikan', 'jenis_service'],
  keluhan: ['keluhan', 'keluhan_kerusakan', 'uraian_kerusakan', 'uraian'],
  prioritas: ['prioritas'],
  jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'pekerjaan'],
  bengkel: ['bengkel', 'nama_bengkel', 'nama_bengkel_service'],
  qty: ['qty', 'jumlah'],
  satuan: ['satuan', 'sat', 'unit'],
  harga_satuan: ['harga_satuan', 'harga_satuan_rp', 'harga'],
  nilai_dpp: ['nilai_dpp', 'dpp'],
  ppn: ['ppn', 'ppn_rp'],
  total: ['total', 'jumlah_rp', 'nilai_total'],
  stnk: ['stnk', 'jatuh_tempo_stnk'],
  kir: ['kir', 'jatuh_tempo_kir'],
  lima_tahun: ['5_tahun', 'lima_tahun', 'jatuh_tempo_5_tahun'],
  nomor_dokumen: ['nomor_dokumen', 'no_dokumen', 'nomor_stnk', 'nomor_kir'],
  nomor_kontrak: ['nomor_kontrak', 'no_kontrak', 'kontrak'],
  nama_perusahaan: ['nama_perusahaan', 'perusahaan'],
  jenis_pemilik: ['jenis_pemilik'],
  tanggal_mulai: ['tanggal_mulai', 'mulai'],
  tanggal_selesai: ['tanggal_selesai', 'selesai'],
  nilai_sewa_bulanan: ['nilai_sewa_bulanan', 'sewa_bulanan', 'harga_sewa'],
  tanggal_jatuh_tempo_bulanan: ['tanggal_jatuh_tempo_bulanan', 'jatuh_tempo_bulanan'],
}

const SHEET_HINTS = {
  kendaraan: ['data kendaraan', 'list kendaraan', 'kendaraan', 'master kendaraan', 'armada'],
  pengajuan: ['permintaan perbaikan', 'pengajuan perbaikan', 'pengajuan service', 'permintaan service', 'pengajuan'],
  service: ['data service', 'service', 'perbaikan', 'histori service', 'riwayat service'],
  sewa: ['sewa kendaraan', 'kendaraan sewa', 'rental', 'kontrak sewa', 'sewa'],
  dokumen: ['stnk', 'kir', 'dokumen kendaraan', 'dokumen', 'pajak'],
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

function readU16(view, offset) { return view.getUint16(offset, true) }
function readU32(view, offset) { return view.getUint32(offset, true) }
function text(bytes) { return new TextDecoder('utf-8').decode(bytes) }

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser ini belum mendukung pembacaan XLSX. Gunakan Chrome atau Edge terbaru.')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (readU32(view, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')

  const count = readU16(view, eocd + 10)
  const centralOffset = readU32(view, eocd + 16)
  const entries = new Map()
  let p = centralOffset

  for (let i = 0; i < count; i += 1) {
    if (readU32(view, p) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = readU16(view, p + 10)
    const compSize = readU32(view, p + 20)
    const nameLen = readU16(view, p + 28)
    const extraLen = readU16(view, p + 30)
    const commentLen = readU16(view, p + 32)
    const localOffset = readU32(view, p + 42)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen))
    const local = new DataView(buffer, localOffset)
    const localNameLen = readU16(local, 26)
    const localExtraLen = readU16(local, 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    entries.set(name, { method, bytes: bytes.slice(dataStart, dataStart + compSize) })
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

function colIndex(name) {
  let n = 0
  for (const c of name) n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
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
  if (shared) {
    const sharedDoc = new DOMParser().parseFromString(text(shared), 'application/xml')
    sharedDoc.querySelectorAll('si').forEach((si) => {
      sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join('')))
    })
  }

  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))
  const sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) {
    const target0 = relMap[sheet.getAttribute('r:id')]
    if (!target0) continue
    const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`
    const sheetXml = text(await zip.read(target) || new Uint8Array())
    sheets.push({ name: sheet.getAttribute('name') || target, rows: parseSheetXml(sheetXml, sharedStrings) })
  }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}

function findHeader(rows) {
  let best = { index: -1, row: [], score: -1 }
  rows.slice(0, 40).forEach((row, idx) => {
    const score = row.filter(Boolean).map(norm).filter(Boolean).length
    if (score > best.score) best = { index: idx, row, score }
  })
  return best.index >= 0 ? best : { index: 0, row: rows[0] || [], score: 0 }
}

function valueOf(row, headers, key) {
  const aliases = ALIASES[key] || [key]
  const index = headers.findIndex((header) => aliases.includes(norm(header)))
  return index >= 0 ? clean(row[index]) : ''
}

function hasHeader(headers, key) {
  return headers.some((header) => (ALIASES[key] || []).includes(norm(header)))
}

function numberValue(value) {
  const v = clean(value)
  if (!v) return null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
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
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const date = new Date(v)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function sheetScore(sheet, context) {
  const { row: headers } = findHeader(sheet.rows)
  const normalizedSheetName = norm(sheet.name)
  const normalizedHeaders = headers.map(norm)
  let score = 0
  if (SHEET_HINTS[context]?.some((hint) => normalizedSheetName === norm(hint))) score += 8
  if (SHEET_HINTS[context]?.some((hint) => normalizedSheetName.includes(norm(hint)))) score += 4

  const headerHas = (key, points = 1) => {
    if (normalizedHeaders.some((h) => (ALIASES[key] || []).includes(h))) score += points
  }

  if (context === 'kendaraan') {
    headerHas('nomor_polisi', 5); headerHas('merk', 3); headerHas('tipe', 1); headerHas('jenis_kendaraan', 1)
  } else if (context === 'pengajuan') {
    headerHas('nomor_polisi', 4); headerHas('keluhan', 4); headerHas('tanggal', 1); headerHas('prioritas', 1)
  } else if (context === 'service') {
    headerHas('nomor_polisi', 4); headerHas('tanggal', 3); headerHas('bengkel', 3); headerHas('nilai_dpp', 1); headerHas('jenis_pekerjaan', 1)
  } else if (context === 'sewa') {
    headerHas('nomor_kontrak', 5); headerHas('nomor_polisi', 3); headerHas('tanggal_mulai', 2); headerHas('tanggal_selesai', 2); headerHas('nilai_sewa_bulanan', 2)
  } else if (context === 'dokumen') {
    headerHas('nomor_polisi', 4); headerHas('stnk', 3); headerHas('kir', 3); headerHas('lima_tahun', 2); headerHas('nomor_dokumen', 1)
  }
  return score
}

function prepareSheets(sheets, context) {
  return sheets
    .map((sheet) => {
      const header = findHeader(sheet.rows)
      return { ...sheet, headerIndex: header.index, headers: header.row, score: sheetScore(sheet, context) }
    })
    .sort((a, b) => b.score - a.score)
}

function dataRows(sheet) {
  return sheet.rows.slice(sheet.headerIndex + 1).filter((row) => row.some((value) => clean(value)))
}

async function importKendaraan(sheet) {
  const rows = dataRows(sheet)
  const headers = sheet.headers
  if (!hasHeader(headers, 'nomor_polisi') || !hasHeader(headers, 'merk')) {
    throw new Error('Sheet Kendaraan minimal harus memiliki kolom Nomor Polisi dan Merk.')
  }

  const [vehiclesResult, driversResult] = await Promise.all([
    supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,warna,nomor_rangka,nomor_mesin,kepemilikan,jenis_sewa,pemilik,driver_id,lokasi,unit_kerja,kilometer_terakhir,status,kondisi,keterangan,masa_berlaku_pajak,status_pajak,catatan_hutang'),
    supabase.from('driver').select('id,nama_lengkap,lokasi,status,keterangan'),
  ])
  if (vehiclesResult.error) throw vehiclesResult.error
  if (driversResult.error) throw driversResult.error

  const existingByPlate = Object.fromEntries((vehiclesResult.data || []).map((item) => [upper(item.nomor_polisi), item]))
  const existingCodes = new Set((vehiclesResult.data || []).map((item) => upper(item.kode_kendaraan)).filter(Boolean))
  const driverByName = Object.fromEntries((driversResult.data || []).map((item) => [upper(item.nama_lengkap), item]))
  const seen = new Set()
  let added = 0, updated = 0, skipped = 0, driversCreated = 0, stnkSaved = 0

  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    if (!plate || seen.has(plate)) { skipped += 1; continue }
    const merk = valueOf(row, headers, 'merk')
    if (!merk) { skipped += 1; continue }
    seen.add(plate)

    const owner = valueOf(row, headers, 'pemilik') || null
    const ownershipRaw = upper(valueOf(row, headers, 'kepemilikan'))
    const sourceStatus = upper(valueOf(row, headers, 'status_operasional'))
    const isRental = /^(SEWA|RENTAL|KENDARAAN SEWA)$/.test(ownershipRaw)
    const jenisSewa = isRental
      ? (valueOf(row, headers, 'jenis_sewa') ? upper(valueOf(row, headers, 'jenis_sewa')).replace(/\s+/g, '_') : /RENTAL|PT\b|CV\b|UD\b|PD\b/.test(upper(owner || '')) ? 'SEWA_RENTAL' : 'SEWA_PERORANGAN')
      : null

    const current = existingByPlate[plate]
    const driverName = valueOf(row, headers, 'driver')
    let driverId = driverByName[upper(driverName)]?.id || null
    if (driverName && !driverId) {
      const created = await supabase.from('driver').insert({
        nama_lengkap: driverName,
        lokasi: valueOf(row, headers, 'lokasi') || null,
        status: 'AKTIF',
        keterangan: 'Dibuat otomatis dari import Excel Kendaraan.',
      }).select('id,nama_lengkap,lokasi,status,keterangan').single()
      if (created.error) throw new Error(`Gagal membuat driver ${driverName}: ${created.error.message}`)
      driverId = created.data.id
      driverByName[upper(driverName)] = created.data
      driversCreated += 1
    }

    let code = upper(valueOf(row, headers, 'kode_kendaraan') || current?.kode_kendaraan || `KND-${plate.replace(/\W+/g, '')}`)
    if (!current && existingCodes.has(code)) code = `${code}-${plate.replace(/\W+/g, '')}`
    existingCodes.add(code)

    const payload = {
      kode_kendaraan: code,
      nomor_polisi: plate,
      merk: merk || current?.merk || null,
      tipe: valueOf(row, headers, 'tipe') || current?.tipe || null,
      jenis_kendaraan: valueOf(row, headers, 'jenis_kendaraan') || current?.jenis_kendaraan || null,
      tahun: numberValue(valueOf(row, headers, 'tahun')) ?? current?.tahun ?? null,
      warna: valueOf(row, headers, 'warna') || current?.warna || null,
      nomor_rangka: valueOf(row, headers, 'nomor_rangka') || current?.nomor_rangka || null,
      nomor_mesin: valueOf(row, headers, 'nomor_mesin') || current?.nomor_mesin || null,
      kepemilikan: isRental ? 'SEWA' : 'ASET_KANTOR',
      jenis_sewa: isRental ? (['SEWA_PERORANGAN', 'SEWA_RENTAL'].includes(jenisSewa) ? jenisSewa : 'SEWA_PERORANGAN') : null,
      pemilik: owner || current?.pemilik || null,
      driver_id: driverId || current?.driver_id || null,
      lokasi: valueOf(row, headers, 'lokasi') || current?.lokasi || null,
      unit_kerja: valueOf(row, headers, 'unit_kerja') || current?.unit_kerja || null,
      kilometer_terakhir: numberValue(valueOf(row, headers, 'kilometer')) ?? current?.kilometer_terakhir ?? 0,
      status: ['ACTIVE', 'SERVICE', 'TIDAK_AKTIF'].includes(sourceStatus) ? sourceStatus : (current?.status || 'ACTIVE'),
      kondisi: valueOf(row, headers, 'kondisi') || current?.kondisi || null,
      keterangan: valueOf(row, headers, 'keterangan') || current?.keterangan || null,
      masa_berlaku_pajak: excelDate(valueOf(row, headers, 'masa_berlaku_pajak')) || current?.masa_berlaku_pajak || null,
      status_pajak: valueOf(row, headers, 'status_pajak') || current?.status_pajak || null,
      catatan_hutang: valueOf(row, headers, 'catatan_hutang') || current?.catatan_hutang || null,
    }

    const result = current
      ? await supabase.from('kendaraan').update(payload).eq('id', current.id)
      : await supabase.from('kendaraan').insert(payload).select('id').single()
    if (result.error) throw new Error(`Gagal menyimpan kendaraan ${plate}: ${result.error.message}`)

    const vehicleId = current?.id || result.data?.id
    if (current) updated += 1; else added += 1

    const taxDue = excelDate(valueOf(row, headers, 'masa_berlaku_pajak'))
    if (vehicleId && taxDue) {
      const existingDoc = await supabase.from('dokumen_kendaraan').select('id').eq('kendaraan_id', vehicleId).eq('jenis_dokumen', 'STNK').limit(1)
      if (existingDoc.error) throw existingDoc.error
      const note = valueOf(row, headers, 'status_pajak') ? `Status pajak: ${valueOf(row, headers, 'status_pajak')}. Import Excel: ${sheet.name}` : `Import Excel: ${sheet.name}`
      if (existingDoc.data?.length) {
        const r = await supabase.from('dokumen_kendaraan').update({ tanggal_jatuh_tempo: taxDue, nomor_dokumen: valueOf(row, headers, 'nomor_dokumen') || null, keterangan: note }).eq('id', existingDoc.data[0].id)
        if (r.error) throw new Error(`Gagal memperbarui STNK ${plate}: ${r.error.message}`)
      } else {
        const r = await supabase.from('dokumen_kendaraan').insert({ kendaraan_id: vehicleId, jenis_dokumen: 'STNK', tanggal_jatuh_tempo: taxDue, nomor_dokumen: valueOf(row, headers, 'nomor_dokumen') || null, keterangan: note })
        if (r.error) throw new Error(`Gagal menyimpan STNK ${plate}: ${r.error.message}`)
        stnkSaved += 1
      }
    }
  }

  return `${added} kendaraan baru, ${updated} diperbarui, ${driversCreated} driver dibuat, ${stnkSaved} data STNK/pajak dicatat, ${skipped} baris dilewati.`
}

async function importDokumen(sheet) {
  const rows = dataRows(sheet)
  const headers = sheet.headers
  if (!hasHeader(headers, 'nomor_polisi')) throw new Error('Sheet Dokumen wajib memiliki kolom Nomor Polisi.')
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi')
  if (vehicles.error) throw vehicles.error
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((item) => [upper(item.nomor_polisi), item]))
  let inserted = 0, skipped = 0

  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const vehicle = vehicleMap[plate]
    if (!vehicle) { skipped += 1; continue }

    const documents = [
      ['stnk', 'STNK'],
      ['kir', 'KIR'],
      ['lima_tahun', '5_TAHUN'],
    ]

    for (const [key, type] of documents) {
      const due = excelDate(valueOf(row, headers, key))
      if (!due) continue
      const duplicate = await supabase.from('dokumen_kendaraan').select('id').eq('kendaraan_id', vehicle.id).eq('jenis_dokumen', type).eq('tanggal_jatuh_tempo', due).limit(1)
      if (duplicate.error) throw duplicate.error
      if (duplicate.data?.length) { skipped += 1; continue }
      const result = await supabase.from('dokumen_kendaraan').insert({
        kendaraan_id: vehicle.id,
        jenis_dokumen: type,
        nomor_dokumen: valueOf(row, headers, 'nomor_dokumen') || null,
        tanggal_jatuh_tempo: due,
        keterangan: `Import Excel: ${sheet.name}`,
      })
      if (result.error) throw result.error
      inserted += 1
    }
  }
  return `${inserted} dokumen ditambahkan, ${skipped} dilewati.`
}

async function importPengajuan(sheet, profile) {
  const rows = dataRows(sheet)
  const headers = sheet.headers
  if (!hasHeader(headers, 'nomor_polisi') || !hasHeader(headers, 'keluhan')) throw new Error('Sheet Pengajuan minimal harus memiliki kolom Nomor Polisi dan Keluhan.')
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir')
  if (vehicles.error) throw vehicles.error
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((item) => [upper(item.nomor_polisi), item]))
  let added = 0, skipped = 0

  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const vehicle = vehicleMap[plate]
    const complaint = valueOf(row, headers, 'keluhan')
    if (!vehicle || !complaint) { skipped += 1; continue }
    const date = excelDate(valueOf(row, headers, 'tanggal')) || new Date().toISOString().slice(0, 10)
    const km = numberValue(valueOf(row, headers, 'kilometer')) ?? vehicle.kilometer_terakhir ?? 0
    const result = await supabase.from('permintaan_service').insert({
      pemohon_id: profile.id,
      kendaraan_id: vehicle.id,
      tanggal_pengajuan: date,
      kilometer_pengajuan: km,
      jenis_permintaan: valueOf(row, headers, 'jenis_permintaan') || 'SERVICE',
      keluhan: complaint,
      prioritas: valueOf(row, headers, 'prioritas') || 'NORMAL',
      status: 'MENUNGGU_TRANSPORT',
    })
    if (result.error) throw result.error
    added += 1
  }
  return `${added} pengajuan ditambahkan, ${skipped} baris dilewati.`
}

async function importService(sheet, profile) {
  const rows = dataRows(sheet)
  const headers = sheet.headers
  if (!hasHeader(headers, 'nomor_polisi') || !hasHeader(headers, 'tanggal')) throw new Error('Sheet Service minimal harus memiliki kolom Nomor Polisi dan Tanggal.')
  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir')
  if (vehicles.error) throw vehicles.error
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((item) => [upper(item.nomor_polisi), item]))
  const groups = new Map()

  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const date = excelDate(valueOf(row, headers, 'tanggal'))
    if (!plate || !date || !vehicleMap[plate]) continue
    const shop = valueOf(row, headers, 'bengkel') || '-'
    const key = `${plate}|${date}|${upper(shop)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  let created = 0, skipped = 0, items = 0
  for (const group of groups.values()) {
    const first = group[0]
    const plate = upper(valueOf(first, headers, 'nomor_polisi'))
    const vehicle = vehicleMap[plate]
    const date = excelDate(valueOf(first, headers, 'tanggal'))
    const shop = valueOf(first, headers, 'bengkel') || null
    const duplicate = await supabase.from('service').select('id').eq('kendaraan_id', vehicle.id).eq('tanggal_service', date).eq('bengkel', shop).limit(1)
    if (duplicate.error) throw duplicate.error
    if (duplicate.data?.length) { skipped += 1; continue }

    const dpp = group.reduce((sum, row) => sum + (numberValue(valueOf(row, headers, 'nilai_dpp')) || 0), 0)
    const ppn = group.reduce((sum, row) => sum + (numberValue(valueOf(row, headers, 'ppn')) || 0), 0)
    const total = group.reduce((sum, row) => sum + (numberValue(valueOf(row, headers, 'total')) || 0), 0) || dpp + ppn
    const km = numberValue(valueOf(first, headers, 'kilometer')) ?? vehicle.kilometer_terakhir ?? 0
    const complaint = valueOf(first, headers, 'keluhan') || 'Import histori service dari Excel.'
    const workRaw = group.map((row) => valueOf(row, headers, 'jenis_pekerjaan')).join(' ').toUpperCase()
    const jenis = /BAN/.test(workRaw) ? 'GANTI_BAN' : /AKI|BATERAI/.test(workRaw) ? 'GANTI_AKI' : 'SERVICE'

    const request = await supabase.from('permintaan_service').insert({
      pemohon_id: profile.id,
      kendaraan_id: vehicle.id,
      tanggal_pengajuan: date,
      kilometer_pengajuan: km,
      jenis_permintaan: jenis,
      keluhan: complaint,
      prioritas: 'NORMAL',
      status: 'MENUNGGU_TRANSPORT',
    }).select('id').single()
    if (request.error) throw request.error

    const service = await supabase.from('service').insert({
      nomor_service: `IMP-SRV-${Date.now()}-${created + 1}`,
      permintaan_service_id: request.data.id,
      kendaraan_id: vehicle.id,
      tanggal_service: date,
      kilometer: km,
      bengkel: shop,
      jenis_service: jenis,
      keluhan: complaint,
      estimasi_biaya: dpp,
      biaya_aktual: total,
      status: 'DRAFT',
      diproses_oleh: profile.id,
      nilai_dpp: dpp,
      ppn,
      total,
      catatan: `Import histori Excel: ${sheet.name}`,
    }).select('id').single()
    if (service.error) throw service.error

    const payloadItems = group.map((row) => ({
      service_id: service.data.id,
      nama_item: valueOf(row, headers, 'keterangan') || valueOf(row, headers, 'jenis_pekerjaan') || 'Item Excel',
      kategori: /JASA/i.test(valueOf(row, headers, 'jenis_pekerjaan')) ? 'JASA_SERVICE' : /BAN/i.test(valueOf(row, headers, 'jenis_pekerjaan')) ? 'BAN' : /AKI|BATERAI/i.test(valueOf(row, headers, 'jenis_pekerjaan')) ? 'AKI_BATERAI' : 'MATERIAL_SPAREPART',
      jumlah: numberValue(valueOf(row, headers, 'qty')) || 1,
      satuan: valueOf(row, headers, 'satuan') || 'pcs',
      harga_satuan: numberValue(valueOf(row, headers, 'harga_satuan')) || 0,
      subtotal: numberValue(valueOf(row, headers, 'nilai_dpp')) || 0,
      keterangan: valueOf(row, headers, 'keterangan') || null,
    }))
    if (payloadItems.length) {
      const result = await supabase.from('service_item').insert(payloadItems)
      if (result.error) throw result.error
      items += payloadItems.length
    }

    const requestUpdate = await supabase.from('permintaan_service').update({
      status: 'DALAM_PROSES',
      diproses_oleh: profile.id,
      diproses_at: new Date().toISOString(),
    }).eq('id', request.data.id)
    if (requestUpdate.error) throw requestUpdate.error
    created += 1
  }
  return `${created} transaksi service dibuat, ${items} item tercatat, ${skipped} transaksi dilewati karena duplikat.`
}

async function importSewa(sheet, profile) {
  const rows = dataRows(sheet)
  const headers = sheet.headers
  const required = ['nomor_kontrak', 'nomor_polisi', 'tanggal_mulai', 'tanggal_selesai', 'nilai_sewa_bulanan']
  if (!required.every((key) => hasHeader(headers, key))) {
    throw new Error('Sheet Sewa wajib memiliki kolom Nomor Kontrak, Nomor Polisi, Tanggal Mulai, Tanggal Selesai, dan Nilai Sewa Bulanan.')
  }

  const vehicles = await supabase.from('kendaraan').select('id,nomor_polisi')
  if (vehicles.error) throw vehicles.error
  const vehicleMap = Object.fromEntries((vehicles.data || []).map((item) => [upper(item.nomor_polisi), item]))
  let added = 0, skipped = 0

  for (const row of rows) {
    const plate = upper(valueOf(row, headers, 'nomor_polisi'))
    const vehicle = vehicleMap[plate]
    const nomorKontrak = valueOf(row, headers, 'nomor_kontrak')
    const start = excelDate(valueOf(row, headers, 'tanggal_mulai'))
    const end = excelDate(valueOf(row, headers, 'tanggal_selesai'))
    if (!vehicle || !nomorKontrak || !start || !end) { skipped += 1; continue }

    const ownerName = valueOf(row, headers, 'pemilik') || '-'
    let owner = await supabase.from('pemilik_sewa').select('id').eq('nama_pemilik', ownerName).maybeSingle()
    if (owner.error) throw owner.error
    if (!owner.data) {
      const createdOwner = await supabase.from('pemilik_sewa').insert({
        jenis_pemilik: valueOf(row, headers, 'jenis_pemilik') || 'PERORANGAN',
        nama_pemilik: ownerName,
        nama_perusahaan: valueOf(row, headers, 'nama_perusahaan') || null,
        aktif: true,
      }).select('id').single()
      if (createdOwner.error) throw createdOwner.error
      owner = { data: createdOwner.data, error: null }
    }

    const duplicate = await supabase.from('kontrak_sewa').select('id').eq('nomor_kontrak', nomorKontrak).maybeSingle()
    if (duplicate.error) throw duplicate.error
    if (duplicate.data) { skipped += 1; continue }

    const result = await supabase.from('kontrak_sewa').insert({
      nomor_kontrak: nomorKontrak,
      kendaraan_id: vehicle.id,
      pemilik_sewa_id: owner.data.id,
      tanggal_mulai: start,
      tanggal_selesai: end,
      periode_bulan: 6,
      nilai_sewa_bulanan: numberValue(valueOf(row, headers, 'nilai_sewa_bulanan')) || 0,
      tanggal_jatuh_tempo_bulanan: excelDate(valueOf(row, headers, 'tanggal_jatuh_tempo_bulanan')),
      status: 'AKTIF',
      catatan: `Import Excel: ${sheet.name}`,
      dibuat_oleh: profile.id,
    })
    if (result.error) throw result.error
    added += 1
  }
  return `${added} kontrak sewa ditambahkan, ${skipped} baris dilewati.`
}

const IMPORTERS = { kendaraan: importKendaraan, dokumen: importDokumen, pengajuan: importPengajuan, service: importService, sewa: importSewa }

function ExcelImportModal({ context, profile, onDone, onClose }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const scan = async (nextFile) => {
    setFile(nextFile || null)
    setSelected(null)
    setError('')
    setMessage('')
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) {
      setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung oleh importer ini.')
      return
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('Ukuran file maksimal 10 MB agar proses preview dan import tetap stabil.')
      return
    }

    setLoading(true)
    try {
      const sheets = prepareSheets(await parseXlsx(nextFile), context)
      const candidate = sheets[0]
      if (!candidate || candidate.score < 4) {
        throw new Error(`Data ${CONTEXT_LABEL[context]} tidak ditemukan secara meyakinkan. Periksa nama sheet dan minimal kolom yang diperlukan.`)
      }
      setSelected(candidate)
      setMessage(`Sheet "${candidate.name}" dipilih otomatis berdasarkan nama sheet dan struktur kolom. Tidak ada pemilihan sheet secara paksa.`)
    } catch (e) {
      setError(e.message || 'File Excel tidak dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }

  const start = async () => {
    if (!selected || !canImport || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await IMPORTERS[context](selected, profile)
      setMessage(`Import ${CONTEXT_LABEL[context]} berhasil. ${result}`)
      onDone?.()
    } catch (e) {
      setError(e?.message || 'Import gagal. Periksa data dan coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label={`Import ${CONTEXT_LABEL[context]}`}>
    <section className="dpt-modal">
      <header>
        <div><span className="eyebrow">IMPORT EXCEL</span><h3>Import {CONTEXT_LABEL[context]}</h3><p>Upload → deteksi sheet → preview → validasi → cek duplikat → simpan.</p></div>
        <button type="button" className="dpt-icon" onClick={onClose} aria-label="Tutup">×</button>
      </header>

      {error && <div className="dpt-alert error">{error}</div>}
      {message && <div className="dpt-alert success">{message}</div>}

      <div className="dpt-upload">
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => scan(e.target.files?.[0])}/>
        <button type="button" className="dpt-button primary" onClick={() => inputRef.current?.click()} disabled={loading || saving}>
          {loading ? 'Membaca Excel...' : file ? file.name : 'Pilih File Excel (.xlsx)'}
        </button>
        <small>Hanya .xlsx • maksimal 10 MB</small>
      </div>

      {file && selected && <>
        <div className="dpt-selection">
          <div><b>Sheet terdeteksi: {selected.name}</b><span>Skor kecocokan: {selected.score}</span></div>
          <span>Baris data: {dataRows(selected).length}</span>
        </div>
        <div className="dpt-preview">
          <div className="dpt-sheet-title"><b>Preview Data</b><span>maks. 8 baris</span></div>
          <div className="dpt-preview-wrap">
            <table><thead><tr>{selected.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Kolom ${index + 1}`}</th>)}</tr></thead>
              <tbody>{selected.rows.slice(selected.headerIndex + 1, selected.headerIndex + 9).map((row, rowIndex) => <tr key={rowIndex}>{selected.headers.map((_, columnIndex) => <td key={columnIndex}>{clean(row[columnIndex]) || '-'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </>}

      <div className="dpt-actions">
        <button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button>
        <button type="button" className="dpt-button primary" onClick={start} disabled={!selected || saving || !canImport}>
          {saving ? 'Mengimport...' : `Import ${CONTEXT_LABEL[context]}`}
        </button>
      </div>
    </section>
  </div>
}

export default function DataPageTools({ context, profile, onExport }) {
  const [showImport, setShowImport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  if (!CONTEXT_LABEL[context]) return null

  const doExport = async () => {
    if (!onExport || exporting) return
    setExporting(true)
    try { await onExport() } finally { setExporting(false) }
  }

  return <>
    {showImport && <ExcelImportModal context={context} profile={profile} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); window.setTimeout(() => window.location.reload(), 400) }}/>} 
    <div className="dpt-toolbar">
      <div><span className="eyebrow">DATA</span><b>{CONTEXT_LABEL[context]}</b></div>
      <div className="dpt-toolbar-actions">
        {canImport && <button className="dpt-button secondary" type="button" onClick={() => setShowImport(true)}>⇧ Import Excel</button>}
        <button className="dpt-button primary" type="button" onClick={doExport} disabled={exporting}>{exporting ? 'Exporting...' : '⇩ Export Excel'}</button>
      </div>
    </div>
  </>
}
