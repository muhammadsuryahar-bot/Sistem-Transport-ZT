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

  assert.ok(source.includes('aria-expanded={tab === \'pekerjaan\' && showServiceForm}'), 'the header action reports whether the entry panel is open')
  assert.ok(source.includes("aria-controls=\"service-entry-form\""), 'the header action is associated with its form panel')
  assert.ok(source.includes("setTab('pekerjaan'); setEditingServiceId(null); setForm({ ...emptyService, tanggal_service: new Date().toISOString().slice(0, 10) }); setShowServiceForm(true)"), 'Tambah Service opens a fresh form on the Data Service tab')
  assert.ok(source.includes("tab === 'pekerjaan' && showServiceForm ? 'Tutup Form' : '+ Tambah Service'"), 'the header action label reflects the open/closed state')
})

test('form closes on cancel, successful save and tab change, but remains open after validation errors', async () => {
  const source = await read('../src/modules/ServiceFeaturePage.jsx')
  const saveStart = source.indexOf('const saveService = async e =>')
  const saveEnd = source.indexOf('const approvalList =', saveStart)
  const saveService = source.slice(saveStart, saveEnd)
  const editStart = source.indexOf('const openServiceEdit = s =>')
  const editEnd = source.indexOf('const deleteService =', editStart)
  const editService = source.slice(editStart, editEnd)

  assert.ok(source.includes("setShowServiceForm(false); setTab(v)"), 'switching to another tab closes the entry form')
  assert.ok(source.includes('>Batal</button>') && source.includes('setShowServiceForm(false)'), 'Batal closes the panel')
  assert.ok(saveService.includes('setShowServiceForm(false)'), 'a successful save closes the panel')
  assert.ok(saveService.includes('} catch (e2) { setError(humanizeError(e2)) }'), 'a save error is reported without forcing the form closed')
  assert.ok(editService.includes('setShowServiceForm(true)'), 'editing a service opens the same form in edit mode')
})
