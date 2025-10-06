// /functions/api/getAudio.js
// Endpoint: GET /api/getAudio?file=<nama_file>  (contoh: ?file=abc.mp3)
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

const OWNER_REPO = "raportahfiz/server";
const BRANCH = "main";
const DIR = "audio";

// simple mime map
const mimeOf = (name = "") => {
  const ext = String(name).split(".").pop()?.toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";     // opsional
  if (ext === "aac") return "audio/aac";     // opsional
  return "application/octet-stream";
};

const ghHeaders = (token, range) => {
  const h = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "cf-pages-functions",
  };
  if (range) h.Range = range; // dukung partial content
  return h;
};

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  if (!env.GITHUB_TOKEN) {
    return new Response("GITHUB_TOKEN belum diset.", { status: 500, headers: CORS });
  }

  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  if (!file) {
    return new Response(JSON.stringify({ error: "Query 'file' wajib diisi" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Hindari path traversal
  if (file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new Response(JSON.stringify({ error: "Nama file tidak valid" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const mime = mimeOf(file);
  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/` +
    `${encodeURIComponent(DIR)}/${encodeURIComponent(file)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const range = request.headers.get("Range"); // dukung seek
    const gh = await fetch(apiUrl, {
      headers: ghHeaders(env.GITHUB_TOKEN, range),
      redirect: "follow",
    });

    if (gh.status === 404) {
      return new Response(JSON.stringify({ error: "File tidak ditemukan" }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (!gh.ok && gh.status !== 206) {
      const txt = await gh.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gagal fetch audio (${gh.status})`, detail: txt.slice(0,300) }), {
        status: gh.status, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Stream body langsung dari GitHub → client
    // Pertahankan header penting untuk audio streaming
    const headers = new Headers(CORS);
    headers.set("Content-Type", mime);
    // forward beberapa header jika tersedia
    const forward = ["content-length", "accept-ranges", "content-range", "etag", "last-modified", "cache-control"];
    forward.forEach((k) => {
      const v = gh.headers.get(k);
      if (v) headers.set(k.replace(/\b\w/g, c => c.toUpperCase()), v); // optional: biarkan huruf apa adanya
      if (v) headers.set(k, v); // pastikan versi lower-case juga ada
    });

    // status bisa 200 OK atau 206 Partial Content jika ada header Range
    const status = gh.status === 206 ? 206 : 200;

    return new Response(gh.body, { status, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}
