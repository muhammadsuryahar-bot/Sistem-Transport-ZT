import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function normalizeExcelImportLimit() {
  const targets = [
    '/UnifiedExcelImportModal.jsx',
    '/ServiceHistoryImportModal.jsx',
    '/VehicleExcelImportModal.jsx',
    '/DataPageTools.jsx',
  ]

  return {
    name: 'normalize-excel-import-limit',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/modules/') || !targets.some((target) => id.endsWith(target))) {
        return null
      }

      const updated = code
        .replaceAll('const MAX_FILE_SIZE = 10 * 1024 * 1024', 'const MAX_FILE_SIZE = 25 * 1024 * 1024')
        .replaceAll('Ukuran file maksimal 10 MB.', 'Ukuran file maksimal 25 MB.')
        .replaceAll('Ukuran file maksimum 10 MB.', 'Ukuran file maksimum 25 MB.')
        .replaceAll('maksimal 10 MB', 'maksimal 25 MB')
        .replaceAll('maks. 10 MB', 'maks. 25 MB')
        .replaceAll('maximum 10 MB', 'maximum 25 MB')

      return updated === code ? null : { code: updated, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), normalizeExcelImportLimit()],
})
