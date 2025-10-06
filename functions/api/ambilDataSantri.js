// /functions/api/getSantriList.js
// Endpoint: GET /api/getSantriList?kelas=A1
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "raportahfiz/server";
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
  const kelas = url.searchParams.get("kelas");
  if (!kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const fileName = `${kelas}.json`; // contoh: kelas_1.json
  const githubApiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const res = await fetch(githubApiUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    // Jika file kelas belum ada → kembalikan array kosong
    if (res.status === 404) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gagal ambil data GitHub (${res.status})`, detail: msg.slice(0,200) }), {
        status: res.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const fileData = await res.json();                 // { content: "base64", ... }
    const contentDecoded = b64decode(fileData.content || "");
    const santriList = JSON.parse(contentDecoded || "[]");

    return new Response(JSON.stringify(santriList), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
