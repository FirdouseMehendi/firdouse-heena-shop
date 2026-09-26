// POST /api/admin/login — { password } -> sets a signed session cookie.
import { createSessionToken, timingSafeEqual } from "../../_shared/admin-auth.js";

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: "Admin login isn't set up yet — see README (ADMIN_PASSWORD)." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const password = String(payload?.password ?? "");
  if (!password || !timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return json({ error: "Incorrect password." }, 401);
  }

  const token = await createSessionToken(env);
  const isHttps = new URL(request.url).protocol === "https:";
  const cookie = `fh_admin=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${isHttps ? "; Secure" : ""}`;

  return json({ ok: true }, 200, { "set-cookie": cookie });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
