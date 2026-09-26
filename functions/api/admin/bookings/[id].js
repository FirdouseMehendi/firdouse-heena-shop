// PATCH /api/admin/bookings/:id — { status } -> update a booking's status. Auth via _middleware.js.
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

const STATUSES = ["pending", "confirmed", "rejected", "completed"];

export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Booking storage isn't set up yet — see README (Cloudflare D1)." }, 503);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid booking id." }, 400);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const status = String(payload?.status ?? "");
  if (!STATUSES.includes(status)) {
    return json({ error: `Status must be one of: ${STATUSES.join(", ")}` }, 400);
  }

  const result = await env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ?").bind(status, id).run();
  if (!result.meta.changes) return json({ error: "Booking not found." }, 404);

  return json({ ok: true });
}
