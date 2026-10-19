export const SERVICE_PPN_REVIEW_THRESHOLD = 0.2

/**
 * Flags unusually high PPN/DPP ratios for manual invoice review.
 * This is a review gate, not a tax calculator: source values are never rewritten.
 */
export function findServicePpnAnomalies(rows = [], threshold = SERVICE_PPN_REVIEW_THRESHOLD) {
  const ratioLimit = Number(threshold)
  if (!Number.isFinite(ratioLimit) || ratioLimit < 0) {
    throw new TypeError('PPN review threshold must be a finite non-negative ratio.')
  }

  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const dpp = Number(row?.nilai_dpp ?? 0)
    const ppn = Number(row?.ppn ?? 0)
    if (!Number.isFinite(dpp) || !Number.isFinite(ppn) || ppn <= 0) return []

    const hasMissingDpp = dpp <= 0
    const rate = hasMissingDpp ? null : ppn / dpp
    if (!hasMissingDpp && rate <= ratioLimit) return []

    return [{
      excelRow: row?.excelRow ?? null,
      source_no: String(row?.source_no ?? '').trim(),
      nilai_dpp: dpp,
      ppn,
      ratePercent: rate === null ? null : rate * 100,
      reason: hasMissingDpp ? 'PPN_WITHOUT_POSITIVE_DPP' : 'PPN_RATE_OVER_THRESHOLD',
    }]
  })
}
