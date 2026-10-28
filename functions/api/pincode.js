// GET /api/pincode?pin=500001 — looks up city (district) and state for a PIN code.
// Proxied server-side because the public PIN API does not allow browser (CORS) calls.
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

export async function onRequestGet({ request }) {
  const pin = new URL(request.url).searchParams.get("pin") || "";
  if (!/^\d{6}$/.test(pin)) return json({ ok: false }, 400);
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    const office = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    if (!office) return json({ ok: false });
    return json({ ok: true, city: office.District || office.Name, state: office.State || "" });
  } catch {
    return json({ ok: false });
  }
}
