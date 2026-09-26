// POST /api/log-order — logs a completed (verified) payment to D1 for the admin dashboard.
// Called by the client right after /api/verify-payment succeeds. This is a record-keeping
// log only — it never determines or changes the charged amount (that's create-order.js).
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

  const razorpayOrderId = clean(payload?.razorpay_order_id, 100);
  const razorpayPaymentId = clean(payload?.razorpay_payment_id, 100);
  const amountPaise = Math.floor(Number(payload?.amount_paise)) || 0;
  if (!razorpayOrderId || !razorpayPaymentId) return json({ ok: false }, 200);

  const itemsJson = clean(JSON.stringify(payload?.items ?? []), 2000);
  const customerName = clean(payload?.customer_name, 120);
  const customerPhone = clean(payload?.customer_phone, 20);
  const customerEmail = clean(payload?.customer_email, 120);

  await env.DB.prepare(
    `INSERT INTO orders (razorpay_order_id, razorpay_payment_id, amount_paise, items_json, customer_name, customer_phone, customer_email)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(razorpayOrderId, razorpayPaymentId, amountPaise, itemsJson, customerName || null, customerPhone || null, customerEmail || null)
    .run()
    .catch(() => {});

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
