// netlify/functions/manual.js
export default async () => {
  const { MANUAL_URL } = process.env;

  if (!MANUAL_URL) {
    return new Response("Missing MANUAL_URL", { status: 500 });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: MANUAL_URL },
  });
};
