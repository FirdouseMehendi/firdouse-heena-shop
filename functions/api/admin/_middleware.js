// Guards every /api/admin/* route except login/logout behind the signed session cookie.
import { getCookie, verifySessionToken } from "../../_shared/admin-auth.js";

const PUBLIC_PATHS = new Set(["/api/admin/login", "/api/admin/logout"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  if (PUBLIC_PATHS.has(pathname)) {
    return next();
  }

  const token = getCookie(request, "fh_admin");
  const valid = await verifySessionToken(env, token);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Not authenticated." }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return next();
}
