import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './DataPageTools.css'
import './ServiceHistoryImportModal.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const CONCURRENCY = 4
const ALIASES = {
  nomor_polisi: ['no_polisi', 'no_pol', 'nomor_polisi', 'no_plat', 'plat'],
  merk: ['merk', 'brand'], tipe: ['tipe', 'type'], jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'], driver: ['driver_pic', 'driver', 'nama_driver'],
  tanggal: ['tanggal', 'tgl', 'tanggal_service'], jenis_pekerjaan: ['jenis_pekerjaan', 'jenis_pekerjan', 'pekerjaan'],
  uraian: ['uraian', 'deskripsi', 'item', 'pekerjaan_detail'], qty: ['qty', 'jumlah'], satuan: ['sat', 'satuan', 'unit'],
  harga_satuan: ['harga_satuan', 'harga_satuan_rp', 'harga'], nilai_dpp: ['nilai_dpp', 'dpp'], ppn: ['ppn', 'ppn_rp'],
  total: ['total', 'nilai_total', 'jumlah_rp', 'biaya', 'biaya_rp', 'biaya_service'], kilometer: ['km', 'kilometer', 'km_terakhir'],
  bengkel: ['nama_bengkel', 'bengkel', 'nama_bengkel_service'], keterangan: ['keterangan', 'catatan'],
}
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const upper = v => clean(v).toUpperCase()
const colIndex = name => { let n = 0; for (const c of name) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
const text = bytes => new TextDecoder('utf-8').decode(bytes)

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser belum mendukung pembacaan XLSX. Gunakan Chrome/Edge terbaru.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
async function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('File bukan XLSX yang valid atau file rusak.')
  const count = view.getUint16(eocd + 10, true), centralOffset = view.getUint32(eocd + 16, true), entries = new Map()
  let p = centralOffset
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur ZIP XLSX tidak valid.')
    const method = view.getUint16(p + 10, true), compSize = view.getUint32(p + 20, true), nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true), localOffset = view.getUint32(p + 42, true)
    const name = text(bytes.slice(p + 46, p + 46 + nameLen)), local = new DataView(buffer, localOffset), localNameLen = local.getUint16(26, true), localExtraLen = local.getUint16(28, true)
    entries.set(name, { method, bytes: bytes.slice(localOffset + 30 + localNameLen + localExtraLen, localOffset + 30 + localNameLen + localExtraLen + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { read: async name => { const entry = entries.get(name); if (!entry) return null; if (entry.method === 0) return entry.bytes; if (entry.method === 8) return inflate(entry.bytes); throw new Error(`Metode kompresi XLSX ${entry.method} belum didukung.`) } }
}
function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('Sheet XLSX tidak dapat dibaca.')
  const rows = []
  doc.querySelectorAll('sheetData > row').forEach(row => {
    const values = []
    row.querySelectorAll(':scope > c').forEach(cell => {
      const ref = cell.getAttribute('r') || '', match = ref.match(/^([A-Z]+)/); if (!match) return
      const idx = colIndex(match[1]), type = cell.getAttribute('t') || ''
      let value = clean(cell.querySelector('v')?.textContent)
      if (type === 's') value = sharedStrings[Number(value)] || ''
      else if (type === 'inlineStr') value = clean(Array.from(cell.querySelectorAll('is t')).map(t => t.textContent || '').join(''))
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      values[idx] = value
    })
    if (values.some(value => clean(value))) rows.push({ excelRow: Number(row.getAttribute('r') || rows.length + 1), values })
  })
  return rows
}
async function parseXlsx(file) {
  const zip = await unzip(await file.arrayBuffer()), workbook = new DOMParser().parseFromString(text(await zip.read('xl/workbook.xml') || new Uint8Array()), 'application/xml'), rels = new DOMParser().parseFromString(text(await zip.read('xl/_rels/workbook.xml') || new Uint8Array()), 'application/xml')
  const sharedStrings = [], shared = await zip.read('xl/sharedStrings.xml')
  if (shared) { const doc = new DOMParser().parseFromString(text(shared), 'application/xml'); doc.querySelectorAll('si').forEach(si => sharedStrings.push(clean(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join('')))) }
  const relMap = Object.fromEntries(Array.from(rels.querySelectorAll('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')])), sheets = []
  for (const sheet of Array.from(workbook.querySelectorAll('sheets > sheet'))) { const target0 = relMap[sheet.getAttribute('r:id')]; if (!target0) continue; const target = target0.startsWith('xl/') ? target0 : `xl/${target0.replace(/^\//, '')}`; sheets.push({ name: sheet.getAttribute('name') || target, rows: parseSheetXml(text(await zip.read(target) || new Uint8Array()), sharedStrings) }) }
  if (!sheets.length) throw new Error('Tidak ada sheet yang bisa dibaca dari file Excel.')
  return sheets
}
function findHeader(sheet) { let best = { index: -1, row: [], score: -1 }; sheet.rows.slice(0, 80).forEach((item, idx) => { const score = item.values.filter(Boolean).map(norm).filter(Boolean).length; if (score > best.score) best = { index: idx, row: item.values, score } }); return best }
function getValue(row, headers, key) { const aliases = ALIASES[key] || [key], index = headers.findIndex(h => aliases.includes(norm(h))); return index >= 0 ? clean(row.values[index]) : '' }
function numberValue(v) { const s = clean(v); if (!s) return null; if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.')); const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null }
function serviceCurrency(v) { const s = clean(v); if (!s) return 0; if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.')); const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n * 1000 : 0 }
function excelDate(v) {
  const s = clean(v); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) { const [d, m, y] = s.split(/[/-]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  const months = { jan:1, januari:1, feb:2, februari:2, mar:3, maret:3, apr:4, april:4, mei:5, may:5, jun:6, juni:6, jul:7, juli:7, agu:8, agustus:8, sep:9, september:9, okt:10, oktober:10, nov:11, november:11, des:12, desember:12 }
  const named = s.toLowerCase().replace(/\./g, '').match(/^(\d{1,2})[-\s/]([a-z]+)[-\s/](\d{2,4})$/)
  if (named) { const month = months[named[2]]; let year = Number(named[3]); if (year < 100) year += year >= 70 ? 1900 : 2000; if (month) return `${year}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}` }
  const serial = Number(s); if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
function parseRow(row, headers) { return { excelRow: row.excelRow, values: row.values, nomor_polisi: upper(getValue(row, headers, 'nomor_polisi')), merk: getValue(row, headers, 'merk'), tipe: getValue(row, headers, 'tipe'), jenis: getValue(row, headers, 'jenis'), tahun: getValue(row, headers, 'tahun'), driver: getValue(row, headers, 'driver'), tanggal: excelDate(getValue(row, headers, 'tanggal')), jenis_pekerjaan: getValue(row, headers, 'jenis_pekerjaan'), uraian: getValue(row, headers, 'uraian'), qty: numberValue(getValue(row, headers, 'qty')) ?? 1, satuan: getValue(row, headers, 'satuan') || 'pcs', harga_satuan: serviceCurrency(getValue(row, headers, 'harga_satuan')), nilai_dpp: serviceCurrency(getValue(row, headers, 'nilai_dpp')), ppn: serviceCurrency(getValue(row, headers, 'ppn')), total: serviceCurrency(getValue(row, headers, 'total')), kilometer: numberValue(getValue(row, headers, 'kilometer')) ?? 0, bengkel: getValue(row, headers, 'bengkel') || null, keterangan: getValue(row, headers, 'keterangan') || null } }
function typeFor(rows) { const raw = rows.map(r => upper(r.jenis_pekerjaan)).join(' '); if (/GANTI\s+BAN|PENGGANTIAN\s+BAN/.test(raw)) return 'GANTI_BAN'; if (/GANTI\s+(AKI|BATERAI)|PENGGANTIAN\s+(AKI|BATERAI)/.test(raw)) return 'GANTI_AKI'; if (/PEMERIKSAAN/.test(raw)) return 'PEMERIKSAAN'; return 'SERVICE' }
function itemCategory(v) { const raw = upper(v); if (/BAN/.test(raw)) return 'BAN'; if (/AKI|BATERAI/.test(raw)) return 'AKI_BATERAI'; if (/JASA|SERVICE/.test(raw)) return 'JASA_SERVICE'; return 'MATERIAL_SPAREPART' }
function chooseServiceSheet(sheets) { return sheets.map(sheet => { const header = findHeader(sheet), h = header.row.map(norm), name = norm(sheet.name); let score = 0; if (name === 'data_service') score += 20; else if (name.includes('data_service')) score += 12; if (name.includes('rekapan_permintaan')) score += 10; if (name.includes('monitoring_perbaikan')) score += 10; if (h.includes('no_polisi') || h.includes('no_pol')) score += 5; if (h.includes('tanggal')) score += 4; if (h.includes('uraian')) score += 3; if (h.includes('nilai_dpp') || h.includes('biaya')) score += 3; return { sheet, header, score } }).sort((a,b) => b.score-a.score)[0] }
function groupRows(rows) { const groups = new Map(); rows.forEach(row => { const key = `${row.nomor_polisi}|${row.tanggal}|${upper(row.bengkel || '-')}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row) }); return [...groups.entries()].map(([key, values]) => ({ key, values })) }
async function importHistory(rows, profile, sheetName, onProgress) {
  const valid = rows.filter(r => r.nomor_polisi && r.tanggal), groups = groupRows(valid)
  const [{ data: vehicles, error: vehicleError }, { data: existing, error: existingError }] = await Promise.all([supabase.from('kendaraan').select('id,nomor_polisi,kilometer_terakhir'), supabase.from('service').select('id,kendaraan_id,tanggal_service,bengkel')])
  if (vehicleError) throw new Error(`Tidak bisa membaca master kendaraan: ${vehicleError.message}`); if (existingError) throw new Error(`Tidak bisa membaca histori service: ${existingError.message}`)
  const vehicleMap = Object.fromEntries((vehicles || []).map(v => [upper(v.nomor_polisi), v])), existingKeys = new Set((existing || []).map(s => `${s.kendaraan_id}|${s.tanggal_service}|${upper(s.bengkel || '-')}`)), unknown = [...new Set(valid.map(r => r.nomor_polisi).filter(p => !vehicleMap[p]))]
  const candidates = groups.filter(group => { const v = vehicleMap[group.values[0].nomor_polisi]; return v && !existingKeys.has(`${v.id}|${group.values[0].tanggal}|${upper(group.values[0].bengkel || '-')}`) }).map(group => ({ group, vehicle: vehicleMap[group.values[0].nomor_polisi] }))
  let cursor = 0, completed = 0, failure = null, itemCount = 0; const results = [], kmUpdates = []
  const worker = async () => { while (!failure) { const index = cursor++; if (index >= candidates.length) return; const { group, vehicle } = candidates[index], first = group.values[0], dpp = group.values.reduce((n,r)=>n+r.nilai_dpp,0), ppn = group.values.reduce((n,r)=>n+r.ppn,0), total = group.values.reduce((n,r)=>n+r.total,0), kilometer = Math.max(...group.values.map(r=>r.kilometer || 0)), jenis = typeFor(group.values), complaint = group.values.find(r=>r.uraian)?.uraian || `Riwayat ${jenis}`, note = `Import histori Excel: ${sheetName}`
    try {
      const request = await supabase.from('permintaan_service').insert({ pemohon_id: profile.id, kendaraan_id: vehicle.id, tanggal_pengajuan: first.tanggal, kilometer_pengajuan: kilometer, jenis_permintaan: jenis, keluhan: complaint, prioritas: 'NORMAL', status: 'MENUNGGU_TRANSPORT' }).select('id').single(); if (request.error) throw new Error(`Pengajuan histori ${first.nomor_polisi}: ${request.error.message}`)
      const service = await supabase.from('service').insert({ nomor_service:`IMP-SRV-${Date.now()}-${index+1}`, permintaan_service_id:request.data.id, kendaraan_id:vehicle.id, tanggal_service:first.tanggal, kilometer, bengkel:first.bengkel, jenis_service:jenis, keluhan:complaint, estimasi_biaya:total, biaya_aktual:total, status:'DALAM_PENGERJAAN', diproses_oleh:profile.id, nilai_dpp:dpp, ppn, total, catatan:note }).select('id').single(); if (service.error) throw new Error(`Service histori ${first.nomor_polisi}: ${service.error.message}`)
      const items = group.values.map(r => { const subtotal = r.nilai_dpp || r.total || r.qty*r.harga_satuan; return { service_id:service.data.id, nama_item:r.uraian || r.jenis_pekerjaan || 'Item Excel', kategori:itemCategory(r.jenis_pekerjaan || r.uraian), jumlah:r.qty > 0 ? r.qty : 1, satuan:r.satuan || 'pcs', harga_satuan:r.qty ? subtotal/r.qty : subtotal, subtotal, keterangan:r.keterangan || null } }); if (items.length) { const result = await supabase.from('service_item').insert(items); if (result.error) throw new Error(`Item histori ${first.nomor_polisi}: ${result.error.message}`); itemCount += items.length }
      const done = await supabase.from('service').update({ status:'SELESAI', selesai_at:new Date().toISOString() }).eq('id',service.data.id); if (done.error) throw new Error(`Service histori ${first.nomor_polisi} gagal ditutup: ${done.error.message}`)
      const reqDone = await supabase.from('permintaan_service').update({ status:'SELESAI' }).eq('id',request.data.id); if (reqDone.error) throw new Error(`Pengajuan histori ${first.nomor_polisi} gagal ditutup: ${reqDone.error.message}`)
      if (kilometer > Number(vehicle.kilometer_terakhir || 0)) kmUpdates.push({ kendaraan_id:vehicle.id, nomor_polisi:first.nomor_polisi, tanggal:first.tanggal, kilometer, keterangan:note })
      results.push(group); completed += 1; onProgress?.(completed, candidates.length)
    } catch (error) { failure = error; return }
  } }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(candidates.length,1)) }, () => worker())); if (failure) throw failure
  const maxKm = new Map(); kmUpdates.forEach(r => { const current=maxKm.get(r.kendaraan_id); if(!current || r.kilometer>current.kilometer) maxKm.set(r.kendaraan_id,r) })
  await Promise.all([...maxKm.values()].map(async r => { const result=await supabase.from('kendaraan').update({kilometer_terakhir:r.kilometer}).eq('id',r.kendaraan_id); if(result.error) throw new Error(`KM ${r.nomor_polisi} gagal diperbarui: ${result.error.message}`) }))
  return { sourceRows: rows.length, validRows: valid.length, transactions: groups.length, imported: results.length, skipped: groups.length - candidates.length, unknownPlates: unknown, items: itemCount, kmUpdated: maxKm.size }
}

export default function ServiceHistoryImportModalSafe({ profile, onDone, onClose }) {
  const inputRef = useRef(null); const [file,setFile]=useState(null); const [workbook,setWorkbook]=useState(null); const [loading,setLoading]=useState(false); const [saving,setSaving]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [progress,setProgress]=useState({completed:0,total:0}); const canImport=['ADMIN','TRANSPORT'].includes(profile?.role)
  const scan = async nextFile => { setFile(nextFile||null); setWorkbook(null); setError(''); setMessage(''); setProgress({completed:0,total:0}); if(!nextFile) return; if(!/\.xlsx$/i.test(nextFile.name)) return setError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.'); if(nextFile.size>MAX_FILE_SIZE) return setError('Ukuran file maksimal 25 MB.'); setLoading(true); try { const sheets=await parseXlsx(nextFile), chosen=chooseServiceSheet(sheets); if(!chosen || chosen.score<9) throw new Error('Sheet histori service tidak ditemukan. Gunakan Data Service/Rekapan Permintaan dengan No. Polisi dan Tanggal.'); const rawRows=chosen.sheet.rows.slice(chosen.header.index+1).filter(r=>r.values.some(v=>clean(v))), parsed=rawRows.map(r=>parseRow(r,chosen.header.row)), valid=parsed.filter(r=>r.nomor_polisi&&r.tanggal); setWorkbook({sheet:chosen.sheet,header:chosen.header,rawRows,valid,invalid:parsed.length-valid.length,transactions:groupRows(valid),uniquePlates:[...new Set(valid.map(r=>r.nomor_polisi))]}); setMessage(`Sheet “${chosen.sheet.name}” terdeteksi: ${parsed.length} baris sumber • ${valid.length} valid • ${groupRows(valid).length} transaksi service.`) } catch(e) { setError(e.message || 'File Excel tidak dapat dibaca.') } finally { setLoading(false) } }
  const start = async () => { if(!workbook || !canImport || saving) return; setSaving(true); setError(''); setProgress({completed:0,total:workbook.transactions.length}); try { const result=await importHistory(workbook.valid,profile,workbook.sheet.name,(done,total)=>{setProgress({completed:done,total});setMessage(`Memproses import: ${done}/${total} transaksi...`)}); setProgress({completed:workbook.transactions.length,total:workbook.transactions.length}); setMessage(`Import selesai: ${result.imported} transaksi baru • ${result.skipped} duplikat dilewati • ${result.items} item tercatat • ${result.kmUpdated} KM kendaraan diperbarui.`); if(result.unknownPlates.length) setError(`Plat belum ada di Master Kendaraan: ${result.unknownPlates.slice(0,20).join(', ')}${result.unknownPlates.length>20?' …':''}`); const report={context:'service',...result,validRows:workbook.valid.length,transactions:result.imported,fileName:file?.name||'',completedAt:new Date().toISOString()}; sessionStorage.setItem('transport_import_report',JSON.stringify(report)); onDone?.(report) } catch(e) { setError(e.message || 'Import histori service gagal.'); setMessage('Import berhenti karena terjadi error. Data yang sudah tersimpan tidak akan diulang pada import berikutnya.') } finally { setSaving(false) } }
  return <div className="dpt-overlay" role="dialog" aria-modal="true" aria-label="Import Histori Service"><section className="dpt-modal service-import-modal"><header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL SERVICE</span><h3>Histori Service & Perbaikan</h3><p>Data Service dibaca berdasarkan No. Polisi, Tanggal, Uraian, DPP, PPN, Total, KM, dan Bengkel.</p></div><button type="button" className="dpt-icon" onClick={onClose}>×</button></header>{error&&<div className="dpt-alert error">{error}</div>}{message&&<div className="dpt-alert success">{message}</div>}{saving&&progress.total>0&&<div className="dpt-progress" aria-live="polite"><div className="dpt-progress-bar"><span style={{width:`${Math.min(100,Math.round((progress.completed/progress.total)*100))}%`}}/></div><small>{progress.completed} dari {progress.total} transaksi selesai diproses.</small></div>}<div className="dpt-upload"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>scan(e.target.files?.[0])}/><button type="button" className="dpt-upload-button" onClick={()=>inputRef.current?.click()} disabled={loading||saving}>{loading?'Membaca Excel…':file?'Ganti File':'Pilih File Excel'}</button><div className="dpt-file-meta"><strong title={file?.name}>{file?.name || 'Belum ada file'}</strong><span>{file?`✓ .xlsx • ${(file.size/1024/1024).toFixed(2)} MB`:'Maksimal 25 MB'}</span></div></div>{workbook&&<><div className="service-import-stats"><div><b>{workbook.rawRows.length}</b><span>baris sumber</span></div><div><b>{workbook.valid.length}</b><span>baris valid</span></div><div><b>{workbook.transactions.length}</b><span>transaksi service</span></div><div><b>{workbook.uniquePlates.length}</b><span>kendaraan</span></div></div>{workbook.invalid>0&&<div className="service-import-warning">{workbook.invalid} baris tidak memiliki No. Polisi atau Tanggal lengkap dan tidak akan diimport.</div>}<div className="service-import-note"><b>Import aman</b><span>Item dengan kendaraan + tanggal + bengkel sama digabung menjadi satu transaksi.</span><span>Data Service tidak masuk ke Pengajuan Service aktif.</span><span>Plat yang belum ada di Master Kendaraan tidak dibuat otomatis.</span><span>KM yang lebih baru memperbarui Master Kendaraan.</span></div><div className="dpt-preview"><div className="dpt-sheet-title"><b>Preview Sumber: {workbook.sheet.name}</b><span>{workbook.rawRows.length} baris sumber</span></div><div className="dpt-preview-wrap"><table><thead><tr>{workbook.header.row.map((header,index)=><th key={`${header}-${index}`}>{header || `Kolom ${index+1}`}</th>)}</tr></thead><tbody>{workbook.rawRows.slice(0,150).map(row=><tr key={row.excelRow}>{workbook.header.row.map((header,index)=><td key={index}>{clean(row.values?.[index]) || '-'}</td>)}</tr>)}</tbody></table></div>{workbook.rawRows.length>150&&<small>Preview menampilkan 150 baris pertama. Seluruh baris tetap diproses saat import.</small>}</div></>}{workbook&&<div className="dpt-actions"><button type="button" className="dpt-button" onClick={onClose} disabled={saving}>Batal</button><button type="button" className="dpt-button primary" onClick={start} disabled={saving||!canImport}>{saving?`Mengimport ${progress.completed}/${progress.total}…`:'Import Histori Service'}</button></div>}</section></div>
}
