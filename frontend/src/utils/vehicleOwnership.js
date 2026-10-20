const cleanOwner = value => String(value ?? '').replace(/\s+/g, ' ').trim()

/**
 * Infer the rental type from the source owner name when no explicit rental
 * type is stored. Company prefixes must end at a word boundary, dot, or end
 * of string; names such as "PT. Example" and "CV Example" are companies.
 */
export function inferRentalTypeFromOwner(owner) {
  const value = cleanOwner(owner)
  if (!value) return ''
  return /^(PT|CV|UD|YAYASAN|KOPERASI)(?:\.|\s|$)/i.test(value)
    ? 'SEWA_PERUSAHAAN'
    : 'SEWA_PERORANGAN'
}
