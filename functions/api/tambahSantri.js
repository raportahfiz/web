// functions/api/tambahSantri.js
// Endpoint: POST /api/tambahSantri

const DEFAULT_REPO   = "raportahfiz/server";
const DEFAULT_BRANCH = "main";

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

  if (!TOKEN) {
    return json({ error: "GITHUB_TOKEN tidak terpasang di environment." }, 500);
  }

  // --- Body & validasi dasar
  let payload = {};
  try { payload = await request.json(); }
  catch { return json({ error: "Body harus JSON." }, 400); }

  const { nama, semester, kelas, nis, jenjang = "" } = payload;

  if (!nama || !semester || !kelas || !nis) {
    return json({ error: "Parameter nama, semester, kelas, dan nis wajib diisi." }, 400);
  }
  if (!/^[1-6]$/.test(String(semester))) {
    return json({ error: "Semester harus 1-6." }, 400);
  }
  if (jenjang && !/^A[1-8]$/.test(String(jenjang))) {
    return json({ error: "Jenjang harus A1-A8 (atau kosong)." }, 400);
  }

  // --- Normalisasi nama file kelas
  const normKelas = (() => {
    const k = String(kelas).trim().replace(/-/g, "_");
    return k.startsWith("kelas_") ? k : `kelas_${k}`;
  })();
  const fileName = `${normKelas}.json`;

  const mkUrl = (withRef = false) =>
    `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(fileName)}${withRef ? `?ref=${encodeURIComponent(BRANCH)}` : ""}`;

  const ghHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cf-pages-tambahSantri/1.0",
  };

  // --- 1) Ambil file lama
  const getRes = await fetch(mkUrl(true), { headers: ghHeaders, method: "GET" });
  if (!getRes.ok) {
    const txt = await getRes.text().catch(() => "");
    return json({
      source: "github",
      step: "get",
      status: getRes.status,
      statusText: getRes.statusText,
      error: txt || "Gagal ambil roster kelas.",
      hint: `Pastikan file ${fileName} ada di branch ${BRANCH}`
    }, 502);
  }

  const fileData = await getRes.json();

  let santriList = [];
  try { santriList = JSON.parse(b64decode(fileData.content || "")); }
  catch { return json({ error: "Gagal parse JSON roster kelas." }, 500); }

  if (!Array.isArray(santriList)) {
    return json({ error: "Struktur roster tidak valid (bukan array)." }, 500);
  }

  // --- 2) Cegah duplikasi NIS
  const nisKey = String(nis).trim();
  if (santriList.some(s => String(s?.nis ?? "").trim() === nisKey)) {
    return json({ error: `NIS '${nis}' sudah ada.` }, 409);
  }

  // --- 3) Buat ID baru
  const currentMaxId = santriList.reduce((max, s) => {
    const n = Number(s?.id);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const nextId = currentMaxId + 1;

  // --- 4) Tambahkan item baru
  santriList.push({
    id: nextId,
    nis: nisKey,
    nama: String(nama).trim(),
    semester: String(semester).trim(),
    jenjang: String(jenjang).trim(),
  });

  // --- 5) Simpan kembali (PUT)
  const putRes = await fetch(mkUrl(false), {
    method: "PUT",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Menambahkan santri ${nama} (NIS ${nis}) ke ${fileName}`,
      content: b64encode(JSON.stringify(santriList, null, 2)),
      sha: fileData.sha,
      branch: BRANCH,
    }),
  });

  if (!putRes.ok) {
    const errorText = await putRes.text().catch(() => "");
    return json({
      source: "github",
      step: "put",
      status: putRes.status,
      statusText: putRes.statusText,
      error: errorText || "Gagal menyimpan perubahan."
    }, 502);
  }

  return json({ success: true, message: "Santri berhasil ditambahkan" }, 200);
}

export async function onRequest(ctx) {
  const m = ctx.request.method.toUpperCase();
  if (m !== "POST" && m !== "OPTIONS") return json({ message: "Method Not Allowed" }, 405);
}
