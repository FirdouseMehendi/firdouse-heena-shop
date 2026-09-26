// POST /api/log-cart — logs an "added to cart" event to D1.
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

  const productId = clean(payload?.productId, 100);
  const productTitle = clean(payload?.productTitle, 200);
  const size = Math.floor(Number(payload?.size)) || 0;
  const qty = Math.floor(Number(payload?.qty)) || 0;
  if (!productId || !qty) return json({ ok: false }, 200);

  await env.DB.prepare(
    `INSERT INTO cart_events (product_id, product_title, size, qty) VALUES (?, ?, ?, ?)`
  )
    .bind(productId, productTitle, size, qty)
    .run()
    .catch(() => {});

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
