import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageBreadcrumb from './PageBreadcrumb.jsx'
import { normalizeGensetInput, validateGensetInput } from '../utils/gensetData.js'
import { parseXlsx } from '../utils/xlsxParser.js'
import { parseGensetImportSheet } from '../utils/gensetExcelImport.js'
import './TransportOperationsFixed.css'
import './GensetPage.css'

const emptyForm = { source_no: '', merk: '', kapasitas_kva: '20', engine_no: '', generator_no: '', lokasi_kerja: '', pemilik: '', status_kepemilikan: 'ASET', keterangan: '' }
const display = value => value == null || String(value).trim() === '' ? '—' : String(value)
const normalizeSheetName = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const GENSET_VALUE_FIELDS = ['merk', 'engine_no', 'generator_no', 'lokasi_kerja', 'pemilik', 'status_kepemilikan', 'keterangan']
const sameGensetBusinessValues = (left, right) => Number(left?.kapasitas_kva) === Number(right?.kapasitas_kva)
  && GENSET_VALUE_FIELDS.every(field => String(left?.[field] ?? '').trim() === String(right?.[field] ?? '').trim())

export default function GensetPage({ profile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState('SEMUA')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const importInputRef = useRef(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const canManage = ['ADMIN', 'TRANSPORT'].includes(profile?.role)
  const canDelete = profile?.role === 'ADMIN'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.from('genset').select('*').order('source_no', { ascending: true })
    if (loadError) {
      setError(loadError.message || 'Data Genset gagal dimuat.')
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const scanGensetFile = async nextFile => {
    setImportPreview(null)
    setImportError('')
    setImportSuccess('')
    if (!nextFile) return
    if (!/\\.xlsx$/i.test(nextFile.name)) {
      setImportError('Gunakan file Excel .xlsx. Format .xls lama belum didukung.')
      return
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      setImportError('Ukuran file maksimal 25 MB.')
      return
    }

    setImportLoading(true)
    try {
      const sheets = await parseXlsx(nextFile)
      const sourceSheet = sheets.find(sheet => normalizeSheetName(sheet.name) === 'data_genset')
      if (!sourceSheet) throw new Error('Sheet “Data Genset” tidak ditemukan. Pilih file Data Kendaraan yang memuat sheet tersebut.')
      const parsed = parseGensetImportSheet(sourceSheet)
      setImportPreview({ ...parsed, fileName: nextFile.name, fileSize: nextFile.size })
      if (!parsed.rows.length) {
        setImportError(parsed.errors[0] || 'Tidak ada data Genset pada sheet sumber.')
      }
    } catch (scanError) {
      setImportError(scanError?.message || 'File Excel Genset gagal dibaca.')
    } finally {
      setImportLoading(false)
    }
  }

  const importComparison = useMemo(() => {
    if (!importPreview) return { newCount: 0, changedCount: 0, unchangedCount: 0, validCount: 0 }
    const existingByNo = new Map(rows.map(row => [Number(row.source_no), row]))
    let newCount = 0
    let changedCount = 0
    let unchangedCount = 0
    const validCount = importPreview.rows.filter(row => row.source_errors.length === 0).length
    for (const row of importPreview.rows) {
      const existing = existingByNo.get(Number(row.source_no))
      if (!existing) newCount += 1
      else if (sameGensetBusinessValues(row, existing)) unchangedCount += 1
      else changedCount += 1
    }
    return { newCount, changedCount, unchangedCount, validCount }
  }, [rows, importPreview])

  const importGensetRows = async () => {
    if (!importPreview || importPreview.errors.length || !importPreview.rows.length || importSaving || !canManage) return
    setImportSaving(true)
    setImportError('')
    setImportSuccess('')
    try {
      const now = new Date().toISOString()
      const payload = importPreview.rows.map(row => ({
        source_no: row.source_no,
        merk: row.merk,
        kapasitas_kva: row.kapasitas_kva,
        engine_no: row.engine_no,
        generator_no: row.generator_no,
        lokasi_kerja: row.lokasi_kerja,
        pemilik: row.pemilik,
        status_kepemilikan: row.status_kepemilikan,
        keterangan: row.keterangan,
        source_file: importPreview.fileName,
        source_sheet: importPreview.sheetName,
        source_row: row.source_row,
        updated_at: now,
      }))
      const { error: saveError } = await supabase
        .from('genset')
        .upsert(payload, { onConflict: 'source_no' })
      if (saveError) throw saveError

      setImportSuccess(
        `Impor Genset selesai: ${payload.length} baris diproses • ${importComparison.newCount} No. sumber baru • ${importComparison.changedCount} data berbeda dari master • ${importComparison.unchangedCount} data lainnya cocok. Tidak ada baris tidak valid yang diimpor.`,
      )
      setImportPreview(null)
      if (importInputRef.current) importInputRef.current.value = ''
      await load()
    } catch (saveError) {
      setImportError(saveError?.message || 'Impor Genset gagal disimpan. Tidak ada status sukses yang ditampilkan.')
    } finally {
      setImportSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')
    return rows.filter(row => {
      if (ownershipFilter !== 'SEMUA' && row.status_kepemilikan !== ownershipFilter) return false
      if (!query) return true
      return [row.merk, row.lokasi_kerja, row.pemilik, row.engine_no, row.generator_no, row.status_kepemilikan, row.keterangan]
        .some(value => String(value ?? '').toLocaleLowerCase('id-ID').includes(query))
    })
  }, [rows, search, ownershipFilter])

  const beginNew = () => {
    const nextNo = Math.max(0, ...rows.map(row => Number(row.source_no) || 0)) + 1
    setEditing(null)
    setForm({ ...emptyForm, source_no: String(nextNo) })
    setError('')
    setSuccess('')
  }
  const beginEdit = row => {
    setEditing(row)
    setForm({
      source_no: String(row.source_no ?? ''),
      merk: row.merk ?? '',
      kapasitas_kva: String(row.kapasitas_kva ?? ''),
      engine_no: row.engine_no ?? '',
      generator_no: row.generator_no ?? '',
      lokasi_kerja: row.lokasi_kerja ?? '',
      pemilik: row.pemilik ?? '',
      status_kepemilikan: row.status_kepemilikan ?? 'ASET',
      keterangan: row.keterangan ?? '',
    })
    setError('')
    setSuccess('')
  }
  const cancelEdit = () => { setEditing(null); setForm(emptyForm); setError(''); setSuccess('') }

  const save = async event => {
    event.preventDefault()
    setError('')
    setSuccess('')
    const validation = validateGensetInput(form)
    if (validation) { setError(validation); return }
    setSaving(true)
    try {
      const payload = {
        ...normalizeGensetInput(form),
        source_file: editing?.source_file || 'Input Sistem',
        source_sheet: editing?.source_sheet || 'Data Genset',
        source_row: editing?.source_row ?? null,
        updated_at: new Date().toISOString(),
      }
      const result = editing
        ? await supabase.from('genset').update(payload).eq('id', editing.id).select('*').single()
        : await supabase.from('genset').insert(payload).select('*').single()
      if (result.error) throw result.error
      setSuccess(editing ? 'Data Genset berhasil diperbarui.' : 'Data Genset berhasil ditambahkan.')
      setEditing(null)
      setForm(emptyForm)
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Perubahan Data Genset gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async row => {
    if (!canDelete || !window.confirm(`Hapus data genset “${row.merk}” No. Excel ${row.source_no}? Data ini tidak dapat dipulihkan.`)) return
    setError('')
    setSuccess('')
    try {
      const { error: deleteError } = await supabase.from('genset').delete().eq('id', row.id)
      if (deleteError) throw deleteError
      setSuccess('Data Genset berhasil dihapus.')
      if (editing?.id === row.id) cancelEdit()
      await load()
    } catch (deleteError) {
      setError(deleteError?.message || 'Data Genset gagal dihapus.')
    }
  }

  return <div className="genset-page">
    <PageBreadcrumb items={['Transport', 'Data Genset']} />
    <div className="x-head"><div><span className="eyebrow">DATA ASET & SEWA</span><h2>Data Genset</h2><p>Daftar genset berdasarkan sumber Excel Data Genset, termasuk aset perusahaan dan genset sewa.</p></div>{canManage && <div className="genset-head-actions"><input ref={importInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={importLoading || importSaving} onChange={event => { const selected = event.target.files?.[0]; scanGensetFile(selected) }}/><button type="button" className="x-btn secondary" onClick={() => importInputRef.current?.click()} disabled={importLoading || importSaving}>{importLoading ? 'Membaca Excel…' : 'Import Excel'}</button><button type="button" className="x-btn primary" onClick={beginNew} disabled={importLoading || importSaving}>+ Tambah Genset</button></div>}</div>
    <div className="genset-kpis">
      <div className="genset-kpi"><span>Total Genset</span><strong>{rows.length}</strong></div>
      <div className="genset-kpi"><span>Aset</span><strong>{rows.filter(row => row.status_kepemilikan === 'ASET').length}</strong></div>
      <div className="genset-kpi"><span>Sewa</span><strong>{rows.filter(row => row.status_kepemilikan === 'SEWA').length}</strong></div>
    </div>
    {error && <div className="x-alert error" role="alert">{error}</div>}
    {success && <div className="x-alert" role="status">{success}</div>}
    {importError && <div className="x-alert error" role="alert">{importError}</div>}
    {importSuccess && <div className="x-alert" role="status">{importSuccess}</div>}
    {importPreview && <section className="x-card genset-import-preview">
      <div className="x-card-title"><h3>Preview Import Excel — Data Genset</h3><button type="button" className="x-btn secondary" onClick={() => { setImportPreview(null); setImportError(''); if (importInputRef.current) importInputRef.current.value = '' }} disabled={importSaving}>Tutup Preview</button></div>
      <p><b>File:</b> {importPreview.fileName} · <b>Sheet:</b> {importPreview.sheetName} · <b>Header Excel:</b> baris {importPreview.headerRow ?? 'tidak ditemukan'}</p>
      <div className="genset-kpis">
        <div className="genset-kpi"><span>Baris sumber</span><strong>{importPreview.dataRows.length}</strong></div>
        <div className="genset-kpi"><span>Baris valid</span><strong>{importComparison.validCount}</strong></div>
        <div className="genset-kpi"><span>No. baru</span><strong>{importComparison.newCount}</strong></div>
        <div className="genset-kpi"><span>Data berbeda</span><strong>{importComparison.changedCount}</strong></div>
      </div>
      {importPreview.errors.length > 0 && <div className="x-alert error" role="alert"><b>Import ditahan: {importPreview.errors.length} masalah ditemukan. Tidak ada baris yang akan disimpan.</b><ul>{importPreview.errors.slice(0, 12).map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>{importPreview.errors.length > 12 && <p>Dan {importPreview.errors.length - 12} masalah lainnya.</p>}</div>}
      {importPreview.rows.length > 0 && <div className="x-table-wrap"><table className="x-table"><thead><tr><th>No.</th><th>Baris Excel</th><th>Merk</th><th>KVA</th><th>No. Mesin</th><th>No. Generator</th><th>Lokasi</th><th>Pemilik</th><th>Status</th><th>Keterangan / Validasi</th></tr></thead><tbody>{importPreview.rows.map((row, index) => <tr key={`${row.source_row ?? index}-${row.source_no}`}><td>{display(row.source_no_raw)}</td><td>{display(row.source_row)}</td><td>{display(row.merk)}</td><td>{display(row.kapasitas_kva)}</td><td>{display(row.engine_no)}</td><td>{display(row.generator_no)}</td><td>{display(row.lokasi_kerja)}</td><td>{display(row.pemilik)}</td><td>{display(row.status_kepemilikan || row.status_kepemilikan_raw)}</td><td>{row.source_errors.length ? row.source_errors.join(' ') : display(row.keterangan)}</td></tr>)}</tbody></table></div>}
      <div className="genset-form-actions"><button type="button" className="x-btn secondary" onClick={() => { setImportPreview(null); setImportError(''); if (importInputRef.current) importInputRef.current.value = '' }} disabled={importSaving}>Batal</button><button type="button" className="x-btn primary" onClick={importGensetRows} disabled={!importPreview.rows.length || importPreview.errors.length > 0 || importSaving || importLoading || !canManage}>{importSaving ? 'Menyimpan…' : importPreview.errors.length ? 'Import Ditahan: Perbaiki Excel' : `Import ${importPreview.rows.length} Baris Genset`}</button></div>
    </section>}
    {editing !== null || form.source_no ? <section className="x-card genset-form-card"><div className="x-card-title"><h3>{editing ? 'Edit Data Genset' : 'Tambah Genset'}</h3><button type="button" className="x-btn secondary" onClick={cancelEdit} disabled={saving}>Batal</button></div>
      <form className="x-grid" onSubmit={save}>
        <label>No. Excel / No. Data<input value={form.source_no} onChange={e => setForm(current => ({ ...current, source_no: e.target.value }))} type="number" min="1" step="1" required disabled={Boolean(editing) || saving}/></label>
        <label>Merk<input value={form.merk} onChange={e => setForm(current => ({ ...current, merk: e.target.value }))} maxLength={120} required disabled={saving}/></label>
        <label>Kapasitas (KVA)<input value={form.kapasitas_kva} onChange={e => setForm(current => ({ ...current, kapasitas_kva: e.target.value }))} type="number" min="0.1" step="0.1" required disabled={saving}/></label>
        <label>No. Mesin<input value={form.engine_no} onChange={e => setForm(current => ({ ...current, engine_no: e.target.value }))} maxLength={120} disabled={saving}/></label>
        <label>No. Generator<input value={form.generator_no} onChange={e => setForm(current => ({ ...current, generator_no: e.target.value }))} maxLength={120} disabled={saving}/></label>
        <label>Lokasi Kerja<input value={form.lokasi_kerja} onChange={e => setForm(current => ({ ...current, lokasi_kerja: e.target.value }))} maxLength={160} disabled={saving}/></label>
        <label>Pemilik<input value={form.pemilik} onChange={e => setForm(current => ({ ...current, pemilik: e.target.value }))} maxLength={160} disabled={saving}/></label>
        <label>Status Kepemilikan<select value={form.status_kepemilikan} onChange={e => setForm(current => ({ ...current, status_kepemilikan: e.target.value }))} required disabled={saving}><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select></label>
        <label className="genset-note-field">Keterangan<textarea value={form.keterangan} onChange={e => setForm(current => ({ ...current, keterangan: e.target.value }))} maxLength={2000} disabled={saving}/></label>
        <div className="genset-form-actions"><button type="submit" className="x-btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Data'}</button><button type="button" className="x-btn secondary" onClick={cancelEdit} disabled={saving}>Batal</button></div>
      </form>
    </section> : null}
    <section className="x-card">
      <div className="x-card-title"><h3>Daftar Genset</h3><span>{filteredRows.length} dari {rows.length} data</span></div>
      <div className="x-toolbar-inline"><input aria-label="Cari data genset" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari merk, lokasi, pemilik, nomor mesin…" /><select aria-label="Filter kepemilikan" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)}><option value="SEMUA">Semua kepemilikan</option><option value="ASET">Aset</option><option value="SEWA">Sewa</option></select><button type="button" className="x-btn secondary" onClick={load} disabled={loading}>Muat ulang</button></div>
      {loading ? <div className="x-empty">Memuat data Genset…</div> : filteredRows.length === 0 ? <div className="x-empty">Tidak ada data Genset yang cocok.</div> : <div className="x-table-wrap"><table className="x-table" data-no-row-marks="false"><thead><tr><th>No.</th><th>Merk</th><th>Kapasitas</th><th>Engine No.</th><th>Generator No.</th><th>Lokasi Kerja</th><th>Pemilik</th><th>Kepemilikan</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id}><td>{row.source_no ?? '—'}</td><td><b>{row.merk}</b><small className="genset-source">{display(row.source_file)}{row.source_row ? ` · Baris Excel ${row.source_row}` : ''}</small></td><td>{row.kapasitas_kva} KVA</td><td>{display(row.engine_no)}</td><td>{display(row.generator_no)}</td><td>{display(row.lokasi_kerja)}</td><td>{display(row.pemilik)}</td><td><span className={`genset-status ${row.status_kepemilikan === 'ASET' ? 'asset' : 'rental'}`}>{row.status_kepemilikan === 'ASET' ? 'Aset' : 'Sewa'}</span></td><td>{display(row.keterangan)}</td><td className="genset-row-actions">{canManage && <button type="button" className="x-btn secondary" onClick={() => beginEdit(row)}>Edit</button>}{canDelete && <button type="button" className="x-btn danger" onClick={() => remove(row)}>Hapus</button>}{!canManage && '—'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>
}
