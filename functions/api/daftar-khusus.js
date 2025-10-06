// functions/api/daftar-khusus.js
// Endpoint: /api/daftar-khusus  (POST)

const DEFAULT_REPO   = "muqoddammtb/server";
const DEFAULT_SECURE = "secure.json";
const DEFAULT_USERS  = "user.json";
const DEFAULT_BRANCH = "main";

// ---- base64 util (tanpa Buffer) ----
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

// ---- JSON response + CORS ----
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
  const SECURE = env.SECURE_PATH   || DEFAULT_SECURE;
  const USERS  = env.USER_PATH     || DEFAULT_USERS;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;

  if (!TOKEN) return json({ source: "cf", message: "GITHUB_TOKEN belum diset." }, 500);

  // Ambil body
  let payload;
  try { payload = await request.json(); }
  catch { return json({ source: "cf", message: "Body harus JSON." }, 400); }

  const { username, password, kelas, adminPassword } = payload || {};
  if (!username || !password || !adminPassword || !kelas || !Array.isArray(kelas) || kelas.length === 0) {
    return json({ source: "cf", message: "Data tidak lengkap. (username, password, adminPassword, kelas[])" }, 400);
  }

  const mkUrl = (path) => `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}`;
  const ghHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cf-pages-daftar-khusus/1.0",
  };

  // Step 1: GET secure.json → validasi admin
  const secRes = await fetch(mkUrl(SECURE), { headers: ghHeaders, method: "GET" });
  if (!secRes.ok) {
    const errText = await secRes.text().catch(() => "");
    return json({
      source: "github",
      step: "get-secure",
      status: secRes.status,
      statusText: secRes.statusText,
      message: `Gagal mengambil ${SECURE} dari GitHub.`,
      error: errText
    }, 502);
  }

  const secMeta = await secRes.json();
  let realAdminPassword = "";
  try {
    const secContent = JSON.parse(b64decode(secMeta.content || ""));
    realAdminPassword = secContent?.adminPassword || "";
  } catch {
    return json({ source: "cf", message: `${SECURE} tidak valid (bukan JSON).` }, 500);
  }

  if (!realAdminPassword || adminPassword !== realAdminPassword) {
    return json({ source: "cf", message: "Password admin salah." }, 401);
  }

  // Step 2: GET user.json
  const usrRes = await fetch(mkUrl(USERS), { headers: ghHeaders, method: "GET" });
  if (!usrRes.ok) {
    const errText = await usrRes.text().catch(() => "");
    return json({
      source: "github",
      step: "get-users",
      status: usrRes.status,
      statusText: usrRes.statusText,
      message: `Gagal mengambil ${USERS} dari GitHub.`,
      error: errText
    }, 502);
  }

  const usrMeta = await usrRes.json();
  let users = [];
  try { users = JSON.parse(b64decode(usrMeta.content || "")); }
  catch { return json({ source: "cf", message: `${USERS} tidak valid (bukan JSON array).` }, 500); }

  if (!Array.isArray(users)) {
    return json({ source: "cf", message: `${USERS} harus berupa array.` }, 500);
  }

  // Step 3: Cek duplikasi username
  if (users.some(u => u?.username === username)) {
    return json({ source: "cf", message: "Username sudah terdaftar." }, 409);
  }

  // Step 4: Tambahkan user baru
  const newUser = { username, password, kelas }; // NOTE: idealnya password di-hash
  users.push(newUser);

  // Step 5: PUT update user.json
  const putRes = await fetch(mkUrl(USERS), {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Tambah user ${username}`,
      content: b64encode(JSON.stringify(users, null, 2)),
      sha: usrMeta.sha,
      branch: BRANCH,
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    return json({
      source: "github",
      step: "put-users",
      status: putRes.status,
      statusText: putRes.statusText,
      message: `Gagal menyimpan ${USERS} ke GitHub.`,
      error: errText
    }, 502);
  }

  return json({ message: "User berhasil ditambahkan." }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") return json({ message: "Method Not Allowed" }, 405);
}
