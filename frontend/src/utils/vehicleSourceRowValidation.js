/**
 * Keep source-row lineage and identify every non-empty workbook row that the
 * importer could not normalize into a record with the required vehicle key.
 * A record with a source row number different from the parsed row index is
 * still matched by physical Excel row, not by array position.
 */
export function findInvalidVehicleSourceRows(sourceRows = [], validRows = []) {
  const validExcelRows = new Set(
    validRows
      .map(row => Number(row?.excelRow))
      .filter(Number.isFinite),
  )
  return sourceRows.filter(row => !validExcelRows.has(Number(row?.excelRow)))
}
