from pathlib import Path


def patch_documents():
    path = Path('frontend/src/modules/DocumentsFeaturePage.jsx')
    text = path.read_text(encoding='utf-8')
    start = text.find(' const monitorRows=')
    end = text.find('\n const resetForm', start)
    if start < 0 or end < 0:
        raise SystemExit('Documents monitorRows block not found')
    replacement = """ const monitorRows=useMemo(()=>vehicles.map((v,index)=>{const byType={};docs.filter(d=>d.kendaraan_id===v.id).forEach(d=>{byType[d.jenis_dokumen]=d});const sourceDoc=Object.values(byType).find(d=>decodeExcelMeta(d.keterangan).meta?.source==='STNK_DAN_KIR');const meta=sourceDoc?decodeExcelMeta(sourceDoc.keterangan).meta:null;return{no:Number(meta?.source_no)||index+1,merk:meta?.merk||v.merk||'-',tipe:meta?.type||v.tipe||'-',nomor_polisi:meta?.nomor_polisi||v.nomor_polisi||'-',tahun:meta?.tahun||v.tahun||'-',nomor_rangka:meta?.nomor_rangka||'-',stnk:byType.STNK?.tanggal_jatuh_tempo||'-',kir:byType.KIR?.tanggal_jatuh_tempo||'-',lima_tahun:byType['5_TAHUNAN']?.tanggal_jatuh_tempo||'-',pemilik:meta?.pemilik||v.pemilik||'-'}}),[vehicles,docs])"""
    path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')


def patch_pengajuan():
    path = Path('frontend/src/modules/PengajuanExcelImportModal.jsx')
    text = path.read_text(encoding='utf-8')
    if 'const fmtNum =' in text:
        return
    anchor = "const MAX_FILE_SIZE = 25 * 1024 * 1024"
    replacement = anchor + "\nconst fmtNum = value => value === null || value === undefined || value === '' ? '-' : new Intl.NumberFormat('id-ID').format(Number(value))"
    if anchor not in text:
        raise SystemExit('Pengajuan fmtNum anchor not found')
    path.write_text(text.replace(anchor, replacement, 1), encoding='utf-8')


patch_documents()
patch_pengajuan()
print('Excel alignment lint guards applied.')
