// netlify/functions/formspree-webhook.js
import crypto from "crypto";

// --- helpers: base64url, HMAC signing, token encode/decode ---
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

function sign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${data}.${sig}`;
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const {
    RESEND_API_KEY,
    DEMO_ASSET_URL,
    MANUAL_URL,
    TOKEN_SECRET,
    TOKEN_TTL_HOURS = "72",
    FROM_EMAIL = "no-reply@example.com",
    BRAND_NAME = "LatencyFix",
  } = process.env;

  if (!RESEND_API_KEY || !DEMO_ASSET_URL || !TOKEN_SECRET) {
    return new Response("Missing server configuration", { status: 500 });
  }

  const body = await req.json().catch(() => ({}));

  // Formspree typically sends fields under body with same names as your form's inputs
  const email = (body.email || "").trim();
  const name = (body.name || "").trim();

  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  // Build an expiring token (no DB): exp = now + TTL
  const ttlHours = parseInt(String(TOKEN_TTL_HOURS), 10) || 72;
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const tokenPayload = { sub: email, exp, iss: "latencyfix", v: 1 };
  const token = sign(tokenPayload, TOKEN_SECRET);

  const siteURL = new URL(req.url);
  // Root of site (e.g., https://yoursite.netlify.app)
  const origin = `${siteURL.protocol}//${siteURL.host}`;
  const downloadURL = `${origin}/.netlify/functions/download?token=${encodeURIComponent(token)}`;

  // Compose email (simple HTML)
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.5; color:#111">
    <p>Hi${name ? " " + name : ""},</p>
    <p>Thanks for requesting access to the <strong>${BRAND_NAME}</strong> demo.</p>
    <p>
      <a href="${downloadURL}" style="background:#9dbba7;color:#000;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block">
        Download your demo
      </a>
      <br/><small>This link expires in ${ttlHours} hours.</small>
    </p>
    <p>You can also download the User Manual here:<br/>
      <a href="${MANUAL_URL}">${MANUAL_URL}</a>
    </p>
    <hr style="border:none;border-top:1px solid #ddd;margin:16px 0"/>
    <p>If you didn’t request this, you can ignore this email.</p>
  </div>`.trim();

  // Send via Resend REST
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: `${BRAND_NAME} demo link`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const msg = await resendRes.text();
    return new Response(`Email send failed: ${msg}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
