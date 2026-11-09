import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('user invitation UI is Admin-only and hidden until explicitly opened', async () => {
  const page = await read('../src/modules/UsersFeaturePage.jsx')

  assert.ok(page.includes("const canEdit = profile?.role === 'ADMIN'"))
  assert.ok(page.includes("const [showInviteForm, setShowInviteForm] = useState(false)"))
  assert.ok(page.includes("supabase.functions.invoke('invite-transport-user'"))
  assert.ok(page.includes("aria-controls=\"users-invite-form\""))
  assert.ok(page.includes("{showInviteForm && canEdit && view === 'users'"))
  assert.ok(page.includes("email.endsWith('@zamanteknindo.com')"))
  assert.ok(page.includes("Password tidak dibuat atau disimpan oleh aplikasi"))
  assert.ok(!page.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service role credentials never appear in browser code')
})

test('server invitation endpoint validates the caller, company domain, role, and creates the profile server-side', async () => {
  const endpoint = await read('../../supabase/functions/invite-transport-user/index.ts')

  assert.ok(endpoint.includes('request.headers.get("authorization")'))
  assert.ok(endpoint.includes('userClient.auth.getUser(token)'))
  assert.ok(endpoint.includes('callerProfile.role !== "ADMIN"'))
  assert.ok(endpoint.includes('!callerProfile?.aktif'))
  assert.ok(endpoint.includes('@zamanteknindo\\.com'))
  for (const role of ['ADMIN', 'TRANSPORT', 'OPERASIONAL', 'ATASAN_TRANSPORT', 'DIREKTUR', 'AKUNTANSI']) {
    assert.ok(endpoint.includes(`"${role}"`), `${role} is a supported invitation role`)
  }
  assert.ok(endpoint.includes('admin.auth.admin.inviteUserByEmail'))
  assert.ok(endpoint.includes('.from("profiles")'))
  assert.ok(endpoint.includes('.upsert('))
  assert.ok(endpoint.includes('SUPABASE_SERVICE_ROLE_KEY'))
  assert.ok(!endpoint.includes('verify_jwt = false'), 'the function must keep platform JWT verification enabled')
})
