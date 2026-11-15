// POST /api/log-visit — logs a page view (path + referrer) to D1.
// Fire-and-forget from the client; never blocks or errors visibly for the visitor.
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
  if (!env.DB) return json({ ok: false }, 200);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false }, 200);
  }

  const path = clean(payload?.path, 200) || "/";
  const referrer = clean(payload?.referrer, 300) || null;

  // Approximate location comes from Cloudflare's edge; the visitor's IP is never stored.
  const cf = request.cf || {};
  const country = clean(cf.country, 8) || null;
  const region = clean(cf.region, 80) || null;
  const city = clean(cf.city, 80) || null;

  await env.DB.prepare(`INSERT INTO site_visits (path, referrer, country, region, city) VALUES (?, ?, ?, ?, ?)`)
    .bind(path, referrer, country, region, city)
    .run()
    .catch(() =>
      // Location columns not migrated yet: still record the visit.
      env.DB.prepare(`INSERT INTO site_visits (path, referrer) VALUES (?, ?)`).bind(path, referrer).run().catch(() => {})
    );

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
