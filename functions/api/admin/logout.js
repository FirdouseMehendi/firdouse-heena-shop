// POST /api/admin/logout — clears the admin session cookie.
export async function onRequestPost({ request }) {
  const isHttps = new URL(request.url).protocol === "https:";
  const cookie = `fh_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? "; Secure" : ""}`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "set-cookie": cookie },
  });
}
