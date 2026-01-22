// netlify/functions/send-demo.js  (or keep your existing filename)
import crypto from "crypto";

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

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const {
    RESEND_API_KEY,
    DEMO_ASSET_URL,
    MANUAL_URL,
    TOKEN_SECRET,
    TOKEN_TTL_HOURS = "24",
    FROM_EMAIL = "LatencyFix <no-reply@emails.latency-fix.com>",
    BRAND_NAME = "LatencyFix",
  } = process.env;

  if (!RESEND_API_KEY || !DEMO_ASSET_URL || !TOKEN_SECRET) {
    return new Response("Missing server configuration", { status: 500 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {}

  // 1) Honeypot check (ignore bots)
  if ((body["bot-field"] || "").trim() !== "") {
    // Pretend success to avoid tipping off bots
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // 2) Pull main fields
  const email = (body.email || "").trim();
  const name  = (body.name  || "").trim();

  if (!email) return new Response("Missing email", { status: 400 });

  // 3) Build expiring token
  const ttlHours = parseInt(String(TOKEN_TTL_HOURS), 10) || 72;
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const tokenPayload = { sub: email, exp, iss: "latencyfix", v: 1 };
  const token = sign(tokenPayload, TOKEN_SECRET);

  const siteURL = new URL(req.url);
  const origin = `${siteURL.protocol}//${siteURL.host}`;
  const downloadURL = `${origin}/.netlify/functions/download?token=${encodeURIComponent(token)}`;

  // 4) Compose email
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.5; color:#111">
    <p>Hi${name ? " " + name : ""},</p>
    <p>Thanks for requesting access to the <strong>${BRAND_NAME}</strong> demo.</p>
    <p>
      <a href="${downloadURL}" style="background:#9dbba7;color:#000;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block">
        Download the LatencyFix Demo Starter Kit (ZIP)
      </a><br/>
      <small>This link expires in ${ttlHours} hours.</small>
    </p>
    ${MANUAL_URL ? `<p>User Manual: <a href="${MANUAL_URL}">${MANUAL_URL}</a></p>` : ""}
    <hr style="border:none;border-top:1px solid #ddd;margin:16px 0"/>
    <p>If you didn’t request this, you can ignore this email.</p>
  </div>`.trim();

  // 5) Send with Resend
  const rsp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      reply_to: process.env.REPLY_TO || "contact@latency-fix.com",
      subject: `${BRAND_NAME} demo link`,
      html,
    }),
  });

  if (!rsp.ok) {
    const msg = await rsp.text().catch(() => "");
    return new Response(`Email send failed: ${msg}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
