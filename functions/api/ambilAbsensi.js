// /functions/api/listAbsensiFiles.js
// Endpoint: GET /api/listAbsensiFiles
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "raportahfiz/server";
const BRANCH = "main";
const DIR = "absensi";

const GITHUB_API =
  `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}?ref=${encodeURIComponent(BRANCH)}`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ message: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  try {
    const res = await fetch(GITHUB_API, { headers: ghHeaders(env.GITHUB_TOKEN) });

    // Folder belum ada → anggap kosong
    if (res.status === 404) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    if (!res.ok) {
      const error = await res.text().catch(() => "");
      return new Response(JSON.stringify({ message: `Gagal fetch daftar absensi (${res.status})`, error }), {
        status: res.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const data = await res.json(); // array of items in /absensi
    const pattern = /^kelas_\w+_\d{4}-\d{2}-\d{2}\.json$/i;

    const absensiFiles = Array.isArray(data)
      ? data
          .filter((f) => f && typeof f.name === "string" && pattern.test(f.name))
          .map((f) => f.name)
          // (opsional) urutkan terbaru di atas:
          .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      : [];

    return new Response(JSON.stringify(absensiFiles), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ message: "Terjadi kesalahan server", error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
