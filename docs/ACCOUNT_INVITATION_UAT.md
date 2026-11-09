# Admin User Invitations — UAT Readiness

## Scope

The invitation flow is an Admin-only capability for creating separate company accounts for the six application roles. It does not create passwords in the browser and does not expose the Supabase service-role key to frontend code.

## Production prerequisites

1. Configure a production Custom SMTP provider in Supabase Authentication settings. Supabase's built-in SMTP service is restricted to pre-authorized addresses in the Supabase organization team and is not intended for production delivery.
2. Verify the sender domain and the provider's SPF/DKIM (and DMARC where applicable) records.
3. Ensure the Auth redirect allow-list includes the production app URL used by the invite flow.
4. Deploy the `invite-transport-user` Edge Function with JWT verification enabled.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` on the Edge Function runtime only. Never add it to Vercel frontend environment variables or browser source.
6. Use only real company mailboxes ending in `@zamanteknindo.com`.

## Invitation sequence

1. A signed-in, active Admin opens Pengguna > Undang Pengguna.
2. The Admin enters the employee's full name, company email, and intended role.
3. The Edge Function verifies the caller's JWT and active Admin profile.
4. The server sends the Supabase Auth invitation and upserts the matching profile with the selected role.
5. The employee follows the email link and sets their own password.
6. The Admin verifies the new profile, role, and active status in Pengguna.

## UAT cases

- [ ] Admin can invite one test mailbox for each role.
- [ ] Non-Admin user receives HTTP 403 from the invitation endpoint.
- [ ] Missing/invalid JWT receives HTTP 401.
- [ ] Email outside `@zamanteknindo.com` is rejected.
- [ ] Unsupported role is rejected.
- [ ] Duplicate email is reported without changing the existing account.
- [ ] Failed email delivery is shown clearly and does not report success.
- [ ] Invited user can open the link, set a password, log in, and sees only the assigned menu.
- [ ] A profile role/status change is reflected after a fresh login.
- [ ] No service-role key is present in frontend build output.

## Current blocker

No Edge Functions were previously configured in this Supabase project, and the Auth email delivery configuration has not been verified. Therefore the implementation must not be deployed or represented as production-ready until Custom SMTP is configured and a test invitation is successfully delivered to a real company mailbox.
