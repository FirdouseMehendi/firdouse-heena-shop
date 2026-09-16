// POST /api/consult
// AI Henna Consultant: a shopping assistant grounded in the real product catalog
// and care-tip content, so it recommends actual products (never invented ones)
// and answers application/aftercare questions.
//
// Uses Groq's OpenAI-compatible API (free tier — get a key at console.groq.com,
// no credit card required).
//
// Env vars (set in Cloudflare Pages dashboard -> Settings -> Environment variables,
// and in .dev.vars for local `wrangler pages dev`):
//   GROQ_API_KEY

import products from "../../public/data/products.json";
import site from "../../public/data/site.json";
import { CARE_TIPS } from "../_shared/care-tips.js";

const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 800;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(str, max = MAX_MESSAGE_CHARS) {
  return String(str ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function catalogForPrompt() {
  return products
    .map((p) => {
      const priceLow = (p.ratePerUnit * Math.min(...p.sizes)).toFixed(0);
      const priceHigh = (p.ratePerUnit * Math.max(...p.sizes)).toFixed(0);
      return [
        `- id: ${p.id}`,
        `  title: ${p.title}`,
        `  category: ${p.category}`,
        `  sizes (${p.unit}): ${p.sizes.join(", ")}`,
        `  price range: ₹${priceLow}–₹${priceHigh}`,
        `  badges: ${p.badges?.join(", ") || "none"}`,
        `  description: ${p.description}`,
      ].join("\n");
    })
    .join("\n\n");
}

function systemPrompt() {
  return `You are the AI henna consultant for "${site.brand}" (${site.tagline}), a small online henna shop shipping across India (flat ₹${site.shipping?.flatRate ?? 59} shipping, prepaid only).

Your job: help a visitor pick the right product(s) for their occasion/skin/preferences, and answer henna application & aftercare questions.

PRODUCT CATALOG (the ONLY products that exist — never invent a product, id, price, or size not listed here):
${catalogForPrompt()}

CARE TIPS you can draw on:
${CARE_TIPS}

Rules:
- Keep replies short and warm (2-5 sentences), like a helpful shop assistant, not a wall of text.
- Only recommend products from the catalog above, by their exact id and a size that is actually in that product's sizes list.
- If nothing in the catalog fits the question (e.g. they ask for a product category we don't sell), say so honestly instead of forcing a recommendation.
- If you need more info to recommend well (e.g. occasion, DIY vs bought-for-an-artist, budget), ask ONE short clarifying question instead of guessing.
- Never make medical claims; for allergy/skin-condition questions, suggest a patch test and recommend they consult a doctor for anything medical.
- When you do recommend specific product(s), end your reply with a final line, on its own, starting with "RECOMMEND:" followed by a JSON array like RECOMMEND: [{"id":"bridal-henna-powder","size":250}]. Omit this line entirely if you are not recommending a specific product in this reply (e.g. you're just asking a clarifying question or answering a care question).`;
}

function extractRecommendations(text) {
  const match = text.match(/\nRECOMMEND:\s*(\[[\s\S]*\])\s*$/);
  if (!match) return { reply: text.trim(), recommendations: [] };

  const reply = text.slice(0, match.index).trim();
  let raw;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return { reply, recommendations: [] };
  }
  if (!Array.isArray(raw)) return { reply, recommendations: [] };

  const byId = new Map(products.map((p) => [p.id, p]));
  const recommendations = [];
  for (const item of raw) {
    const product = byId.get(item?.id);
    const size = Math.floor(Number(item?.size));
    if (product && product.sizes.includes(size)) {
      recommendations.push({ id: product.id, title: product.title, size, unit: product.unit });
    }
  }
  return { reply, recommendations };
}

export async function onRequestPost({ request, env }) {
  const { GROQ_API_KEY } = env;
  if (!GROQ_API_KEY) {
    return json(
      {
        error:
          "The AI henna consultant isn't switched on yet — add a GROQ_API_KEY (see README).",
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

  const message = clean(payload?.message);
  if (!message) {
    return json({ error: "Please type a question first." }, 400);
  }

  const historyIn = Array.isArray(payload?.history) ? payload.history : [];
  const history = historyIn
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: clean(m.content) }));

  const messages = [
    { role: "system", content: systemPrompt() },
    ...history,
    { role: "user", content: message },
  ];

  let apiRes;
  try {
    apiRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 400,
      }),
    });
  } catch {
    return json({ error: "Could not reach the AI consultant. Please retry." }, 502);
  }

  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) {
    console.error("Groq API error", apiRes.status, data);
    return json({ error: "The AI consultant is having trouble right now. Please retry." }, 502);
  }

  const text = (data.choices?.[0]?.message?.content || "").trim();

  if (!text) {
    return json({ error: "The AI consultant didn't respond. Please retry." }, 502);
  }

  const { reply, recommendations } = extractRecommendations(text);
  return json({ reply, recommendations });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
