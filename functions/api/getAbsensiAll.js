// /functions/api/getAbsensiAll.js
// GET /api/getAbsensiAll?kelas=kelas_02[&ref=main]
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const DEFAULT_BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// base64 → UTF-8 safe
const dec = new TextDecoder();
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const url = new URL(request.url);
  const kelas = url.searchParams.get("kelas");
  const ref   = url.searchParams.get("ref") || DEFAULT_BRANCH;

  if (!kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const fileName = `${kelas}.json`;
  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/` +
    `${encodeURIComponent("absensi")}/${encodeURIComponent(fileName)}` +
    `?ref=${encodeURIComponent(ref)}`;

  try {
    const gh = await fetch(apiUrl, {
      headers: ghHeaders(env.GITHUB_TOKEN),
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    if (gh.status === 404) {
      // file agregat belum ada → anggap kosong
      return new Response(JSON.stringify([]), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    if (!gh.ok) {
      const msg = await gh.text().catch(() => "");
      return new Response(JSON.stringify({
        error: "Gagal mengambil data",
        status: gh.status,
        detail: msg.slice(0, 300)
      }), {
        status: gh.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const payload = await gh.json();            // { content: "base64", ... }
    const decoded = b64decode(payload.content); // string JSON

    return new Response(decoded, {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
