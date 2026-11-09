import { createClient } from "npm:@supabase/supabase-js@2"

const PRODUCTION_ORIGIN = "https://sistem-transport-zt.vercel.app"
const ALLOWED_ORIGINS = new Set([PRODUCTION_ORIGIN, "http://localhost:5173"])
const ALLOWED_ROLES = new Set([
  "ADMIN",
  "TRANSPORT",
  "OPERASIONAL",
  "ATASAN_TRANSPORT",
  "DIREKTUR",
  "AKUNTANSI",
])

function headersFor(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : PRODUCTION_ORIGIN
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function respond(
  origin: string | null,
  status: number,
  payload: Record<string, unknown>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headersFor(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin")

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return respond(origin, 403, { error: "Asal permintaan tidak diizinkan." })
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: headersFor(origin) })
  }

  if (request.method !== "POST") {
    return respond(origin, 405, { error: "Metode permintaan tidak diizinkan." })
  }

  const authorization = request.headers.get("authorization") || ""
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : ""

  if (!token) {
    return respond(origin, 401, { error: "Sesi login tidak valid. Silakan login kembali." })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return respond(origin, 400, { error: "Data undangan tidak valid." })
  }

  const fullName = String(body.fullName || "").trim()
  const email = String(body.email || "").trim().toLowerCase()
  const role = String(body.role || "").trim().toUpperCase()

  if (fullName.length < 2 || fullName.length > 100) {
    return respond(origin, 400, { error: "Nama lengkap harus berisi 2 sampai 100 karakter." })
  }

  if (!/^[^\s@]+@zamanteknindo\.com$/.test(email)) {
    return respond(origin, 400, {
      error: "Undangan hanya dapat dikirim ke email perusahaan @zamanteknindo.com.",
    })
  }

  if (!ALLOWED_ROLES.has(role)) {
    return respond(origin, 400, { error: "Role pengguna tidak valid." })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(origin, 500, {
      error: "Konfigurasi layanan undangan belum lengkap. Hubungi administrator sistem.",
    })
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) {
      return respond(origin, 401, { error: "Sesi login tidak valid. Silakan login kembali." })
    }

    const { data: callerProfile, error: profileReadError } = await userClient
      .from("profiles")
      .select("role, aktif")
      .eq("id", authData.user.id)
      .single()

    if (profileReadError || !callerProfile?.aktif || callerProfile.role !== "ADMIN") {
      return respond(origin, 403, { error: "Hanya Admin aktif yang dapat mengundang pengguna." })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { data: { full_name: fullName } },
    )

    if (inviteError || !inviteData.user) {
      const detail = `${inviteError?.code || ""} ${inviteError?.message || ""}`.toLowerCase()
      if (detail.includes("already") || detail.includes("exists")) {
        return respond(origin, 409, { error: "Email tersebut sudah terdaftar atau sudah memiliki undangan." })
      }
      return respond(origin, 502, {
        error: "Undangan belum berhasil dikirim. Periksa konfigurasi Custom SMTP Supabase dan alamat email tujuan.",
      })
    }

    const { error: profileWriteError } = await adminClient
      .from("profiles")
      .upsert({
        id: inviteData.user.id,
        nama_lengkap: fullName,
        email,
        role,
        aktif: true,
      }, { onConflict: "id" })

    if (profileWriteError) {
      // Avoid leaving an invited Auth user without its matching application profile.
      await adminClient.auth.admin.deleteUser(inviteData.user.id)
      return respond(origin, 500, {
        error: "Profil akun gagal disiapkan. Proses undangan dibatalkan; periksa konfigurasi database.",
      })
    }

    return respond(origin, 200, {
      ok: true,
      email,
      role,
      message: "Undangan berhasil dikirim.",
    })
  } catch (error) {
    console.error("invite-transport-user failed:", error)
    return respond(origin, 500, {
      error: "Terjadi kendala saat menyiapkan undangan. Silakan coba kembali.",
    })
  }
})
