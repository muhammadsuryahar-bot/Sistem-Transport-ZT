import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('Rental form panels start hidden while each tab keeps its list visible', async () => {
  const source = await read('../src/modules/RentalFeaturePage.jsx')

  assert.ok(source.includes("const [openRentalForm, setOpenRentalForm] = useState(null)"), 'no Rental form is open initially')
  for (const [tab, id, marker] of [
    ['pemilik', 'rental-owner-form', 'filteredOwners.map(o =>'],
    ['kontrak', 'rental-contract-form', 'filteredContracts.map(c =>'],
    ['pembayaran', 'rental-payment-form', 'filteredPayments.map(p =>'],
    ['historis', 'rental-history-form', 'filteredHistory.map(row=>'],
    ['repair', 'rental-repair-form', 'filteredRepairs.map(r =>'],
  ]) {
    assert.ok(source.includes(`openRentalForm === '${tab}' && <form id="${id}"`), `${tab} form is on demand`)
    assert.ok(source.includes(marker), `${tab} list remains available while its form is closed`)
  }
})

test('Rental header opens the correct form for the selected tab and respects role guards', async () => {
  const source = await read('../src/modules/RentalFeaturePage.jsx')

  assert.ok(source.includes("pemilik: { label: 'Tambah Pemilik', id: 'rental-owner-form', allowed: editable }"), 'owner add is gated by editable roles')
  assert.ok(source.includes("kontrak: { label: 'Tambah Kontrak', id: 'rental-contract-form', allowed: editable }"), 'contract add is gated by editable roles')
  assert.ok(source.includes("pembayaran: { label: 'Tambah Pembayaran', id: 'rental-payment-form', allowed: editable }"), 'payment add is gated by editable roles')
  assert.ok(source.includes("historis: { label: 'Tambah Data', id: 'rental-history-form', allowed: historyEditable }"), 'history add keeps its narrower role permission')
  assert.ok(source.includes("repair: { label: 'Tambah Perbaikan', id: 'rental-repair-form', allowed: repairEditable }"), 'repair add keeps its narrower role permission')
  assert.ok(source.includes('aria-controls={rentalFormConfig.id}') && source.includes('aria-expanded={openRentalForm === tab}'), 'the add action is accessible and reflects visibility')
  assert.ok(source.includes("openRentalForm === tab ? 'Tutup Form' : '+ ' + rentalFormConfig.label"), 'button label follows its current state')
  assert.ok(source.includes("setOpenRentalForm(null); setTab(v)"), 'changing Rental tabs closes any open form')
})

test('editing Rental rows opens populated forms and successful save/reset closes them', async () => {
  const source = await read('../src/modules/RentalFeaturePage.jsx')

  for (const [name, open] of [
    ['owner', "setTab('pemilik'); setOpenRentalForm('pemilik')"],
    ['contract', "setTab('kontrak'); setOpenRentalForm('kontrak')"],
    ['payment', "setTab('pembayaran'); setOpenRentalForm('pembayaran')"],
    ['repair', "setTab('repair'); setOpenRentalForm('repair')"],
    ['history', "setTab('historis'); setOpenRentalForm('historis')"],
  ]) {
    assert.ok(source.includes(open), `editing a ${name} row opens its form`)
  }
  for (const reset of [
    'setOpenRentalForm(null)',
    'setEditingOwnerId(null)',
    'setEditingContractId(null)',
    'setEditingPaymentId(null)',
    'setEditingRepairId(null)',
    'setEditingHistory(null)',
  ]) assert.ok(source.includes(reset), `${reset} remains wired to reset/close actions`)

  assert.ok(source.includes("resetOwnerForm(); setSuccess(editingOwnerId ? 'Pemilik sewa diperbarui.' : 'Pemilik sewa tersimpan.')"), 'owner success resets and closes')
  assert.ok(source.includes("resetContractForm(); setSuccess(editingContractId ? 'Kontrak sewa diperbarui.'"), 'contract success resets and closes')
  assert.ok(source.includes("resetPaymentForm(); setSuccess(editingPaymentId ? 'Pembayaran diperbarui.'"), 'payment success resets and closes')
  assert.ok(source.includes("resetRepairForm(); setSuccess(editingRepairId ? 'Data perbaikan diperbarui.'"), 'repair success resets and closes')
  assert.ok(source.includes("resetHistoryForm(); setSuccess(editingHistory?'Data SUMMERY RENTAL diperbarui.'"), 'history success resets and closes')

  assert.ok(source.includes("setTab('kontrak');setOpenRentalForm('kontrak')"), 'the quick-add contract action from the vehicle list opens the contract form')
})

test('Documents data tab lists documents first and opens the form only on add/edit', async () => {
  const source = await read('../src/modules/DocumentsFeaturePage.jsx')

  assert.ok(source.includes('[showDocForm,setShowDocForm]=useState(false)'), 'the document form starts closed')
  assert.ok(source.includes("viewMode==='detail'&&canManage&&showDocForm&&<section className=\"x-card\" id=\"document-entry-form\""), 'document form is conditionally rendered')
  assert.ok(source.includes('<h3>Daftar Dokumen</h3>'), 'document list remains visible on Data Dokumen')
  assert.ok(source.includes("resetForm();setViewMode('detail');setShowDocForm(true)"), 'Tambah Dokumen opens a blank form')
  assert.ok(source.includes("setShowDocForm(true);window.scrollTo"), 'editing a document opens the populated form')
  assert.ok(source.includes("setShowDocForm(false)}}>Data Dokumen"), 'switching to Data Dokumen does not auto-open the form')
  assert.ok(source.includes("setShowDocForm(false)}}>Format STNK"), 'switching to Format STNK closes the data-entry form')
  assert.ok(source.includes('onClick={resetForm} disabled={saving}>Batal</button>'), 'Batal closes and resets the document form')
  assert.ok(source.includes('const resetForm=()=>{setForm(EMPTY);setFile(null);setEditing(null);setShowDocForm(false)}'), 'successful save closes the form through the existing reset')
})

test('monitoring actions that add or edit documents still open the same on-demand form', async () => {
  const source = await read('../src/modules/DocumentsFeaturePage.jsx')

  assert.ok(source.includes("setForm(current=>({...current,kendaraan_id:String(row.kendaraan_id),jenis_dokumen:'STNK'}));setShowDocForm(true)"), 'the monitoring Edit action for a vehicle without a document opens a prepared form')
  assert.ok(source.includes("setForm(current=>({...current,kendaraan_id:String(monitorDetail.vehicle.id),jenis_dokumen:type}));setShowDocForm(true)"), 'Tambah from monitoring detail opens a prepared document form')
  assert.ok(source.includes("if(doc)edit(doc)"), 'existing monitoring documents continue to open their populated edit form')
})
