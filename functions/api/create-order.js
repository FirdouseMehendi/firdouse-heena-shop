// POST /api/create-order
// Builds a Razorpay order from a trusted, server-side price list.
// The browser only sends product ids + quantities; prices are never trusted from the client.
//
// Env vars (set in Cloudflare Pages dashboard -> Settings -> Environment variables,
// and in .dev.vars for local `wrangler pages dev`):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

import products from "../../public/data/products.json";
import site from "../../public/data/site.json";

const byId = new Map(products.map((p) => [p.id, p]));

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function b64(str) {
  // btoa is available in the Cloudflare Workers runtime.
  return btoa(str);
}

function clean(str, max = 200) {
  return String(str ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function onRequestPost({ request, env }) {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return json(
      {
        error:
          "Preview mode: the shop works, but online payments switch on once your Razorpay keys are added (see README, steps 3 & 6).",
      },
      503
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const customer = payload?.customer ?? {};

  if (items.length === 0) {
    return json({ error: "Your cart is empty." }, 400);
  }

  // --- Recompute the total from the trusted price list -----------------------
  let amountPaise = 0;
  const lines = [];
  for (const item of items) {
    const product = byId.get(item?.id);
    const qty = Math.floor(Number(item?.qty));
    if (!product) {
      return json({ error: `Product "${clean(item?.id, 60)}" is no longer available.` }, 400);
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      return json({ error: `Invalid quantity for "${product.title}".` }, 400);
    }
    if (typeof product.stock === "number" && qty > product.stock) {
      return json({ error: `Only ${product.stock} left of "${product.title}".` }, 400);
    }
    amountPaise += Math.round(product.price * 100) * qty;
    lines.push(`${qty}x ${product.title}`);
  }

  // --- Shipping ------------------------------------------------------------------
  const subtotalRupees = amountPaise / 100;
  const freeAbove = Number(site?.shipping?.freeAbove ?? 0);
  const flatRate = Number(site?.shipping?.flatRate ?? 0);
  const shippingRupees = freeAbove && subtotalRupees >= freeAbove ? 0 : flatRate;
  amountPaise += Math.round(shippingRupees * 100);

  if (amountPaise < 100) {
    return json({ error: "Order total is too low to process." }, 400);
  }

  // --- Create the Razorpay order ----------------------------------------------
  const orderBody = {
    amount: amountPaise,
    currency: site?.currency || "INR",
    receipt: `rcpt_${Date.now()}`,
    notes: {
      customer_name: clean(customer.name, 120),
      phone: clean(customer.phone, 20),
      email: clean(customer.email, 120),
      address: clean(
        [customer.address, customer.city, customer.state, customer.pincode]
          .filter(Boolean)
          .join(", "),
        400
      ),
      order_notes: clean(customer.notes, 300),
      items: clean(lines.join(" | "), 480),
      shipping: `₹${shippingRupees}`,
    },
  };

  let rzpRes;
  try {
    rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + b64(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`),
        "content-type": "application/json",
      },
      body: JSON.stringify(orderBody),
    });
  } catch {
    return json({ error: "Could not reach the payment provider. Please retry." }, 502);
  }

  const data = await rzpRes.json().catch(() => ({}));
  if (!rzpRes.ok) {
    // Log the real reason server-side; return a safe message to the browser.
    console.error("Razorpay order error", rzpRes.status, data);
    return json({ error: "Payment provider rejected the order. Please retry." }, 502);
  }

  return json({
    order_id: data.id,
    amount: data.amount,
    currency: data.currency,
    key_id: RAZORPAY_KEY_ID,
    lines,
    shipping: shippingRupees,
  });
}

// GET (and other non-POST verbs fall through to Pages' default 405)
export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
