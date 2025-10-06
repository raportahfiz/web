// /functions/api/getAyat.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export async function onRequest({ env, request }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const apiUrl = "https://api.github.com/repos/muqoddammtb/server/contents/getAyat.json";

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cf-pages-functions"
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Gagal fetch data: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const result = await response.json();

    // Decode base64 ke JSON string
    const decoded = atob(result.content);

    return new Response(decoded, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
