// Sends the order-confirmation email (customer) and a new-order alert (owner)
// through Brevo's transactional email API.
//
// Needs these Cloudflare Pages secrets/vars (skipped silently when missing,
// so a missing key can never break a paid order):
//   BREVO_API_KEY   - Brevo API key
//   MAIL_FROM       - sender address verified in Brevo
//   OWNER_EMAIL     - where the "new order" alert goes (optional)
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET - already used for payments

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function brevo(env, body) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("Brevo error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

function customerHtml(o, n, paymentId) {
  const items = String(n.items || "")
    .split(" | ")
    .filter(Boolean)
    .map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l)}</td></tr>`)
    .join("");
  const total = (o.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2a1f">
  <div style="text-align:center;padding:8px 0 4px">
    <img src="https://firdoseproducts.pages.dev/images/brand/logo.png" alt="Firdouse Mehendi Products" width="90" height="90" style="display:block;margin:0 auto 6px;border-radius:50%">
    <h2 style="color:#1f3d2b;margin:0">Firdouse Mehendi Products</h2>
  </div>
  <p style="font-size:18px;margin:16px 0 4px">Thank you, ${esc(n.customer_name)}! Your order is confirmed.</p>
  <p style="color:#555;margin:0 0 16px">We have received your payment and will pack your order soon.</p>
  <div style="background:#f3f6ee;border-radius:10px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:26px;font-weight:bold">&#8377;${total}</div>
    <div style="color:#2e7d32">Paid successfully</div>
    <div style="font-size:13px;color:#555;margin-top:6px">Payment ID: ${esc(paymentId)}<br>Order ID: ${esc(o.id)}</div>
  </div>
  <h3 style="margin:0 0 6px">Your items</h3>
  <table style="width:100%;border-collapse:collapse">${items}</table>
  <p style="margin:8px 0">Shipping: ${esc(n.shipping)}</p>
  <h3 style="margin:16px 0 6px">Delivery details</h3>
  <p style="margin:0">${esc(n.customer_name)}<br>${esc(n.address)}<br>Phone: ${esc(n.phone)}${n.alt_phone ? `<br>Alt phone: ${esc(n.alt_phone)}` : ""}</p>
  ${n.order_notes ? `<p><b>Your note:</b> ${esc(n.order_notes)}</p>` : ""}
  <p style="margin-top:16px">Dispatch: 2-4 business days. Delivery: 3-8 business days. We will message you the tracking details once it ships.</p>
  <p style="color:#555;font-size:13px;margin-top:20px">Questions? Reply to this email or DM us on Instagram @firdousemehendiproducts.</p>
</div>`;
}

export async function sendOrderEmails(env, { orderId, paymentId }) {
  try {
    if (!env.BREVO_API_KEY || !env.MAIL_FROM || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return;
    const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: auth } });
    if (!res.ok) return;
    const o = await res.json();
    const n = o.notes || {};
    const sender = { name: "Firdouse Mehendi Products", email: env.MAIL_FROM };

    if (n.email) {
      await brevo(env, {
        sender,
        to: [{ email: n.email, name: n.customer_name || undefined }],
        replyTo: { email: env.OWNER_EMAIL || env.MAIL_FROM },
        subject: "Your Firdouse Mehendi order is confirmed",
        htmlContent: customerHtml(o, n, paymentId),
      });
    }
    if (env.OWNER_EMAIL) {
      const total = (o.amount / 100).toFixed(2);
      await brevo(env, {
        sender,
        to: [{ email: env.OWNER_EMAIL }],
        subject: `New order: Rs ${total} from ${n.customer_name || "customer"}`,
        htmlContent: `<div style="font-family:Arial,sans-serif"><h3>New paid order</h3>
          <p><b>Rs ${total}</b> - ${esc(paymentId)}</p>
          <p>${esc(n.items).split(" | ").join("<br>")}<br>Shipping: ${esc(n.shipping)}</p>
          <p><b>${esc(n.customer_name)}</b><br>${esc(n.address)}<br>Phone: ${esc(n.phone)}${n.alt_phone ? `<br>Alt: ${esc(n.alt_phone)}` : ""}<br>Email: ${esc(n.email)}</p>
          ${n.order_notes ? `<p>Note: ${esc(n.order_notes)}</p>` : ""}</div>`,
      });
    }
  } catch (e) {
    console.error("order email failed", e);
  }
}
