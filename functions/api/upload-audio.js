// /functions/api/uploadAudio.js
// POST /api/uploadAudio
// Body JSON: { "fileName": "xx.mp3", "base64": "data:audio/mp3;base64,...", "folder": "audio" }
// ENV: GITHUB_TOKEN (atau fallback MTQ_TOKEN)
// Repo target: raportahfiz/server (branch: main)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "raportahfiz/server";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-upload-audio",
});

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Body harus JSON" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const fileName = String(body?.fileName || "").trim();
  const folderIn = String(body?.folder || "audio").trim() || "audio";
  const base64In = String(body?.base64 || "").trim();

  if (!fileName || !base64In) {
    return new Response(JSON.stringify({ success: false, error: "fileName dan base64 wajib ada" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // Bersihkan data URL prefix jika ada
  const cleanBase64 = base64In.replace(/^data:.*;base64,/, "");

  // Normalisasi path (hindari leading slash / traversal)
  const safeFolder = folderIn.replace(/^\/+/, "").replace(/\.\./g, "");
  const safeFile   = fileName.replace(/^\/+/, "").replace(/\.\./g, "");
  const path = `${safeFolder}/${safeFile}`;

  const baseUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}`;
  const getUrl = `${baseUrl}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    // Cek apakah file sudah ada (untuk ambil sha)
    let sha = null;
    const headRes = await fetch(getUrl, { headers: ghHeaders(token) });
    if (headRes.ok) {
      const js = await headRes.json();
      sha = js?.sha || null;
    } else if (headRes.status !== 404) {
      const t = await headRes.text().catch(() => "");
      return new Response(JSON.stringify({ success: false, error: `Cek file gagal: ${headRes.status}`, detail: t.slice(0,300) }), {
        status: 502, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    // PUT create/update
    const putRes = await fetch(baseUrl, {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: sha ? `Update audio: ${safeFile}` : `Add audio: ${safeFile}`,
        content: cleanBase64,    // sudah base64
        sha: sha || undefined,
        branch: BRANCH,
      }),
    });

    const putText = await putRes.text();
    let putJson = {};
    try { putJson = JSON.parse(putText); } catch { /* biarkan */ }

    if (!putRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: putJson?.message || `Gagal upload audio (${putRes.status})`,
        detail: typeof putText === "string" ? putText.slice(0, 400) : undefined,
      }), { status: putRes.status, headers: { "Content-Type": "application/json", ...CORS } });
    }

    return new Response(JSON.stringify({
      success: true,
      path,
      commit: putJson?.commit?.sha || null,
      contentUrl: putJson?.content?.html_url || null,
    }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
