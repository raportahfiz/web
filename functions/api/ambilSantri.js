// /functions/api/ambilSantri.js
// Endpoint: GET /api/ambilSantri?kelas=1 atau ?kelas=kelas_1
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// Safe base64 → UTF-8
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
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const url = new URL(request.url);
  const kelasParam = url.searchParams.get("kelas");
  if (!kelasParam) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // Nama file: "kelas_1.json" atau "kelas_A1.json"
  const kelasFile = kelasParam.toLowerCase().startsWith("kelas_")
    ? `${kelasParam}.json`
    : `kelas_${kelasParam}.json`;

  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(kelasFile)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const response = await fetch(apiUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    if (response.status === 404) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gagal fetch data (${response.status})`, detail: txt.slice(0, 200) }), {
        status: response.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const result = await response.json();

    let santriData = [];
    try {
      const decoded = b64decode(result.content || "");
      santriData = JSON.parse(decoded);
    } catch {
      santriData = [];
    }

    if (!Array.isArray(santriData)) santriData = [];

    return new Response(JSON.stringify(santriData), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
