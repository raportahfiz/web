// functions/api/daftarNisWali.js
// Endpoint: POST /api/daftarNisWali
// Validasi admin via secureWali.json, lalu tambah user {username,password,kelas,nis} ke user.json

const DEFAULT_REPO   = "muqoddammtb/server";
const DEFAULT_BRANCH = "main";
const SECURE_PATH    = "secureWali.json";
const USERS_PATH     = "user.json";

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
  const TOKEN  = env.GITHUB_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ message: "MTQ_TOKEN belum diset." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ message: "Body harus JSON." }, 400); }

  const { username, password, kelas, nis, adminPassword } = body || {};
  if (!username || !password || !kelas || !nis || !adminPassword) {
    return json({ message: "Data tidak lengkap. (username, password, kelas, nis, adminPassword)" }, 400);
  }

  const mkUrl = (path, withRef = false) =>
    `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}${withRef ? `?ref=${encodeURIComponent(BRANCH)}` : ""}`;

  const ghHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cf-pages-daftarNisWali/1.0",
  };

  // 1) validasi admin (secureWali.json)
  const secRes = await fetch(mkUrl(SECURE_PATH, true), { headers: ghHeaders });
  if (!secRes.ok) {
    const t = await secRes.text().catch(() => "");
    return json({ source: "github", step: "get-secureWali", status: secRes.status, error: t }, 502);
  }
  const secMeta = await secRes.json();
  let realAdmin = "";
  try {
    const secObj = JSON.parse(b64decode(secMeta.content || ""));
    realAdmin = secObj?.adminPassword || "";
  } catch { return json({ message: "secureWali.json tidak valid." }, 500); }

  if (!realAdmin || adminPassword !== realAdmin) {
    return json({ message: "Password admin salah." }, 401);
  }

  // 2) ambil user.json
  const usrRes = await fetch(mkUrl(USERS_PATH, true), { headers: ghHeaders });
  if (!usrRes.ok) {
    const t = await usrRes.text().catch(() => "");
    return json({ source: "github", step: "get-users", status: usrRes.status, error: t }, 502);
  }
  const usrMeta = await usrRes.json();
  let users = [];
  try { users = JSON.parse(b64decode(usrMeta.content || "")) || []; } catch { users = []; }

  if (!Array.isArray(users)) users = [];

  // 3) cek duplikasi username
  if (users.some(u => u?.username === username)) {
    return json({ message: "Username sudah ada." }, 409);
  }

  // 4) tambahkan user baru
  users.push({
    username,
    password,               // NOTE: untuk keamanan, nanti sebaiknya hash (bcryptjs)
    kelas,
    nis,
  });

  // 5) simpan kembali
  const putRes = await fetch(mkUrl(USERS_PATH), {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Tambah user NIS ${username}`,
      content: b64encode(JSON.stringify(users, null, 2)),
      sha: usrMeta.sha,
      branch: BRANCH,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "");
    return json({ source: "github", step: "put-users", status: putRes.status, error: t }, 502);
  }

  return json({ message: "User NIS berhasil ditambahkan." }, 200);
}

export async function onRequest(ctx) {
  if (!["POST", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
