// functions/api/changePassword.js
// Cloudflare Pages Functions (ESM). Endpoint: /api/changePassword

// ====== Konfigurasi (bisa dioverride lewat Environment Variables) ======
const DEFAULT_REPO = "raportahfiz/server"; // repo owner/name
const DEFAULT_PATH = "user.json";              // path file di repo

// ====== Util base64 (tanpa Buffer) ======
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str) => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

// ====== Helper respons JSON + CORS ======
const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

// ====== CORS preflight ======
export const onRequestOptions = () => json({}, 204);

// ====== Handler utama (POST) ======
export async function onRequestPost({ request, env }) {
  // Ambil env & rakit endpoint GitHub
  const TOKEN = env.GITHUB_TOKEN;
  const REPO  = env.GITHUB_REPO || DEFAULT_REPO;
  const PATH  = env.GITHUB_PATH || DEFAULT_PATH;
  const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(PATH)}`;

  if (!TOKEN) {
    return json({ source: "cf", message: "GITHUB_TOKEN belum diset di Environment Variables." }, 500);
  }

  // Validasi body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ source: "cf", message: "Body harus JSON." }, 400);
  }
  const { username, oldPassword, newPassword } = body || {};
  if (!username || !oldPassword || !newPassword) {
    return json({ source: "cf", message: "Username, password lama, dan password baru wajib diisi." }, 400);
  }

  // 1) GET konten user.json
  const getRes = await fetch(GITHUB_API, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cf-pages-change-password/1.1",
    },
  });

  if (!getRes.ok) {
    const errText = await getRes.text().catch(() => "");
    // Jangan teruskan 403 mentah; kembalikan 502 + detail agar mudah debug di browser
    return json({
      source: "github",
      step: "get",
      status: getRes.status,
      statusText: getRes.statusText,
      message: "Gagal mengambil user.json dari GitHub",
      error: errText,
      hint: "Pastikan PAT mengizinkan Repository contents: Read & Write dan akses ke repo privat bila ada.",
    }, 502);
  }

  const meta = await getRes.json();
  let users = [];
  try {
    users = JSON.parse(b64decode(meta.content || ""));
  } catch {
    return json({ source: "cf", message: "Format user.json tidak valid (bukan JSON array)." }, 500);
  }

  if (!Array.isArray(users)) {
    return json({ source: "cf", message: "Format user.json harus berupa array user." }, 500);
  }

  // 2) Verifikasi user & update password
  const idx = users.findIndex(u => u?.username === username && u?.password === oldPassword);
  if (idx === -1) {
    return json({ source: "cf", message: "Username atau password lama salah." }, 401);
  }

  users[idx] = { ...users[idx], password: newPassword };

  // 3) PUT update ke GitHub (Contents API)
  const putRes = await fetch(GITHUB_API, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "cf-pages-change-password/1.1",
    },
    body: JSON.stringify({
      message: `Ganti password untuk ${username}`,
      content: b64encode(JSON.stringify(users, null, 2)),
      sha: meta.sha, // wajib saat update
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    return json({
      source: "github",
      step: "put",
      status: putRes.status,
      statusText: putRes.statusText,
      message: "Gagal menyimpan perubahan ke GitHub",
      error: errText,
      hint: "Periksa scope token (Contents: Write), proteksi branch, atau rules lainnya.",
    }, 502);
  }

  return json({ message: "Password berhasil diubah." }, 200);
}

// ====== Guard method lain (hindari 403 bawaan) ======
export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") {
    return json({ message: "Method Not Allowed" }, 405);
  }
  // biarkan onRequestPost/onRequestOptions yang menangani
}
