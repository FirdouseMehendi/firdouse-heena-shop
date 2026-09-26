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
      const priceAt = (size) =>
        p.priceOverrides && p.priceOverrides[size] != null ? p.priceOverrides[size] : p.ratePerUnit * size;
      const prices = p.sizes.map(priceAt);
      const priceLow = Math.min(...prices).toFixed(0);
      const priceHigh = Math.max(...prices).toFixed(0);
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

function bookingPrompt() {
  if (!site.booking?.enabled) return "";
  const services = site.booking.services?.join(", ") || "Bridal Mehendi";
  return `

You can also take BOOKING ENQUIRIES for in-person mehendi application (separate from mail-order products). Services offered: ${services}.

Booking rules:
- Collect these one or two at a time, conversationally: full name, phone number, service type, event date, event location (city/area), and number of people.
- ${site.booking.note}
- ${site.booking.leadTimeNote}
- You never invent availability, pricing, or confirm a booking — you only collect enquiry details for our artist to follow up on.
- Once you have ALL of: name, phone, service, event date, and location, restate the details back to the customer for confirmation, then end your reply with a final line, on its own, starting with "BOOKING:" followed by a JSON object like BOOKING: {"name":"Asha","phone":"9876543210","service":"Bridal Mehendi","eventDate":"2026-12-25","location":"Bangalore","people":2}. "people" is optional; omit it if not mentioned.
- Omit the BOOKING: line entirely if any required field (name, phone, service, eventDate, location) is still missing — ask for the missing one(s) instead.
- Never emit both a RECOMMEND: line and a BOOKING: line in the same reply.`;
}

function systemPrompt() {
  return `You are the AI henna consultant for "${site.brand}" (${site.tagline}), a small online henna shop shipping across India. Shipping is charged per kg of the order's weight, at a rate that depends on the customer's state/zone (₹80/kg within Karnataka, ₹100/kg for South India, ₹180/kg for remote/Northeast regions, ₹${site.shipping?.defaultRatePerKg ?? 130}/kg for the rest of India), prepaid only.

Your job: help a visitor pick the right product(s) for their occasion/skin/preferences, answer henna application & aftercare questions, and take booking enquiries for in-person mehendi appointments.

PRODUCT CATALOG (the ONLY products that exist — never invent a product, id, price, or size not listed here):
${catalogForPrompt()}

CARE TIPS you can draw on:
${CARE_TIPS}
${bookingPrompt()}

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

function extractBooking(text) {
  const match = text.match(/\nBOOKING:\s*(\{[\s\S]*\})\s*$/);
  if (!match) return { reply: text.trim(), booking: null };

  const reply = text.slice(0, match.index).trim();
  let raw;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return { reply, booking: null };
  }
  if (!raw || typeof raw !== "object") return { reply, booking: null };

  const name = clean(raw.name, 100);
  const phone = clean(raw.phone, 20);
  const service = clean(raw.service, 60);
  const eventDate = clean(raw.eventDate, 20);
  const location = clean(raw.location, 120);
  const people = raw.people != null ? Math.max(1, Math.floor(Number(raw.people)) || 1) : null;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && !Number.isNaN(Date.parse(eventDate));

  if (!name || !phone || !service || !location || !validDate) {
    return { reply, booking: null };
  }

  return { reply, booking: { name, phone, service, eventDate, location, people } };
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

  const { reply: replyAfterRecs, recommendations } = extractRecommendations(text);
  const { reply, booking } = extractBooking(replyAfterRecs);
  return json({ reply, recommendations, booking });
}

export async function onRequestGet() {
  return json({ error: "Method not allowed. Use POST." }, 405);
}
