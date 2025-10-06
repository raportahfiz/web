// /functions/api/deleteSantri.js
// POST /api/deleteSantri
// Body JSON: { kelas: "kelas_01" | "01", identifier: "<id-atau-nis>" }
// ENV: GITHUB_TOKEN (contents:read/write)

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
  "User-Agent": "cf-pages-functions",
  "Content-Type": "application/json",
});

// base64 helpers (UTF-8 safe)
const dec = new TextDecoder();
const enc = new TextEncoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const b64encode = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const normKelasFile = (kelas) => {
  if (!kelas) return null;
  const s = String(kelas).trim();
  const name = s.toLowerCase().startsWith("kelas_") ? s : `kelas_${s}`;
  // batasi nama agar tidak ada traversal
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return `${name}.json`;
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "GITHUB_TOKEN belum diset di environment." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body bukan JSON valid." });
  }

  const { kelas, identifier } = body || {};
  if (!kelas || identifier == null) {
    return json(400, { error: "Parameter 'kelas' & 'identifier' wajib ada." });
  }

  const fileName = normKelasFile(kelas);
  if (!fileName) return json(400, { error: "Nama kelas tidak valid." });

  // GET contents (root repo)
  const getUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/` +
    `${encodeURIComponent(fileName)}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const getRes = await fetch(getUrl, { headers: ghHeaders(token) });

    if (getRes.status === 404) {
      return json(404, { error: `File ${fileName} tidak ditemukan.` });
    }
    if (!getRes.ok) {
      const msg = await getRes.text().catch(() => "");
      return json(getRes.status, { error: "Gagal ambil file", detail: msg.slice(0, 300) });
    }

    const fileData = await getRes.json(); // { content, sha, ... }
    const sha = fileData.sha || null;

    let santri = [];
    try {
      const decoded = b64decode(fileData.content || "");
      santri = JSON.parse(decoded || "[]");
    } catch {
      santri = [];
    }
    if (!Array.isArray(santri)) santri = [];

    // hapus by id or nis (longgar == seperti versi lama)
    const filtered = santri.filter((s) => s?.id != identifier && s?.nis != identifier);

    // jika tidak ada perubahan, tetap commit? → tidak perlu
    // tapi kita balikan success agar idempotent
    if (filtered.length === santri.length) {
      return json(200, { success: true, deleted: 0, note: "Tidak ada entry yang cocok." });
    }

    const newContent = b64encode(JSON.stringify(filtered, null, 2));

    // PUT update
    const putUrl =
      `https://api.github.com/repos/${OWNER_REPO}/contents/` +
      encodeURIComponent(fileName);

    const updateRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `Hapus santri ${identifier} dari ${fileName}`,
        content: newContent,
        sha,
        branch: BRANCH,
        committer: { name: "admin", email: "admin@local" }, // opsional, boleh dihapus
      }),
    });

    if (!updateRes.ok) {
      const msg = await updateRes.text().catch(() => "");
      return json(updateRes.status, { error: "Gagal update file", detail: msg.slice(0, 300) });
    }

    const js = await updateRes.json();

    return json(200, {
      success: true,
      deleted: String(identifier),
      commit: js?.commit?.sha || null,
      file: fileName,
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
}
