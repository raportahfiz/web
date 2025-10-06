// /functions/api/getKelas.js
// GET /api/getKelas?kelas=kelas_01
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const BRANCH = "main";

// Headers GitHub API
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
  // CORS preflight
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

  const url = new URL(request.url);
  const kelas = url.searchParams.get("kelas");

  if (!kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib diisi." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/` +
    `${encodeURIComponent(kelas)}.json?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const response = await fetch(apiUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    if (response.status === 404) {
      // file tidak ada → kembalikan array kosong
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (!response.ok) {
      const msg = await response.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Gagal fetch data (${response.status}).`,
          detail: msg.slice(0, 300),
        }),
        { status: response.status, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const result = await response.json(); // { content: "base64", ... }
    let decoded = "[]";
    try {
      decoded = b64decode(result.content || "") || "[]";
    } catch {
      decoded = "[]";
    }

    return new Response(decoded, {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error?.message || error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
}
