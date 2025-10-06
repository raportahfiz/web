// Cloudflare Pages Functions — POST /api/validateAdminPassword
// Body JSON: { password }
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "raportahfiz/server";
const BRANCH = "main";
const SECURE_PATH = "secure.json";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// Safe base64 decode (UTF-8)
const dec = new TextDecoder();
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ message: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: "Body bukan JSON valid." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const { password } = body || {};
  if (!password) {
    return new Response(JSON.stringify({ message: "Password wajib diisi." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const secureUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(SECURE_PATH)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const res = await fetch(secureUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
    if (res.status === 404) {
      return new Response(JSON.stringify({ message: "secure.json tidak ditemukan di repo." }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ message: `Gagal ambil secure.json (${res.status})`, error: text }), {
        status: res.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const json = await res.json();
    const decoded = b64decode(json.content || "");
    const secure = JSON.parse(decoded || "{}");

    if (secure.adminPassword !== password) {
      return new Response(JSON.stringify({ message: "Password admin salah." }), {
        status: 401, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    return new Response(JSON.stringify({ message: "Password admin valid." }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ message: "Terjadi kesalahan server.", error: String(err.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
