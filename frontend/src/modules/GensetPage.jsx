import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageBreadcrumb from './PageBreadcrumb.jsx'
import { normalizeGensetInput, validateGensetInput } from '../utils/gensetData.js'
import './TransportOperationsFixed.css'
import './GensetPage.css'

const emptyForm = { source_no: '', merk: '', kapasitas_kva: '20', engine_no: '', generator_no: '', lokasi_kerja: '', pemilik: '', status_kepemilikan: 'ASET', keterangan: '' }
const display = value => value == null || String(value).trim() === '' ? '—' : String(value)

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
    <div className="x-head"><div><span className="eyebrow">DATA ASET & SEWA</span><h2>Data Genset</h2><p>Daftar genset berdasarkan sumber Excel Data Genset, termasuk aset perusahaan dan genset sewa.</p></div>{canManage && <button type="button" className="x-btn primary" onClick={beginNew}>+ Tambah Genset</button>}</div>
    <div className="genset-kpis">
      <div className="genset-kpi"><span>Total Genset</span><strong>{rows.length}</strong></div>
      <div className="genset-kpi"><span>Aset</span><strong>{rows.filter(row => row.status_kepemilikan === 'ASET').length}</strong></div>
      <div className="genset-kpi"><span>Sewa</span><strong>{rows.filter(row => row.status_kepemilikan === 'SEWA').length}</strong></div>
    </div>
    {error && <div className="x-alert error" role="alert">{error}</div>}
    {success && <div className="x-alert" role="status">{success}</div>}
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
