import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Service entry form is hidden by default while the service list remains visible', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')

  assert.ok(source.includes("const [showServiceForm, setShowServiceForm] = useState(false)"), 'the form starts closed')
  assert.ok(source.includes("{canProcess && showServiceForm && <section id=\"service-entry-form\""), 'the entry form only renders when explicitly opened by an allowed role')
  assert.ok(source.includes('<h3>Daftar Service</h3>'), 'the service list remains available when the entry form is closed')
  assert.ok(source.includes('filteredServices.map((s, index)'), 'the service table continues to render the filtered service rows')
})

test('Tambah Service button opens and toggles the form without changing the data workflow', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')

  assert.ok(source.includes('aria-expanded={activeEntryForm.visible}'), 'the header action reports whether the entry panel is open')
  assert.ok(source.includes("aria-controls=\"service-entry-form\""), 'the header action is associated with its form panel')
  assert.ok(source.includes("if (tab === 'pekerjaan') {\n      setEditingServiceId(null)\n      setForm({ ...emptyService, tanggal_service: new Date().toISOString().slice(0, 10) })\n      setShowServiceForm(true)"), 'Tambah Service opens a fresh form on the Data Service tab')
  assert.ok(source.includes("activeEntryForm.visible ? 'Tutup Form' : '+ ' + activeEntryForm.label"), 'the header action label follows the current tab and open/closed state')
})

test('form closes on cancel, successful save and tab change, but remains open after validation errors', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')
  const saveStart = source.indexOf('const saveService = async e =>')
  const saveEnd = source.indexOf('const approvalList =', saveStart)
  const saveService = source.slice(saveStart, saveEnd)
  const editStart = source.indexOf('const openServiceEdit = s =>')
  const editEnd = source.indexOf('const deleteService =', editStart)
  const editService = source.slice(editStart, editEnd)

  assert.ok(source.includes('closeEntryForms(); setTab(v)'), 'switching to another tab closes all entry forms')
  assert.ok(source.includes('>Batal</button>') && source.includes('setShowServiceForm(false)'), 'Batal closes the panel')
  assert.ok(saveService.includes('setShowServiceForm(false)'), 'a successful save closes the panel')
  assert.ok(saveService.includes('} catch (e2) { setError(humanizeError(e2)) }'), 'a save error is reported without forcing the form closed')
  assert.ok(editService.includes('setShowServiceForm(true)'), 'editing a service opens the same form in edit mode')
})


test('all secondary Service tabs hide their data-entry forms by default and retain their lists', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')

  const forms = [
    ['Item Service', 'showItemForm', 'service-item-form', 'items.map(i =>'],
    ['Bukti', 'showProofForm', 'service-proof-form', 'proofs.map(p =>'],
    ['Ban/Aki', 'showPartForm', 'service-part-form', '(tab === \'ban\' ? bans : akis).map(r =>'],
    ['Kilometer', 'showKmForm', 'service-km-form', 'kms.map(k =>'],
    ['Patokan Harga', 'showBenchmarkForm', 'service-benchmark-form', 'displayedBenchmarkRows.length ? displayedBenchmarkRows.map(row =>'],
  ]

  for (const [label, state, formId, listMarker] of forms) {
    assert.ok(source.includes(`const [${state}, set${state[0].toUpperCase() + state.slice(1)}] = useState(false)`), `${label} form starts closed`)
    assert.ok(source.includes(formId), `${label} form has a stable accessible target`)
    assert.ok(source.includes(listMarker), `${label} list remains rendered without opening the form`)
  }
  assert.ok(source.includes("item: { visible: showItemForm, id: 'service-item-form', label: 'Tambah Item' }"), 'Item tab uses its own add action')
  assert.ok(source.includes("bukti: { visible: showProofForm, id: 'service-proof-form', label: 'Upload Bukti' }"), 'Evidence tab uses its own add action')
  assert.ok(source.includes("ban: { visible: showPartForm, id: 'service-part-form', label: 'Catat Penggantian Ban' }"), 'Ban tab uses its own add action')
  assert.ok(source.includes("aki: { visible: showPartForm, id: 'service-part-form', label: 'Catat Penggantian Aki' }"), 'Aki tab uses its own add action')
  assert.ok(source.includes("km: { visible: showKmForm, id: 'service-km-form', label: 'Catat Kilometer' }"), 'Kilometer tab uses its own add action')
  assert.ok(source.includes("harga: { visible: showBenchmarkForm, id: 'service-benchmark-form', label: 'Tambah Patokan Harga' }"), 'Price benchmark tab uses its own add action')
})

test('editing Service subtab data opens the corresponding form and successful saves close it', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')
  const marker = [
    "setShowItemForm(true)",
    "setShowProofForm(true)",
    "setShowPartForm(true)",
    "setShowKmForm(true)",
    "setShowBenchmarkForm(true)",
    "setShowItemForm(false)",
    "setShowProofForm(false)",
    "setShowPartForm(false)",
    "setShowKmForm(false)",
  ]
  for (const item of marker) assert.ok(source.includes(item), `${item} remains wired to the appropriate form transition`)
  assert.ok(source.includes("setShowBenchmarkForm(false)"), 'benchmark reset closes the form')
  assert.ok(source.includes("setShowPartForm(false)"), 'part save or cancel closes the form')
  assert.ok(source.includes("setShowKmForm(false)"), 'kilometer save or cancel closes the form')
  assert.ok(source.includes("setShowProofForm(false)"), 'proof save or cancel closes the form')
  assert.ok(source.includes("setShowItemForm(false)"), 'item save or cancel closes the form')
})
