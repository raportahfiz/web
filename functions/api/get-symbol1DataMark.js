// /functions/api/getSymbolsAndMap.js
// Endpoint: GET /api/getSymbolsAndMap
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const BRANCH = "main";

// Daftar file yang akan diambil dari GitHub Contents API
// owner/repo + path file dalam repo
const FILES = [
  { repo: "dickymiswardi/web",      path: "symbol1.json" },
  { repo: "dickymiswardi/tadabbur", path: "ayah_page_map.json" },
];

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

async function fetchContentJson({ repo, path, branch, token }) {
  const url =
    `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });

  if (res.status === 404) {
    // file tidak ada → kembalikan null agar caller bisa tangani parsial
    return { ok: false, status: 404, data: null };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, data: text.slice(0, 300) };
  }

  const j = await res.json(); // { content: "base64", ... }
  try {
    const decoded = b64decode(j.content || "");
    return { ok: true, status: 200, data: JSON.parse(decoded) };
  } catch (e) {
    return { ok: false, status: 422, data: `Invalid JSON in ${repo}/${path}` };
  }
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  try {
    const results = await Promise.all(
      FILES.map((f) => fetchContentJson({
        repo: f.repo, path: f.path, branch: BRANCH, token: env.GITHUB_TOKEN
      }))
    );

    // Map hasil ke variabel yang dibutuhkan
    const symbolRes = results[0];
    const mapRes    = results[1];

    // Jika salah satu gagal, balikan error yang spesifik
    if (!symbolRes.ok || !mapRes.ok) {
      return new Response(JSON.stringify({
        error: "Gagal mengambil sebagian/seluruh data.",
        details: [
          { file: `${FILES[0].repo}/${FILES[0].path}`, status: symbolRes.status, note: symbolRes.ok ? "ok" : symbolRes.data },
          { file: `${FILES[1].repo}/${FILES[1].path}`, status: mapRes.status,    note: mapRes.ok ? "ok" : mapRes.data },
        ],
      }), { status: 502, headers: { "Content-Type": "application/json", ...CORS } });
    }

    return new Response(JSON.stringify({
      symbol: symbolRes.data,
      ayahPageMap: mapRes.data,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
