export default async () => \{\
  const \{ MANUAL_URL \} = process.env;\
\
  if (!MANUAL_URL) \{\
    return new Response("Missing MANUAL_URL", \{ status: 500 \});\
  \}\
\
  return Response.redirect(MANUAL_URL, 302);\
\};}
