import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { filterDeletedExcelRows, setDeletedExcelRows } from '../utils/excelPreviewControls.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import './VehicleExcelImportModal.css'

const LABELS = {
  no: ['no', 'nomor', 'nomor_urut'], merk: ['merk', 'brand'], tipe: ['type', 'tipe'], jenis: ['jenis', 'jenis_kendaraan', 'jenis_unit'],
  tahun: ['tahun', 'tahun_kendaraan'], nomor_polisi: ['no_pol', 'no_polisi', 'nomor_polisi', 'plat', 'nomor_kendaraan'],
  nomor_mesin: ['no_mesin', 'nomor_mesin'], nomor_rangka: ['no_rangka', 'nomor_rangka'], pemilik: ['pemilik', 'nama_pemilik', 'pemilik_pic'],
  status: ['status', 'kepemilikan', 'status_kepemilikan', 'ownership'], masa_pajak: ['masa_berlaku_pajak', 'masa_pajak', 'jatuh_tempo_pajak', 'pajak_jatuh_tempo'],
  status_pajak: ['status_pajak'], unit_kerja: ['unit_kerja', 'pengunaan_unit', 'penggunaan_unit'], driver: ['driver', 'nama_driver', 'driver_pic'],
  lokasi: ['lokasi_kerja', 'lokasi', 'home_base', 'homebase'], keterangan: ['keterangan'], catatan_hutang: ['catatan_hutang'],
}
const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const upper = value => clean(value).toUpperCase()
const ownership = value => { const v = upper(value).replace(/\s+/g, '_'); if (v === 'ASET' || v === 'ASET_KANTOR') return 'ASET'; if (/^(SEWA|RENTAL|KENDARAAN_SEWA)$/.test(v)) return 'SEWA'; return '' }
const dateValue = value => {
  const v = clean(value); if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(v)) { const [d, m, y] = v.split(/[-/]/); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  const serial = Number(v); if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  const date = new Date(v); return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
const numberValue = value => { const v = clean(value); if (!v) return null; const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }
const aliases = new Set(Object.values(LABELS).flat())

function findHeader(sheet) {
  let best = { index: -1, values: [], score: 0 }
  sheet.rows.slice(0, 80).forEach((row, index) => {
    const score = row.values.map(normalize).reduce((total, cell) => total + (aliases.has(cell) ? 1 : 0), 0)
    if (score > best.score) best = { index, values: row.values, score }
  })
  if (best.index < 0 || best.score < 8) return null
  return best
}

function valueOf(row, headers, key) {
  const index = headers.findIndex(header => LABELS[key]?.includes(normalize(header)))
  return index >= 0 ? clean(row.values[index]) : ''
}

function parseVehicleSheet(sheet) {
  const header = findHeader(sheet); if (!header) return null
  return sheet.rows.slice(header.index + 1).map(row => {
    const rawStatus = valueOf(row, header.values, 'status')
    return {
      excelRow: row.excelRow,
      no: valueOf(row, header.values, 'no'), merk: valueOf(row, header.values, 'merk'), tipe: valueOf(row, header.values, 'tipe'), jenis: valueOf(row, header.values, 'jenis'),
      tahun: valueOf(row, header.values, 'tahun'), nomor_polisi: upper(valueOf(row, header.values, 'nomor_polisi')), nomor_mesin: valueOf(row, header.values, 'nomor_mesin'),
      nomor_rangka: valueOf(row, header.values, 'nomor_rangka'), pemilik: valueOf(row, header.values, 'pemilik'), kepemilikan: ownership(rawStatus), rawStatus,
      masa_berlaku_pajak: dateValue(valueOf(row, header.values, 'masa_pajak')), status_pajak: valueOf(row, header.values, 'status_pajak'), unit_kerja: valueOf(row, header.values, 'unit_kerja'),
      driver: valueOf(row, header.values, 'driver'), lokasi: valueOf(row, header.values, 'lokasi'), keterangan: valueOf(row, header.values, 'keterangan'), catatan_hutang: valueOf(row, header.values, 'catatan_hutang'),
    }
  }).filter(row => Object.values(row).some(value => clean(value)))
}

function mergeDuplicates(rows) {
  const groups = new Map()
  rows.forEach(row => { if (!groups.has(row.nomor_polisi)) groups.set(row.nomor_polisi, []); groups.get(row.nomor_polisi).push(row) })
  return [...groups.values()].map(group => {
    const base = { ...group[0] }
    group.slice(1).forEach(row => Object.keys(base).forEach(key => { if (!clean(base[key]) && clean(row[key])) base[key] = row[key] }))
    base.catatan_hutang = [...new Set(group.map(row => clean(row.catatan_hutang)).filter(Boolean))].join(' | ')
    base.keterangan = [...new Set(group.map(row => clean(row.keterangan)).filter(Boolean))].join(' | ')
    base.sourceRows = group.map(row => row.excelRow)
    return base
  })
}

export default function VehicleExcelImportFinal({ profile, onDone, onClose }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [press, setPress] = useState(null)
  const canImport = ['ADMIN', 'TRANSPORT'].includes(profile?.role)

  const activeRows = useMemo(() => filterDeletedExcelRows('kendaraan', rows), [rows])
  const filteredRows = useMemo(() => {
    const needle = clean(search).toLowerCase(); if (!needle) return activeRows
    return activeRows.filter(row => Object.values(row).some(value => clean(value).toLowerCase().includes(needle)))
  }, [activeRows, search])

  const analyze = async nextFile => {
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) { setError('File harus berformat .xlsx.'); return }
    if (nextFile.size > 25 * 1024 * 1024) { setError('Ukuran file maksimal 25 MB.'); return }
    setLoading(true); setError('')
    try {
      const sheets = await parseXlsx(nextFile)
      const parsed = sheets.map(parseVehicleSheet).find(Boolean)
      if (!parsed?.length) throw new Error('Sheet Data Kendaraan tidak ditemukan atau format header tidak sesuai Excel sumber.')
      setFile(nextFile); setRows(parsed); setSelected([]); setSelectionMode(false)
    } catch (parseError) {
      setError(parseError.message || 'File Excel tidak dapat dibaca.')
    } finally { setLoading(false) }
  }

  const startPress = (event, id) => {
    if (selectionMode || event.target.closest?.('button,input,select,textarea')) return
    const timer = window.setTimeout(() => { setSelectionMode(true); setSelected(current => current.includes(id) ? current : [...current, id]); setPress(null) }, 480)
    setPress({ timer, x: event.clientX, y: event.clientY })
  }
  const movePress = event => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) { window.clearTimeout(press.timer); setPress(null) } }
  const endPress = () => { if (press?.timer) window.clearTimeout(press.timer); setPress(null) }
  const toggleSelected = excelRow => setSelected(current => current.includes(excelRow) ? current.filter(id => id !== excelRow) : [...current, excelRow])
  const allSelected = filteredRows.length > 0 && filteredRows.every(row => selected.includes(row.excelRow))
  const toggleAll = () => setSelected(current => allSelected ? current.filter(id => !filteredRows.some(row => row.excelRow === id)) : [...new Set([...current, ...filteredRows.map(row => row.excelRow)])])
  const removeSelectedFromImport = () => {
    const deleted = new Set(selected)
    setDeletedExcelRows('kendaraan', [...new Set([...filterDeletedExcelRows('kendaraan', rows).filter(row => deleted.has(row.excelRow)).map(row => row.excelRow), ...selected])])
    setSelected([]); setSelectionMode(false)
    setRows(current => current.map(row => ({ ...row })))
  }
  const resetDeleted = () => { setDeletedExcelRows('kendaraan', []); setRows(current => current.map(row => ({ ...row }))) }

  const importRows = async () => {
    if (!canImport || saving) return
    const valid = activeRows.filter(row => row.nomor_polisi && row.merk)
    if (!valid.length) { setError('Tidak ada baris valid untuk diimport.'); return }
    const invalid = valid.filter(row => !['ASET', 'SEWA'].includes(row.kepemilikan))
    if (invalid.length) { setError(`Ada ${invalid.length} baris dengan Status bukan Aset/Sewa. Periksa baris Excel: ${invalid.map(row => row.excelRow).join(', ')}.`); return }
    setSaving(true); setError('')
    try {
      const merged = mergeDuplicates(valid)
      const [existingResult, driverResult] = await Promise.all([
        supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,jenis_kendaraan,tahun,nomor_rangka,nomor_mesin,kepemilikan,jenis_sewa,pemilik,driver_id,lokasi,unit_kerja,kilometer_terakhir,status,kondisi,keterangan,masa_berlaku_pajak,status_pajak,catatan_hutang'),
        supabase.from('driver').select('id,nama_lengkap,lokasi,status,keterangan'),
      ])
      if (existingResult.error) throw existingResult.error
      if (driverResult.error) throw driverResult.error
      const existing = Object.fromEntries((existingResult.data || []).map(item => [upper(item.nomor_polisi), item]))
      const drivers = Object.fromEntries((driverResult.data || []).map(item => [upper(item.nama_lengkap), item]))
      const codes = new Set((existingResult.data || []).map(item => upper(item.kode_kendaraan)).filter(Boolean))
      let added = 0, updated = 0, driversCreated = 0
      for (const row of merged) {
        let driverId = null
        if (row.driver) driverId = drivers[upper(row.driver)]?.id || null
        if (row.driver && !driverId && !['DRIVER', 'STANDBY', '-', 'N/A', 'NA', 'NONE', 'TIDAK ADA', 'TIDAK ADA DRIVER'].includes(upper(row.driver))) {
          const created = await supabase.from('driver').insert({ nama_lengkap: row.driver, lokasi: row.lokasi || null, status: 'AKTIF', keterangan: 'Dibuat dari import Excel Kendaraan.' }).select('id,nama_lengkap,lokasi,status,keterangan').single()
          if (created.error) throw new Error(`Driver ${row.driver}: ${created.error.message}`)
          driverId = created.data.id; drivers[upper(row.driver)] = created.data; driversCreated += 1
        }
        const current = existing[row.nomor_polisi]
        let code = upper(current?.kode_kendaraan || `KND-${row.nomor_polisi.replace(/[^A-Z0-9]+/g, '')}`)
        while (!current && codes.has(code)) code = `${code}-1`
        codes.add(code)
        const payload = {
          kode_kendaraan: code, nomor_polisi: row.nomor_polisi, merk: row.merk || current?.merk || null, tipe: row.tipe || current?.tipe || null,
          jenis_kendaraan: row.jenis || current?.jenis_kendaraan || null, tahun: numberValue(row.tahun) ?? current?.tahun ?? null,
          nomor_rangka: row.nomor_rangka || current?.nomor_rangka || null, nomor_mesin: row.nomor_mesin || current?.nomor_mesin || null,
          kepemilikan: row.kepemilikan, jenis_sewa: row.kepemilikan === 'SEWA' ? (current?.jenis_sewa || null) : null, pemilik: row.pemilik || current?.pemilik || null,
          driver_id: driverId ?? current?.driver_id ?? null, lokasi: row.lokasi || current?.lokasi || null, unit_kerja: row.unit_kerja || current?.unit_kerja || null,
          kilometer_terakhir: current?.kilometer_terakhir ?? 0, status: current?.status || 'ACTIVE', kondisi: current?.kondisi || null,
          keterangan: row.keterangan || current?.keterangan || null, masa_berlaku_pajak: row.masa_berlaku_pajak || current?.masa_berlaku_pajak || null,
          status_pajak: row.status_pajak || current?.status_pajak || null, catatan_hutang: row.catatan_hutang || current?.catatan_hutang || null,
        }
        const result = current ? await supabase.from('kendaraan').update(payload).eq('id', current.id) : await supabase.from('kendaraan').insert(payload).select('id').single()
        if (result.error) throw new Error(`${row.nomor_polisi} (baris ${row.excelRow}): ${result.error.message}`)
        if (current) updated += 1; else added += 1
      }
      const report = { context: 'kendaraan', sourceRows: valid.length, validRows: valid.length, uniqueVehicles: merged.length, mergedDuplicates: valid.length - merged.length, added, updated, driversCreated, message: `${added} baru, ${updated} diperbarui.` }
      sessionStorage.setItem('transport_import_report', JSON.stringify(report))
      onDone?.(report)
    } catch (importError) {
      setError(importError.message || 'Import kendaraan gagal.')
    } finally { setSaving(false) }
  }

  return <div className="dpt-overlay"><section className="dpt-modal vehicle-import-modal">
    <header className="dpt-modal-head"><div><span className="eyebrow">IMPORT EXCEL</span><h3>Data Kendaraan</h3><p>Struktur mengikuti Data Kendaraan Excel. Status hanya Aset atau Sewa.</p></div><button className="dpt-icon" type="button" onClick={onClose}>×</button></header>
    {error && <div className="dpt-alert error">{error}</div>}
    <div className="dpt-actions"><input ref={fileRef} type="file" accept=".xlsx" hidden onChange={event => analyze(event.target.files?.[0])} /><button className="dpt-button secondary" type="button" onClick={() => fileRef.current?.click()} disabled={loading}>{loading ? 'Membaca...' : file ? file.name : 'Pilih file Excel'}</button><button className="dpt-button" type="button" onClick={resetDeleted}>Pulihkan baris dihapus</button><button className="dpt-button primary" type="button" onClick={importRows} disabled={!rows.length || saving}>{saving ? 'Mengimport...' : 'Import ke Sistem'}</button></div>
    {rows.length > 0 && <><div className="dpt-preview-toolbar"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari No. Pol, merk, pemilik..." />{selectionMode ? <><b>{selected.length} dipilih</b><button className="dpt-button" type="button" onClick={toggleAll}>{allSelected ? 'Batal semua' : 'Pilih semua'}</button><button className="dpt-button danger" type="button" disabled={!selected.length} onClick={removeSelectedFromImport}>Hapus dari import</button><button className="dpt-button" type="button" onClick={() => { setSelected([]); setSelectionMode(false) }}>Batal pilih</button></> : <span className="dpt-preview-note">Tekan & tahan baris untuk memilih.</span>}</div>
      <div className="dpt-preview"><div className="dpt-table-wrap"><table><thead><tr>{selectionMode && <th>Pilih</th>}<th>No</th><th>Merk</th><th>Type</th><th>Jenis</th><th>Tahun</th><th>No. Pol</th><th>No. Mesin</th><th>No. Rangka</th><th>Pemilik</th><th>Status</th><th>Masa Berlaku Pajak</th><th>Status Pajak</th><th>Unit Kerja</th><th>Driver</th><th>Lokasi Kerja</th><th>Keterangan</th><th>Catatan Hutang</th></tr></thead><tbody>{filteredRows.map(row => { const picked = selected.includes(row.excelRow); return <tr key={row.excelRow} className={picked ? 'selected' : ''} onMouseDown={event => startPress(event, row.excelRow)} onMouseMove={movePress} onMouseUp={endPress} onMouseLeave={endPress} onTouchStart={event => startPress(event, row.excelRow)} onTouchMove={movePress} onTouchEnd={endPress}>{selectionMode && <td><input type="checkbox" checked={picked} onChange={() => toggleSelected(row.excelRow)} /></td>}<td>{row.no || row.excelRow}</td><td>{row.merk || '-'}</td><td>{row.tipe || '-'}</td><td>{row.jenis || '-'}</td><td>{row.tahun || '-'}</td><td>{row.nomor_polisi || '-'}</td><td>{row.nomor_mesin || '-'}</td><td>{row.nomor_rangka || '-'}</td><td>{row.pemilik || '-'}</td><td>{row.kepemilikan === 'ASET' ? 'Aset' : row.kepemilikan === 'SEWA' ? 'Sewa' : row.rawStatus || 'Tidak valid'}</td><td>{row.masa_berlaku_pajak || '-'}</td><td>{row.status_pajak || '-'}</td><td>{row.unit_kerja || '-'}</td><td>{row.driver || '-'}</td><td>{row.lokasi || '-'}</td><td>{row.keterangan || '-'}</td><td>{row.catatan_hutang || '-'}</td></tr> })}</tbody></table></div></div></>}
  </section></div>
}
