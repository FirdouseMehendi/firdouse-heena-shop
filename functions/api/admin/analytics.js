// GET /api/admin/analytics — visits, cart activity and completed orders. Auth via _middleware.js.
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "Tracking storage isn't set up yet." }, 503);

  const [visits, cartEvents, orders, totals] = await Promise.all([
    env.DB.prepare("SELECT * FROM site_visits ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM cart_events ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM site_visits"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM cart_events"),
      env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_paise), 0) AS paise FROM orders"),
    ]),
  ]);

  return json({
    visits: visits.results,
    cartEvents: cartEvents.results,
    orders: orders.results.map((o) => ({ ...o, items: JSON.parse(o.items_json || "[]") })),
    totals: {
      visits: totals[0].results[0]?.n || 0,
      cartEvents: totals[1].results[0]?.n || 0,
      orders: totals[2].results[0]?.n || 0,
      revenuePaise: totals[2].results[0]?.paise || 0,
    },
  });
}
