export function buildGensetExportRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    no_export: row?.source_no ?? index + 1,
    merk: row?.merk || '-',
    kapasitas_kva: row?.kapasitas_kva,
    engine_no: row?.engine_no || '-',
    generator_no: row?.generator_no || '-',
    lokasi_kerja: row?.lokasi_kerja || '-',
    pemilik: row?.pemilik || '-',
    status_kepemilikan: row?.status_kepemilikan === 'ASET' ? 'Aset' : 'Sewa',
    keterangan: row?.keterangan || '-',
  }))
}
