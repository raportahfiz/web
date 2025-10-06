// functions/api/daftar-user.js
// Endpoint: /api/daftar-user  (POST)

const DEFAULT_REPO = "muqoddammtb/server";
const DEFAULT_PATH = "user.json";

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

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestPost({ request, env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO  = env.GITHUB_REPO || DEFAULT_REPO;
  const PATH  = env.GITHUB_PATH || DEFAULT_PATH;
  const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(PATH)}`;

  if (!TOKEN) return json({ source: "cf", message: "GITHUB_TOKEN belum diset." }, 500);

  // Ambil body
  let body;
  try { body = await request.json(); }
  catch { return json({ source: "cf", message: "Body harus JSON." }, 400); }

  const { username, password, akses_kelas, role } = body || {};
  if (!username || !password) {
    return json({ source: "cf", message: "Username dan password wajib diisi." }, 400);
  }

  // 1) GET user.json dari GitHub
  const getRes = await fetch(GITHUB_API, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cf-pages-daftar-user/1.0",
    },
  });

  if (!getRes.ok) {
    const errText = await getRes.text().catch(() => "");
    return json({
      source: "github",
      step: "get",
      status: getRes.status,
      statusText: getRes.statusText,
      message: "Gagal mengambil user.json dari GitHub.",
      error: errText
    }, 502);
  }

  const meta = await getRes.json();
  let users = [];
  try { users = JSON.parse(b64decode(meta.content || "")); }
  catch { return json({ source: "cf", message: "Format user.json tidak valid." }, 500); }

  if (!Array.isArray(users)) {
    return json({ source: "cf", message: "Format user.json harus array." }, 500);
  }

  // 2) Cek duplikasi username
  if (users.some(u => u?.username === username)) {
    return json({ source: "cf", message: "Username sudah terdaftar." }, 400);
  }

  // 3) Tambah user baru
  const userBaru = {
    username,
    password,                         // NOTE: untuk keamanan, sebaiknya hash (bisa pakai bcryptjs)
    akses_kelas: Array.isArray(akses_kelas) ? akses_kelas : [],
    role: role || "user"
  };
  users.push(userBaru);

  // 4) PUT update ke GitHub
  const putRes = await fetch(GITHUB_API, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "cf-pages-daftar-user/1.0",
    },
    body: JSON.stringify({
      message: `Tambah user ${username}`,
      content: b64encode(JSON.stringify(users, null, 2)),
      sha: meta.sha,
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    return json({
      source: "github",
      step: "put",
      status: putRes.status,
      statusText: putRes.statusText,
      message: "Gagal menyimpan ke GitHub.",
      error: errText
    }, 502);
  }

  return json({ message: "Pendaftaran berhasil!" }, 200);
}

// Guard method lain
export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") return json({ message: "Method Not Allowed" }, 405);
}
