from pathlib import Path
import re

ROOT = Path('.')
changes = []

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')
    if path not in changes:
        changes.append(path)

def replace_once(path, old, new, required=False):
    text = read(path)
    if new in text:
        return text
    if old not in text:
        if required:
            raise SystemExit(f'Anchor not found: {path}')
        return text
    text = text.replace(old, new, 1)
    write(path, text)
    return text

def regex_once(path, pattern, replacement, required=True):
    text = read(path)
    text2, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count:
        write(path, text2)
        return text2
    if required:
        raise SystemExit(f'Regex anchor not found: {path}')
    return text

# Pengajuan import: preserve all source columns and paginate all source rows.
p = 'frontend/src/modules/PengajuanExcelImportModal.jsx'
replace_once(p, "import { parseXlsx } from '../utils/xlsxParser.js'", "import { parseXlsx } from '../utils/xlsxParser.js'\nimport { encodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
replace_once(p, "const MAX_FILE_SIZE = 25 * 1024 * 1024", "const MAX_FILE_SIZE = 25 * 1024 * 1024\nconst fmtNum = value => value === null || value === undefined || value === '' ? '-' : new Intl.NumberFormat('id-ID').format(Number(value))\nconst PAGE_OPTIONS = [25, 50, 100]", required=True)
replace_once(p, "  kilometer: ['km', 'kilometer', 'kilometer_pengajuan'],\n}", "  kilometer: ['km', 'kilometer', 'kilometer_pengajuan'],\n  source_no: ['no', 'nomor', 'nomor_urut'],\n  homebase: ['homebase', 'home_base'],\n  unit_kendaraan: ['unit_kendaraan', 'unit kendaraan'],\n  merk_excel: ['merk', 'merek'],\n  type_excel: ['type', 'tipe'],\n  biaya: ['biaya_rp', 'biaya', 'nilai_biaya'],\n}", required=True)
replace_once(p, "  const [rows, setRows] = useState([])\n\n  const canImport", "  const [rows, setRows] = useState([])\n  const [page, setPage] = useState(1)\n  const [pageSize, setPageSize] = useState(50)\n\n  const canImport", required=True)
replace_once(p, "  const previewRows = useMemo(() => rows.slice(0, 100), [rows])", "  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))\n  const safePage = Math.min(page, pageCount)\n  const previewRows = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize])", required=True)
replace_once(p, "setFile(nextFile || null); setSelected(null); setRows([]); setVehicles([]); setError(''); setMessage('')", "setFile(nextFile || null); setSelected(null); setRows([]); setVehicles([]); setError(''); setMessage(''); setPage(1)", required=True)
replace_once(p,
"        excelRow: row.excelRow,\n        nomor_polisi: upper(valueOf(row, headers, 'nomor_polisi')),\n        tanggal: excelDate(valueOf(row, headers, 'tanggal')),\n        keluhan: valueOf(row, headers, 'keluhan'),\n        jenis: upper(valueOf(row, headers, 'jenis') || 'SERVICE'),\n        prioritas: upper(valueOf(row, headers, 'prioritas') || 'NORMAL'),\n        kilometer: numberValue(valueOf(row, headers, 'kilometer')),\n",
"        excelRow: row.excelRow,\n        source_no: valueOf(row, headers, 'source_no'),\n        homebase: valueOf(row, headers, 'homebase'),\n        unit_kendaraan: valueOf(row, headers, 'unit_kendaraan'),\n        merk_excel: valueOf(row, headers, 'merk_excel'),\n        type_excel: valueOf(row, headers, 'type_excel'),\n        biaya: numberValue(valueOf(row, headers, 'biaya')),\n        nomor_polisi: upper(valueOf(row, headers, 'nomor_polisi')),\n        tanggal: excelDate(valueOf(row, headers, 'tanggal')),\n        keluhan: valueOf(row, headers, 'keluhan'),\n        jenis: upper(valueOf(row, headers, 'jenis') || 'SERVICE'),\n        prioritas: upper(valueOf(row, headers, 'prioritas') || 'NORMAL'),\n        kilometer: numberValue(valueOf(row, headers, 'kilometer')),\n", required=True)
replace_once(p, "          status: 'MENUNGGU_TRANSPORT',\n        }))", "          status: 'MENUNGGU_TRANSPORT',\n          catatan_transport: encodeExcelMeta({ source: 'REKAPAN_PERMINTAAN', source_no: x.source_no, homebase: x.homebase, unit_kendaraan: x.unit_kendaraan, merk: x.merk_excel, type: x.type_excel, biaya: x.biaya }),\n        }))", required=True)
old_table = '<div className="dpt-preview"><div className="dpt-sheet-title"><div><b>Preview Data</b><span className="dpt-preview-note">Tabel sumber dibaca tanpa mengubah Excel asli.</span></div><span>{previewRows.length} baris ditampilkan</span></div><div className="dpt-preview-wrap"><table><thead><tr><th>Baris</th><th>No Polisi</th><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>KM</th></tr></thead><tbody>{previewRows.map((row) => <tr data-excel-row={row.excelRow} key={row.excelRow}><td>{row.excelRow}</td><td>{row.nomor_polisi || \'-\'}</td><td>{row.tanggal || \'-\'}</td><td>{row.jenis}</td><td>{row.keluhan || \'-\'}</td><td>{row.kilometer ?? \'-\'}</td></tr>)}</tbody></table></div></div>'
new_table = '<div className="dpt-preview"><div className="dpt-sheet-title"><div><b>Preview Data</b><span className="dpt-preview-note">Kolom mengikuti sheet Rekapan Permintaan dan semua baris tersedia lewat pagination.</span></div><span>{previewRows.length} dari {rows.length} ditampilkan</span></div><div className="dpt-preview-wrap"><table><thead><tr><th>No</th><th>Homebase</th><th>Unit Kendaraan</th><th>No Polisi</th><th>Merk</th><th>Type</th><th>Tanggal</th><th>Biaya (Rp)</th><th>Keterangan</th></tr></thead><tbody>{previewRows.map((row) => <tr data-excel-row={row.excelRow} key={row.excelRow}><td>{row.source_no || row.excelRow}</td><td>{row.homebase || \'-\'}</td><td>{row.unit_kendaraan || \'-\'}</td><td>{row.nomor_polisi || \'-\'}</td><td>{row.merk_excel || \'-\'}</td><td>{row.type_excel || \'-\'}</td><td>{row.tanggal || \'-\'}</td><td>{row.biaya == null ? \'-\' : fmtNum(row.biaya)}</td><td>{row.keluhan || \'-\'}</td></tr>)}</tbody></table></div><div className="dpt-pagination"><label>Baris/halaman <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="dpt-button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}>‹</button><span>Halaman {safePage} / {pageCount}</span><button type="button" className="dpt-button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>›</button></div></div>'
replace_once(p, old_table, new_table, required=True)

# Pengajuan page: prefer the preserved source snapshot for Excel view.
p = 'frontend/src/modules/PermintaanServicePageFixed.jsx'
replace_once(p, "import './PermintaanServicePage.css'", "import './PermintaanServicePage.css'\nimport { decodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
replace_once(p, "supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,kepemilikan,jenis_sewa,pemilik,lokasi,kilometer_terakhir,status')", "supabase.from('kendaraan').select('id,kode_kendaraan,nomor_polisi,merk,tipe,kepemilikan,jenis_sewa,pemilik,lokasi,unit_kerja,kilometer_terakhir,status')", required=True)
replace_once(p,
"  const requestExcelRows = useMemo(() => filtered.map((r, index) => { const v = vehicleMap[r.kendaraan_id]; return { no: index + 1, homebase: v?.lokasi || '-', unit_kendaraan: v?.unit_kerja || '-', nomor_polisi: v?.nomor_polisi || '-', merk: v?.merk || '-', type: v?.tipe || '-', tanggal: r.tanggal_pengajuan || '-', biaya: serviceCostMap[r.id], keterangan: r.keluhan || '-' } }), [filtered, vehicleMap, serviceCostMap])",
"  const requestExcelRows = useMemo(() => filtered.map((r, index) => { const v = vehicleMap[r.kendaraan_id]; const { meta } = decodeExcelMeta(r.catatan_transport); const sourceNo = Number(meta?.source_no); return { no: Number.isFinite(sourceNo) ? sourceNo : index + 1, homebase: meta?.homebase || v?.lokasi || '-', unit_kendaraan: meta?.unit_kendaraan || v?.unit_kerja || '-', nomor_polisi: v?.nomor_polisi || '-', merk: meta?.merk || v?.merk || '-', type: meta?.type || v?.tipe || '-', tanggal: r.tanggal_pengajuan || '-', biaya: meta?.biaya != null ? Number(meta.biaya) : serviceCostMap[r.id], keterangan: r.keluhan || '-' } }), [filtered, vehicleMap, serviceCostMap])",
required=True)

# Service import: preserve the source row as metadata in service_item.keterangan.
p = 'frontend/src/modules/EditableServiceExcelImportModal.jsx'
replace_once(p, "import './DataPageTools.css'", "import './DataPageTools.css'\nimport { encodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
replace_once(p, "    ppn: currencyValue(get('ppn')),\n", "    ppn: currencyValue(get('ppn')),\n    ppn_source: clean(get('ppn')) || '-',\n", required=True)
replace_once(p, "            keterangan: row.keterangan || null,\n          }", "            keterangan: encodeExcelMeta({ source: 'DATA_SERVICE', source_no: row.source_no, merk: row.merk, type: row.tipe, jenis: row.jenis, tahun: row.tahun, nomor_polisi: row.nomor_polisi, driver: row.driver, bulan: row.bulan, tanggal: row.tanggal, jenis_pekerjaan: row.jenis_pekerjaan, uraian: row.uraian, qty: row.qty, satuan: row.satuan, harga_satuan: row.harga_satuan, nilai_dpp: row.nilai_dpp, ppn: row.ppn, ppn_source: row.ppn_source, total: row.total, kilometer: row.kilometer, bengkel: row.bengkel, keterangan: row.keterangan || '' }, row.keterangan || ''),\n          }", required=True)

# Service page: render exact source metadata first.
p = 'frontend/src/modules/ServiceFeaturePage.jsx'
replace_once(p, "import './TransportOperationsFixed.css'", "import './TransportOperationsFixed.css'\nimport { decodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
pattern = r"  const serviceExcelRows = useMemo\(\(\) => \{.*?\n  \}, \[items, services, serviceMap, vehicleMap, driverMap\]\)"
replacement = """  const serviceExcelRows = useMemo(() => {
    const rows = []
    if (items.length) items.forEach((item, index) => {
      const s = serviceMap[item.service_id]
      const v = vehicleMap[s?.kendaraan_id]
      const { meta, note } = decodeExcelMeta(item.keterangan)
      const source = meta?.source === 'DATA_SERVICE' ? meta : null
      const date = source?.tanggal || s?.tanggal_service
      const parsedDate = date ? new Date(`${date}T00:00:00`) : null
      rows.push({
        no: Number.isFinite(Number(source?.source_no)) ? Number(source.source_no) : index + 1,
        merk: source?.merk || v?.merk || '-', type: source?.type || v?.tipe || '-', jenis: source?.jenis || v?.jenis_kendaraan || '-',
        tahun: source?.tahun || v?.tahun || '-', nomor_polisi: source?.nomor_polisi || v?.nomor_polisi || '-', driver: source?.driver || driverMap[v?.driver_id]?.nama_lengkap || '-',
        bulan: source?.bulan || (parsedDate && !Number.isNaN(parsedDate.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(parsedDate) : '-'),
        tanggal: date || '-', jenis_pekerjaan: source?.jenis_pekerjaan || TYPES[s?.jenis_service] || s?.jenis_service || '-', uraian: source?.uraian || item.nama_item || s?.keluhan || '-',
        qty: source?.qty ?? item.jumlah ?? '-', satuan: source?.satuan || item.satuan || '-', harga_satuan: source?.harga_satuan ?? item.harga_satuan ?? '-', nilai_dpp: source?.nilai_dpp ?? item.subtotal ?? '-',
        ppn: source?.ppn_source ?? source?.ppn ?? '-', total: source?.total ?? item.subtotal ?? '-', kilometer: source?.kilometer ?? s?.kilometer ?? '-', bengkel: source?.bengkel || s?.bengkel || '-', keterangan: note || source?.keterangan || s?.catatan || '-',
      })
    })
    if (!rows.length) services.forEach((s, index) => { const v = vehicleMap[s.kendaraan_id]; const date = s.tanggal_service ? new Date(`${s.tanggal_service}T00:00:00`) : null; rows.push({ no: index + 1, merk: v?.merk || '-', type: v?.tipe || '-', jenis: v?.jenis_kendaraan || '-', tahun: v?.tahun || '-', nomor_polisi: v?.nomor_polisi || '-', driver: driverMap[v?.driver_id]?.nama_lengkap || '-', bulan: date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date) : '-', tanggal: s.tanggal_service || '-', jenis_pekerjaan: TYPES[s.jenis_service] || s.jenis_service || '-', uraian: s.keluhan || '-', qty: '-', satuan: '-', harga_satuan: '-', nilai_dpp: s.nilai_dpp ?? '-', ppn: s.ppn ?? '-', total: s.total ?? s.biaya_aktual ?? '-', kilometer: s.kilometer ?? '-', bengkel: s.bengkel || '-', keterangan: s.catatan || '-' }) })
    return rows
  }, [items, services, serviceMap, vehicleMap, driverMap])"""
regex_once(p, pattern, replacement, required=True)

# Documents import: preserve the full source row snapshot on every imported document.
p = 'frontend/src/modules/VehicleDocumentsImportModal.jsx'
replace_once(p, "import './DataPageTools.css'", "import './DataPageTools.css'\nimport { encodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
replace_once(p, "  pemilik: ['pemilik', 'nama_pemilik'],\n}", "  pemilik: ['pemilik', 'nama_pemilik'],\n  source_no: ['no', 'nomor', 'nomor_urut'],\n  nomor_rangka: ['no_rangka', 'no_ranka', 'nomor_rangka'],\n}", required=True)
replace_once(p,
"const data = chosen.sheet.rows.slice(chosen.header.index + 1).filter((r) => r.values.some((v) => clean(v))).map((r) => ({ excelRow: r.excelRow, nomor_polisi: upper(valueOf(r, chosen.header.row, 'nomor_polisi')), stnk: excelDate(valueOf(r, chosen.header.row, 'stnk')), kir: excelDate(valueOf(r, chosen.header.row, 'kir')), lima_tahun: excelDate(valueOf(r, chosen.header.row, 'lima_tahun')), nomor_dokumen: valueOf(r, chosen.header.row, 'nomor_dokumen') }))",
"const data = chosen.sheet.rows.slice(chosen.header.index + 1).filter((r) => r.values.some((v) => clean(v))).map((r) => ({ excelRow: r.excelRow, source_no: valueOf(r, chosen.header.row, 'source_no'), nomor_polisi: upper(valueOf(r, chosen.header.row, 'nomor_polisi')), merk: valueOf(r, chosen.header.row, 'merk'), tipe: valueOf(r, chosen.header.row, 'tipe'), tahun: valueOf(r, chosen.header.row, 'tahun'), nomor_rangka: valueOf(r, chosen.header.row, 'nomor_rangka'), pemilik: valueOf(r, chosen.header.row, 'pemilik'), stnk: excelDate(valueOf(r, chosen.header.row, 'stnk')), kir: excelDate(valueOf(r, chosen.header.row, 'kir')), lima_tahun: excelDate(valueOf(r, chosen.header.row, 'lima_tahun')), nomor_dokumen: valueOf(r, chosen.header.row, 'nomor_dokumen') }))",
required=True)
replace_once(p,
"const result = await supabase.from('dokumen_kendaraan').insert({ kendaraan_id: vehicle.id, jenis_dokumen: type, nomor_dokumen: row.nomor_dokumen || null, tanggal_jatuh_tempo: due, keterangan: `Import Excel: ${sheetName}` })",
"const result = await supabase.from('dokumen_kendaraan').insert({ kendaraan_id: vehicle.id, jenis_dokumen: type, nomor_dokumen: row.nomor_dokumen || null, tanggal_jatuh_tempo: due, keterangan: encodeExcelMeta({ source: 'STNK_DAN_KIR', source_no: row.source_no, nomor_polisi: row.nomor_polisi, merk: row.merk, type: row.tipe, tahun: row.tahun, nomor_rangka: row.nomor_rangka, pemilik: row.pemilik }, `Import Excel: ${sheetName}`) })",
required=True)

# Documents page: show source owner / source row fields when metadata exists.
p = 'frontend/src/modules/DocumentsFeaturePage.jsx'
replace_once(p, "import './TransportOperationsFixed.css'", "import './TransportOperationsFixed.css'\nimport { decodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
old_monitor = " const monitorRows=useMemo(()=>vehicles.map((v,index)=>{const byType={};docs.filter(d=>d.kendaraan_id===v.id).forEach(d=>{byType[d.jenis_dokumen]=d});return{no:index+1,merk:v.merk||'-',tipe:v.tipe||'-',nomor_polisi:v.nomor_polisi||'-',tahun:v.tahun||'-',nomor_rangka:v.nomor_rangka||'-',stnk:byType.STNK?.tanggal_jatuh_tempo||'-',kir:byType.KIR?.tanggal_jatuh_tempo||'-',lima_tahun:byType['5_TAHUNAN']?.tanggal_jatuh_tempo||'-',pemilik:v.pemilik||'-'}}),[vehicles,docs])"
new_monitor = " const monitorRows=useMemo(()=>{const sourceRows=[];vehicles.forEach((v,index)=>{const byType={};docs.filter(d=>d.kendaraan_id===v.id).forEach(d=>{byType[d.jenis_dokumen]=d});const sourceDoc=Object.values(byType).find(d=>decodeExcelMeta(d.keterangan).meta?.source==='STNK_DAN_KIR');const meta=sourceDoc?decodeExcelMeta(sourceDoc.keterangan).meta:null;if(meta)sourceRows.push({no:Number(meta.source_no)||index+1,merk:meta.merk||'-',tipe:meta.type||'-',nomor_polisi:meta.nomor_polisi||v.nomor_polisi||'-',tahun:meta.tahun||'-',nomor_rangka:meta.nomor_rangka||'-',stnk:byType.STNK?.tanggal_jatuh_tempo||'-',kir:byType.KIR?.tanggal_jatuh_tempo||'-',lima_tahun:byType['5_TAHUNAN']?.tanggal_jatuh_tempo||'-',pemilik:meta.pemilik||'-'});});if(sourceRows.length)return sourceRows.sort((a,b)=>a.no-b.no);return vehicles.map((v,index)=>{const byType={};docs.filter(d=>d.kendaraan_id===v.id).forEach(d=>{byType[d.jenis_dokumen]=d});return{no:index+1,merk:v.merk||'-',tipe:v.tipe||'-',nomor_polisi:v.nomor_polisi||'-',tahun:v.tahun||'-',nomor_rangka:v.nomor_rangka||'-',stnk:byType.STNK?.tanggal_jatuh_tempo||'-',kir:byType.KIR?.tanggal_jatuh_tempo||'-',lima_tahun:byType['5_TAHUNAN']?.tanggal_jatuh_tempo||'-',pemilik:v.pemilik||'-'}})},[vehicles,docs])"
replace_once(p, old_monitor, new_monitor, required=True)

# Rental import: preserve the exact source line number and source values.
p = 'frontend/src/modules/RentalHistoryImportModalV2.jsx'
replace_once(p, "import './DataPageTools.css'", "import './DataPageTools.css'\nimport { encodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
replace_once(p, "        id: `${row.excelRow}`,\n        excelRow: row.excelRow,\n        tahun: valueOf(row, header.row, ['Tahun', 'Year']),", "        id: `${row.excelRow}`,\n        excelRow: row.excelRow,\n        source_no: valueOf(row, header.row, ['No', 'Nomor', 'No Excel']),\n        tahun: valueOf(row, header.row, ['Tahun', 'Year']),", required=True)
replace_once(p, "      catatan: `Import SUMMERY RENTAL ${row.tahun} • ${row.periode} • ${row.supplier} • ${row.uraian}`,", "      catatan: encodeExcelMeta({ source: 'SUMMERY_RENTAL', source_no: row.source_no, tahun: row.tahun, supplier: row.supplier, uraian: row.uraian, periode_tagihan: row.periode, nilai_invoice: invoice }),", required=True)

# Rental page: decode the exact source snapshot before operational fallback.
p = 'frontend/src/modules/RentalFeaturePage.jsx'
replace_once(p, "import './TransportOperationsFixed.css'", "import './TransportOperationsFixed.css'\nimport { decodeExcelMeta } from '../utils/excelSourceMeta.js'", required=True)
pattern = r"  const historicalRows = useMemo\(\(\) => \{.*?\n  \}, \[payments, contracts, owners\]\)"
replacement = """  const historicalRows = useMemo(() => {
    const contractMap = Object.fromEntries(contracts.map(c => [c.id, c]))
    const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]))
    return payments.map((payment, index) => {
      const contract = contractMap[payment.kontrak_sewa_id]
      const owner = ownerMap[contract?.pemilik_sewa_id]
      const { meta } = decodeExcelMeta(payment.catatan)
      if (meta?.source === 'SUMMERY_RENTAL') return { no_excel: Number(meta.source_no) || index + 1, tahun: meta.tahun || '-', supplier: meta.supplier || '-', uraian: meta.uraian || '-', periode_tagihan: meta.periode_tagihan || '-', nilai_invoice: meta.nilai_invoice ?? payment.jumlah_tagihan }
      const date = payment.bulan_pembayaran ? new Date(`${payment.bulan_pembayaran}T00:00:00`) : null
      const monthName = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date) : '-'
      return { no_excel: index + 1, tahun: date && !Number.isNaN(date.getTime()) ? date.getFullYear() : '-', supplier: owner?.nama_pemilik || owner?.nama_perusahaan || '-', uraian: payment.catatan || '-', periode_tagihan: monthName, nilai_invoice: payment.jumlah_tagihan }
    })
  }, [payments, contracts, owners])"""
regex_once(p, pattern, replacement, required=True)

# Export alignment: prefer preserved Excel snapshots.
p = 'frontend/src/AppTransport.jsx'
replace_once(p, "import './App.css'", "import './App.css'\nimport { decodeExcelMeta } from './utils/excelSourceMeta.js'", required=True)
replace_once(p,
"const sourceRequestRows = (requests || []).map((x, index) => ({ no: index + 1, homebase: vehicleMap[x.kendaraan_id]?.lokasi || '-', unit_kendaraan: vehicleMap[x.kendaraan_id]?.unit_kerja || '-', nomor_polisi: vehicleMap[x.kendaraan_id]?.nomor_polisi || '-', merk: vehicleMap[x.kendaraan_id]?.merk || '-', type: vehicleMap[x.kendaraan_id]?.tipe || '-', tanggal: x.tanggal_pengajuan || '-', biaya: requestCostMap[x.id], keterangan: x.keluhan || '-' }))",
"const sourceRequestRows = (requests || []).map((x, index) => { const v = vehicleMap[x.kendaraan_id]; const { meta } = decodeExcelMeta(x.catatan_transport); return { no: Number(meta?.source_no) || index + 1, homebase: meta?.homebase || v?.lokasi || '-', unit_kendaraan: meta?.unit_kendaraan || v?.unit_kerja || '-', nomor_polisi: v?.nomor_polisi || '-', merk: meta?.merk || v?.merk || '-', type: meta?.type || v?.tipe || '-', tanggal: x.tanggal_pengajuan || '-', biaya: meta?.biaya != null ? Number(meta.biaya) : requestCostMap[x.id], keterangan: x.keluhan || '-' } })",
required=True)
old_srv = ";(rs[1].data || []).forEach((item, index) => { const s = (rs[0].data || []).find(row => row.id === item.service_id); const v = vehicleMap[s?.kendaraan_id]; sourceServiceRows.push({ no: index + 1, merk: v?.merk || '-', type: v?.tipe || '-', jenis: v?.jenis_kendaraan || '-', tahun: v?.tahun || '-', nomor_polisi: v?.nomor_polisi || '-', driver: driverMapExport[v?.driver_id]?.nama_lengkap || '-', bulan: s?.tanggal_service ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(s.tanggal_service)) : '-', tanggal: s?.tanggal_service || '-', jenis_pekerjaan: s ? (s.jenis_service || '-') : '-', uraian: item.nama_item || '-', qty: item.jumlah ?? '-', satuan: item.satuan || '-', harga_satuan: item.harga_satuan ?? '-', nilai_dpp: item.subtotal ?? '-', ppn: '-', total: item.subtotal ?? '-', kilometer: s?.kilometer ?? '-', bengkel: s?.bengkel || '-', keterangan: item.keterangan || s?.catatan || '-' }) })"
new_srv = ";(rs[1].data || []).forEach((item, index) => { const s = (rs[0].data || []).find(row => row.id === item.service_id); const v = vehicleMap[s?.kendaraan_id]; const { meta, note } = decodeExcelMeta(item.keterangan); const source = meta?.source === 'DATA_SERVICE' ? meta : null; sourceServiceRows.push({ no: Number(source?.source_no) || index + 1, merk: source?.merk || v?.merk || '-', type: source?.type || v?.tipe || '-', jenis: source?.jenis || v?.jenis_kendaraan || '-', tahun: source?.tahun || v?.tahun || '-', nomor_polisi: source?.nomor_polisi || v?.nomor_polisi || '-', driver: source?.driver || driverMapExport[v?.driver_id]?.nama_lengkap || '-', bulan: source?.bulan || (s?.tanggal_service ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(s.tanggal_service)) : '-'), tanggal: source?.tanggal || s?.tanggal_service || '-', jenis_pekerjaan: source?.jenis_pekerjaan || s?.jenis_service || '-', uraian: source?.uraian || item.nama_item || '-', qty: source?.qty ?? item.jumlah ?? '-', satuan: source?.satuan || item.satuan || '-', harga_satuan: source?.harga_satuan ?? item.harga_satuan ?? '-', nilai_dpp: source?.nilai_dpp ?? item.subtotal ?? '-', ppn: source?.ppn_source ?? source?.ppn ?? '-', total: source?.total ?? item.subtotal ?? '-', kilometer: source?.kilometer ?? s?.kilometer ?? '-', bengkel: source?.bengkel || s?.bengkel || '-', keterangan: note || source?.keterangan || s?.catatan || '-' }) })"
replace_once(p, old_srv, new_srv, required=True)
old_rental = "rows: (rs[2].data || []).map((p, index) => { const c = contractMap[p.kontrak_sewa_id]; const o = ownerMap[c?.pemilik_sewa_id]; const d = p.bulan_pembayaran ? new Date(`${p.bulan_pembayaran}T00:00:00`) : null; const note = p.catatan || ''; const imported = note.match(/^Import SUMMERY RENTAL (\\d{4}) • ([^•]+) • ([^•]+) • (.*)$/); return { no_excel: index + 1, tahun: imported?.[1] || (d && !Number.isNaN(d.getTime()) ? d.getFullYear() : '-'), supplier: imported?.[3]?.trim() || o?.nama_pemilik || o?.nama_perusahaan || '-', uraian: imported?.[4]?.trim() || note || '-', periode_tagihan: imported?.[2]?.trim() || (d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d) : '-'), nilai_invoice: p.jumlah_tagihan } })"
new_rental = "rows: (rs[2].data || []).map((p, index) => { const c = contractMap[p.kontrak_sewa_id]; const o = ownerMap[c?.pemilik_sewa_id]; const { meta } = decodeExcelMeta(p.catatan); const d = p.bulan_pembayaran ? new Date(`${p.bulan_pembayaran}T00:00:00`) : null; return meta?.source === 'SUMMERY_RENTAL' ? { no_excel: Number(meta.source_no) || index + 1, tahun: meta.tahun || '-', supplier: meta.supplier || '-', uraian: meta.uraian || '-', periode_tagihan: meta.periode_tagihan || '-', nilai_invoice: meta.nilai_invoice ?? p.jumlah_tagihan } : { no_excel: index + 1, tahun: d && !Number.isNaN(d.getTime()) ? d.getFullYear() : '-', supplier: o?.nama_pemilik || o?.nama_perusahaan || '-', uraian: p.catatan || '-', periode_tagihan: d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d) : '-', nilai_invoice: p.jumlah_tagihan } })"
replace_once(p, old_rental, new_rental, required=True)
old_doc = "const monitoringRows = (vehicles || []).map((v, index) => ({ no: index + 1, merk: v.merk || '-', tipe: v.tipe || '-', nomor_polisi: v.nomor_polisi || '-', tahun: v.tahun || '-', nomor_rangka: v.nomor_rangka || '-', stnk: documentByVehicle[v.id]?.STNK?.tanggal_jatuh_tempo || '-', kir: documentByVehicle[v.id]?.KIR?.tanggal_jatuh_tempo || '-', lima_tahun: documentByVehicle[v.id]?.['5_TAHUNAN']?.tanggal_jatuh_tempo || '-', pemilik: v.pemilik || '-' }))"
new_doc = "const monitoringRows = (vehicles || []).map((v, index) => { const docsForVehicle = documentByVehicle[v.id] || {}; const sourceDoc = Object.values(docsForVehicle).find(doc => decodeExcelMeta(doc.keterangan).meta?.source === 'STNK_DAN_KIR'); const { meta } = sourceDoc ? decodeExcelMeta(sourceDoc.keterangan) : { meta: null }; return { no: Number(meta?.source_no) || index + 1, merk: meta?.merk || v.merk || '-', tipe: meta?.type || v.tipe || '-', nomor_polisi: meta?.nomor_polisi || v.nomor_polisi || '-', tahun: meta?.tahun || v.tahun || '-', nomor_rangka: meta?.nomor_rangka || v.nomor_rangka || '-', stnk: docsForVehicle.STNK?.tanggal_jatuh_tempo || '-', kir: docsForVehicle.KIR?.tanggal_jatuh_tempo || '-', lima_tahun: docsForVehicle['5_TAHUNAN']?.tanggal_jatuh_tempo || '-', pemilik: meta ? (meta.pemilik || '-') : (v.pemilik || '-') } })"
replace_once(p, old_doc, new_doc, required=True)

# Final lint guards for the generated source changes.
p = 'frontend/src/modules/DocumentsFeaturePage.jsx'
text = read(p)
text2 = text.replace('const monitorRows=useMemo(()=>{', 'const monitorRows=(()=>{', 1)
text2 = text2.replace(')},[vehicles,docs])', '})()', 1)
if text2 != text:
    write(p, text2)

p = 'frontend/src/modules/PengajuanExcelImportModal.jsx'
text = read(p)
if 'const fmtNum =' not in text:
    text2 = text.replace("const MAX_FILE_SIZE = 25 * 1024 * 1024", "const MAX_FILE_SIZE = 25 * 1024 * 1024\nconst fmtNum = value => value === null || value === undefined || value === '' ? '-' : new Intl.NumberFormat('id-ID').format(Number(value))", 1)
    if text2 == text:
        raise SystemExit('fmtNum anchor not found in PengajuanExcelImportModal.jsx')
    write(p, text2)

print('Changed:', ', '.join(changes) if changes else 'none')
