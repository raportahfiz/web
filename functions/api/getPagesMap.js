// /functions/api/getPagesMap.js
// GET /api/getPagesMap
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const FILE_PATH = "getPagesMap.json";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// base64 → UTF-8 aman
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  if (request.method !== "GET")
    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset di environment." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/` +
    `${encodeURIComponent(FILE_PATH)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const res = await fetch(apiUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    if (res.status === 404) {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Gagal fetch data (${res.status})`,
          detail: t.slice(0, 300),
        }),
        { status: res.status, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const json = await res.json(); // { content: "base64", ... }
    let decoded = "{}";
    try {
      decoded = b64decode(json.content || "") || "{}";
    } catch {
      decoded = "{}";
    }

    return new Response(decoded, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
}
