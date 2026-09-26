// POST /api/book
// Saves a booking enquiry (collected by the AI consultant, or submitted directly)
// into the D1 "bookings" table. This never confirms a booking — it only records
// an enquiry for the admin panel / artist to follow up on.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(str, max) {
  return String(str ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ error: "Booking storage isn't set up yet — see README (Cloudflare D1)." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const name = clean(payload?.name, 100);
  const phone = clean(payload?.phone, 20);
  const service = clean(payload?.service, 60);
  const eventDate = clean(payload?.eventDate, 20);
  const location = clean(payload?.location, 120);
  const notes = clean(payload?.notes, 500);
  const peopleRaw = payload?.people;
  const people = peopleRaw != null && peopleRaw !== "" ? Math.max(1, Math.floor(Number(peopleRaw)) || 1) : null;

  if (!name || !phone || !service || !location) {
    return json({ error: "Name, phone, service and location are required." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
    return json({ error: "A valid event date is required." }, 400);
  }
  const phoneDigits = phone.replace(/[^\d]/g, "");
  const phone10 =
    phoneDigits.length === 10
      ? phoneDigits
      : phoneDigits.length === 12 && phoneDigits.startsWith("91")
      ? phoneDigits.slice(2)
      : null;
  if (!phone10 || !/^[6-9]\d{9}$/.test(phone10)) {
    return json({ error: "Please enter a valid 10-digit Indian mobile number." }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO bookings (name, phone, service, event_date, location, people, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
  )
    .bind(name, `+91${phone10}`, service, eventDate, location, people, notes || null)
    .run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
