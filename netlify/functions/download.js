// netlify/functions/download.js
import crypto from "crypto";

const b64urlToBuf = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Bad token");

  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const check = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  if (check !== sig) throw new Error("Signature mismatch");

  const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Expired token");
  }
  return payload;
}

export default async (req, context) => {
  const { DEMO_ASSET_URL, TOKEN_SECRET } = process.env;
  if (!DEMO_ASSET_URL || !TOKEN_SECRET) {
    return new Response("Server not configured", { status: 500 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  try {
    verify(token, TOKEN_SECRET);
    // If valid, redirect (302) to the asset.
    return Response.redirect(DEMO_ASSET_URL, 302);
  } catch (e) {
    return new Response("Invalid or expired link.", { status: 401 });
  }
};
