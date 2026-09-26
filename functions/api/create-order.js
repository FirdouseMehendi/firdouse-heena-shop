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

  // --- Validate customer details before we ever touch Razorpay -----------------
  const customerName = clean(customer.name, 120);
  if (customerName.length < 2) {
    return json({ error: "Please enter your full name." }, 400);
  }
  const phoneDigits = String(customer.phone ?? "").replace(/[^\d]/g, "");
  const phone10 =
    phoneDigits.length === 10
      ? phoneDigits
      : phoneDigits.length === 12 && phoneDigits.startsWith("91")
      ? phoneDigits.slice(2)
      : null;
  if (!phone10 || !/^[6-9]\d{9}$/.test(phone10)) {
    return json({ error: "Please enter a valid 10-digit Indian mobile number." }, 400);
  }
  const customerAddress = clean(customer.address, 400);
  if (customerAddress.length < 12) {
    return json({ error: "Please enter your full delivery address." }, 400);
  }
  const customerCity = clean(customer.city, 80);
  if (customerCity.length < 2) {
    return json({ error: "Please enter your city." }, 400);
  }
  const customerPincode = clean(customer.pincode, 10);
  if (!/^\d{6}$/.test(customerPincode)) {
    return json({ error: "Please enter a valid 6-digit PIN code." }, 400);
  }

  // --- Cross-check PIN code against city/state using India Post's public
  // lookup, so a real (but mismatched) city/state/pincode combo gets caught.
  // If the lookup service itself is unreachable, we don't block the order on
  // a third-party outage - we just skip this specific check.
  try {
    const pinRes = await fetch(`https://api.postalpincode.in/pincode/${customerPincode}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (pinRes.ok) {
      const pinData = await pinRes.json();
      const status = pinData?.[0]?.Status;
      if (status === "Error" || status === "404") {
        return json({ error: "We couldn't find that PIN code. Please check it and try again." }, 400);
      }
      if (status === "Success") {
        const offices = pinData[0].PostOffice || [];
        if (offices.length === 0) {
          return json({ error: "We couldn't find that PIN code. Please check it and try again." }, 400);
        }
        const cityLower = customerCity.toLowerCase();
        const stateLower = clean(customer.state, 60).toLowerCase();
        const stateOk = offices.some((o) => (o.State || "").toLowerCase() === stateLower);
        const cityOk = offices.some((o) => {
          const district = (o.District || "").toLowerCase();
          const name = (o.Name || "").toLowerCase();
          return district.includes(cityLower) || cityLower.includes(district) || name.includes(cityLower) || cityLower.includes(name);
        });
        if (!stateOk || !cityOk) {
          return json(
            { error: `Your city/state don't match PIN code ${customerPincode} (expected near ${offices[0].District}, ${offices[0].State}). Please check your address.` },
            400
          );
        }
      }
      // Any other status (unexpected shape) falls through without blocking.
    }
  } catch {
    // Lookup service unreachable - proceed without this specific check.
  }

  // --- Recompute the total from the trusted price list -----------------------
  let amountPaise = 0;
  const lines = [];
  const cartLines = [];
  for (const item of items) {
    const product = byId.get(item?.id);
    const qty = Math.floor(Number(item?.qty));
    const size = Math.floor(Number(item?.size));
    if (!product) {
      return json({ error: `Product "${clean(item?.id, 60)}" is no longer available.` }, 400);
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      return json({ error: `Invalid quantity for "${product.title}".` }, 400);
    }
    if (!Array.isArray(product.sizes) || !product.sizes.includes(size)) {
      return json({ error: `Invalid pack size for "${product.title}".` }, 400);
    }
    if (typeof product.stockUnits === "number" && size * qty > product.stockUnits) {
      return json({ error: `Not enough stock for "${product.title}".` }, 400);
    }
    const unitRupees = product.priceOverrides && product.priceOverrides[size] != null
      ? Number(product.priceOverrides[size])
      : Number(product.ratePerUnit) * size;
    amountPaise += Math.round(unitRupees * 100) * qty;
    const sizeLabel = product.sizeLabels && product.sizeLabels[size] != null ? product.sizeLabels[size] : `${size}${product.unit}`;
    lines.push(`${qty}x ${product.title} (${sizeLabel})`);
    cartLines.push({ product, size, qty });
  }

  // --- Shipping ------------------------------------------------------------------
  // Per-kg rate by the customer's state/zone (Karnataka cheapest, then South
  // India, remote/Northeast dearest, everything else at the default rate),
  // multiplied by the order's real weight. Real weight = selected size/volume
  // (for weight-based products) plus each product's own packagingGrams,
  // rounded to the nearest kg (min 1kg once the cart is non-empty).
  const customerState = clean(customer.state, 60).toLowerCase();
  if (!customerState) {
    return json({ error: "Please enter your state so we can calculate shipping." }, 400);
  }
  const zones = Array.isArray(site?.shipping?.zones) ? site.shipping.zones : [];
  const matchedZone = zones.find((zone) =>
    (zone.states || []).some((z) => customerState.includes(z) || z.includes(customerState))
  );
  const ratePerKg = matchedZone ? Number(matchedZone.ratePerKg) || 0 : Number(site?.shipping?.defaultRatePerKg) || 0;

  let cartWeightGrams = 0;
  cartLines.forEach((line) => {
    const isWeightBased = line.product.unit === "g" || line.product.unit === "ml";
    const perUnitGrams = (isWeightBased ? line.size : 0) + (Number(line.product.packagingGrams) || 0);
    cartWeightGrams += perUnitGrams * line.qty;
  });
  const cartWeightKg = cartWeightGrams / 1000;
  const weightTier = cartWeightKg > 0 ? Math.max(1, Math.round(cartWeightKg)) : 0;
  const shippingRupees = weightTier * ratePerKg;
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
      customer_name: customerName,
      phone: `+91${phone10}`,
      email: clean(customer.email, 120),
      address: clean(
        [customerAddress, customerCity, customer.state, customer.pincode]
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
