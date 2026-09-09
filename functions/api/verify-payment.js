// POST /api/verify-payment
// Verifies the Razorpay payment signature so we know the success callback is genuine.
//   expected = HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)
// Returns { ok: true } only when expected === razorpay_signature.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Length-safe, constant-time-ish string compare.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const { RAZORPAY_KEY_SECRET } = env;
  if (!RAZORPAY_KEY_SECRET) {
    return json({ ok: false, error: "Payments are not configured." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const orderId = String(payload?.razorpay_order_id || "");
  const paymentId = String(payload?.razorpay_payment_id || "");
  const signature = String(payload?.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) {
    return json({ ok: false, error: "Missing payment fields." }, 400);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(RAZORPAY_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${orderId}|${paymentId}`)
  );
  const expected = toHex(mac);

  if (!safeEqual(expected, signature)) {
    return json({ ok: false, error: "Signature mismatch." }, 400);
  }

  return json({ ok: true, payment_id: paymentId, order_id: orderId });
}

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed. Use POST." }, 405);
}
