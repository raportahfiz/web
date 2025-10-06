// /functions/api/createKelasFile.js
// POST /api/createKelasFile
// Body: { namaFile }  // contoh: "kelas_1.json" atau "kelas_A1.json"
// ENV: GITHUB_TOKEN (contents:write)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

// base64 UTF-8 safe
const enc = new TextEncoder();
const b64encode = (str) => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
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

  // Body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: "Body bukan JSON valid." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const { namaFile } = body || {};

  // Pilih salah satu regex:
  // Hanya angka:  const pattern = /^kelas_\d+\.json$/i;
  // Huruf/angka/underscore: 
  const pattern = /^kelas_\w+\.json$/i;

  if (!namaFile || !pattern.test(namaFile)) {
    return new Response(JSON.stringify({
      message: "Format nama file tidak valid. Gunakan 'kelas_<kode>.json' (contoh: kelas_1.json atau kelas_A1.json).",
    }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
  }

  const path = encodeURIComponent(namaFile);
  const checkUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`;
  const putUrl   = `https://api.github.com/repos/${OWNER_REPO}/contents/${path}`;

  try {
    // Cek sudah ada?
    const checkRes = await fetch(checkUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
    if (checkRes.ok) {
      return new Response(JSON.stringify({ message: "File sudah ada." }), {
        status: 409, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    if (checkRes.status !== 404) {
      const errText = await checkRes.text().catch(() => "");
      return new Response(JSON.stringify({ message: `Gagal cek file (${checkRes.status}).`, error: errText }), {
        status: checkRes.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    // Buat file baru: isi awal []
    const content = b64encode("[]");
    const createRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(env.GITHUB_TOKEN),
      body: JSON.stringify({
        message: `Buat file ${namaFile}`,
        content,
        branch: BRANCH,
      }),
    });

    const txt = await createRes.text();
    if (!createRes.ok) {
      return new Response(JSON.stringify({ message: `Gagal membuat file (${createRes.status}).`, detail: txt.slice(0, 300) }), {
        status: createRes.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    return new Response(JSON.stringify({ message: `File ${namaFile} berhasil dibuat.` }), {
      status: 201, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ message: "Terjadi kesalahan server.", error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
