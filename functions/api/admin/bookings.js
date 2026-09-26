// GET /api/admin/bookings[?status=pending] — list booking enquiries. Auth via _middleware.js.
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const STATUSES = new Set(["pending", "confirmed", "rejected", "completed"]);

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Booking storage isn't set up yet — see README (Cloudflare D1)." }, 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let stmt;
  if (status && STATUSES.has(status)) {
    stmt = env.DB.prepare("SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status);
  } else {
    stmt = env.DB.prepare("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200");
  }

  const { results } = await stmt.all();
  return json({ bookings: results });
}
