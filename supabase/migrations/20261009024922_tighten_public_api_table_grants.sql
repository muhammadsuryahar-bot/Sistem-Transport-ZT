-- Remove unnecessary direct table/sequence/RPC privileges from unauthenticated clients.
-- All operational access is governed by the authenticated role and table-specific RLS policies.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- RLS is row-scoped; these table-level privileges are not required by the application.
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke truncate, references, trigger on all tables in schema public from anon;

-- Keep the same least-privilege defaults for new objects created by the migration owner.
alter default privileges for role postgres in schema public revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
