// /functions/api/appendAudioToMarks.js
// Endpoint: POST /api/appendAudioToMarks
// Body JSON: { id, kelas, tanggal(YYYY-MM-DD), filename }
// ENV: GITHUB_TOKEN (contents:read/write)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const BRANCH = "main";
const DIR = "absensi";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

// Base64 safe (UTF-8)
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str) => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
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
    return new Response(JSON.stringify({ success: false, error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Body bukan JSON valid." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const { id, kelas, tanggal, filename } = body || {};
  if (!id || !kelas || !tanggal || !filename) {
    return new Response(JSON.stringify({
      success: false,
      error: "Param id, kelas, tanggal, filename wajib ada",
    }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
  }

  const fileName = `${kelas}_${tanggal}.json`;
  const contentsUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    // 1) GET file absensi
    const getRes = await fetch(contentsUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

    if (getRes.status === 404) {
      return new Response(JSON.stringify({
        success: false,
        error: `File absensi ${fileName} belum ada`,
      }), { status: 404, headers: { "Content-Type": "application/json", ...CORS } });
    }

    if (!getRes.ok) {
      const text = await getRes.text().catch(() => "");
      return new Response(JSON.stringify({
        success: false,
        error: `Gagal ambil absensi (${getRes.status})`,
        detail: text.slice(0, 300),
      }), { status: getRes.status, headers: { "Content-Type": "application/json", ...CORS } });
    }

    const getJson = await getRes.json();
    const sha = getJson.sha;

    // Parse isi file
    let data = [];
    try {
      const contentStr = b64decode(getJson.content);
      data = JSON.parse(contentStr);
      if (!Array.isArray(data)) throw new Error("Format absensi bukan array");
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        error: `Gagal parse JSON absensi: ${e.message}`,
      }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }

    // 2) Cari santri by id
    const idx = data.findIndex((s) => s && s.id == id);
    if (idx === -1) {
      return new Response(JSON.stringify({
        success: false,
        error: "Santri tidak ditemukan pada file absensi",
      }), { status: 404, headers: { "Content-Type": "application/json", ...CORS } });
    }

    // 3) Pastikan marks.audio ada
    const santri = data[idx];
    if (typeof santri.marks !== "object" || santri.marks === null) santri.marks = {};
    if (!Array.isArray(santri.marks.audio)) santri.marks.audio = [];

    // 4) Tambah filename unik
    if (!santri.marks.audio.includes(filename)) {
      santri.marks.audio.push(filename);
    }

    // 5) Commit update
    const newContent = b64encode(JSON.stringify(data, null, 2));
    const putUrl =
      `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(DIR)}/${encodeURIComponent(fileName)}`;

    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(env.GITHUB_TOKEN),
      body: JSON.stringify({
        message: `Append audio for id=${id}: ${filename} (kelas=${kelas}, tanggal=${tanggal})`,
        content: newContent,
        sha,
        branch: BRANCH,
      }),
    });

    const putText = await putRes.text();
    let putJson = {};
    try { putJson = JSON.parse(putText); } catch {}

    if (!putRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: putJson?.message || `Gagal update absensi`,
        detail: putText.slice(0, 300),
      }), { status: putRes.status, headers: { "Content-Type": "application/json", ...CORS } });
    }

    return new Response(JSON.stringify({
      success: true,
      file: fileName,
      id, kelas, tanggal, filename,
      audioCount: santri.marks.audio.length,
      commit: putJson?.commit?.sha || null,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
