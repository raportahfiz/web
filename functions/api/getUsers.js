// Cloudflare Pages Functions (bukan Node). Endpoint: /api/getUsers
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (url.pathname !== "/api/getUsers") return new Response("Not Found", { status: 404, headers: CORS });

  const githubApiUrl = "https://api.github.com/repos/raportahfiz/server/contents/user.json";
  try {
    const res = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`, // set di Pages → Settings → Environment variables
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cf-pages-functions"
      }
    });
    if (!res.ok) {
      const msg = await res.text();
      return new Response(JSON.stringify({ error: "GitHub API error", status: res.status, msg }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }
    const data = await res.json();           // { content: "base64", ... }
    const jsonText = atob(data.content);     // decode base64 → string JSON
    return new Response(jsonText, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
}
