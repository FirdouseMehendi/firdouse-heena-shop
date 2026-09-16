// POST /api/order-care
// After a successful checkout, generates a short AI care/application plan
// personalized to the products the customer just bought. This is shown on
// the order-confirmed screen (not emailed — sending to arbitrary customer
// addresses needs a verified sending domain, which this shop doesn't have).
//
// Never blocks or fails the order: if anything goes wrong (no key, API
// error, bad input) it falls back to the static care tips instead of
// showing an error, since the payment has already succeeded by this point.

import products from "../../public/data/products.json";
import { CARE_TIPS } from "../_shared/care-tips.js";

const MODEL = "openai/gpt-oss-20b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const FALLBACK_TIPS =
  "Leave the paste on 6-8 hours for a darker stain, avoid water for the first 24 hours after removing it, and once dry, seal the design with a sugar-lemon mix or a dab of clove/eucalyptus oil.";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ tips: FALLBACK_TIPS });
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const bought = [];
  for (const item of items) {
    const product = byId.get(item?.id);
    const size = Math.floor(Number(item?.size));
    if (product && product.sizes.includes(size)) {
      bought.push(`${product.title} (${size}${product.unit})`);
    }
  }

  if (!bought.length) return json({ tips: FALLBACK_TIPS });

  const { GROQ_API_KEY } = env;
  if (!GROQ_API_KEY) return json({ tips: FALLBACK_TIPS });

  const prompt = `A customer just bought: ${bought.join(", ")}.

Care tips you can draw on:
${CARE_TIPS}

Write a short, warm 3-4 sentence personalized care/application plan for exactly what they bought (mention the products by name naturally). Plain prose only — no markdown, no headers, no bullet points.`;

  try {
    const apiRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 350,
      }),
    });
    const data = await apiRes.json().catch(() => ({}));
    const text = data.choices?.[0]?.message?.content?.trim();
    return json({ tips: text || FALLBACK_TIPS });
  } catch {
    return json({ tips: FALLBACK_TIPS });
  }
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
