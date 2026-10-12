export const GENSET_OWNERSHIP = Object.freeze(['ASET', 'SEWA'])

export function validateGensetInput(input) {
  const merk = String(input?.merk ?? '').trim()
  const capacity = Number(input?.kapasitas_kva)
  const status = String(input?.status_kepemilikan ?? '').trim().toUpperCase()
  if (!merk) return 'Merk genset wajib diisi.'
  if (!Number.isFinite(capacity) || capacity <= 0) return 'Kapasitas (KVA) harus berupa angka lebih besar dari 0.'
  if (!GENSET_OWNERSHIP.includes(status)) return 'Status kepemilikan harus Aset atau Sewa.'
  return ''
}

const optionalText = value => {
  const result = String(value ?? '').trim()
  return result || null
}

export function normalizeGensetInput(input) {
  return {
    source_no: Number(input.source_no),
    merk: String(input.merk ?? '').trim(),
    kapasitas_kva: Number(input.kapasitas_kva),
    engine_no: optionalText(input.engine_no),
    generator_no: optionalText(input.generator_no),
    lokasi_kerja: optionalText(input.lokasi_kerja),
    pemilik: optionalText(input.pemilik),
    status_kepemilikan: String(input.status_kepemilikan ?? '').trim().toUpperCase(),
    keterangan: optionalText(input.keterangan),
  }
}
