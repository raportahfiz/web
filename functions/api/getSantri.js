// functions/api/getSantri.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url   = new URL(request.url);
  const kelas = url.searchParams.get("kelas");

  if (!kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // NOTE: path ini sesuai kode asalmu (root repo: <kelas>.json).
  // Kalau file-nya ada di folder lain, ubah saja path-nya.
  const apiUrl = `https://api.github.com/repos/raportahfiz/server/contents/${encodeURIComponent(kelas)}.json`;

  try {
    const gh = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cf-pages-functions",
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!gh.ok) {
      return new Response(JSON.stringify({ error: `Gagal fetch data: ${gh.status}` }), {
        status: gh.status,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const result  = await gh.json();        // { content: "base64", ... }
    const decoded = atob(result.content);   // base64 -> string JSON

    return new Response(decoded, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
