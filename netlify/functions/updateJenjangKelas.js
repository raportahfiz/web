// netlify/functions/updateJenjangKelas.js
// Update field "jenjang" untuk satu santri di kelas_{}.json via GitHub Contents API

const API_BASE = "https://api.github.com/repos/mrdickymiswardi/server/contents";
const token = process.env.MTQ_TOKEN;
// Satu knob untuk batas atas (0 = tanpa batas)
const JENJANG_MAX = Number(process.env.JENJANG_MAX ?? 888);

function ghHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "netlify-fn-update-jenjang",
  };
}

function b64enc(str) { return Buffer.from(str, "utf8").toString("base64"); }
function b64dec(str) { return Buffer.from(str, "base64").toString("utf8"); }

// Cari index santri: nis → id (string) → id (number)
function matchIndex(list, key) {
  if (!Array.isArray(list)) return -1;
  const keyStr = String(key ?? "").trim();
  if (!keyStr) return -1;

  let idx = list.findIndex(x => String(x?.nis ?? "").trim() === keyStr);
  if (idx !== -1) return idx;

  idx = list.findIndex(x => String(x?.id ?? "").trim() === keyStr);
  if (idx !== -1) return idx;

  if (!Number.isNaN(Number(keyStr))) {
    const keyNum = Number(keyStr);
    idx = list.findIndex(x => Number(x?.id) === keyNum);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Validasi server: "" (kosong) boleh, atau "A<number>" dengan batas sesuai ENV
function isValidJenjangServer(v, max = JENJANG_MAX) {
  const s = String(v ?? "").trim();
  if (!s) return true; // kosong = boleh (clear)
  const m = /^A(\d+)$/.exec(s);
  if (!m) return false;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return false; // minimal A1
  if (!max || max === 0) return true;             // 0 => tanpa batas atas
  return n <= max;
}

function jenjangRangeLabel() {
  return (!JENJANG_MAX || JENJANG_MAX === 0) ? "A1-A∞" : `A1-A${JENJANG_MAX}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }
    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ error: "MTQ_TOKEN tidak terpasang di environment." }) };
    }

    const kelas = (event.queryStringParameters?.kelas || "").trim(); // ex: kelas_1
    if (!kelas) {
      return { statusCode: 400, body: JSON.stringify({ error: "Parameter 'kelas' wajib." }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Body harus JSON." }) };
    }

    const key = String(body?.key ?? "").trim();
    const jen = String(body?.jenjang ?? "").trim();

    if (!key) {
      return { statusCode: 400, body: JSON.stringify({ error: "Field 'key' wajib." }) };
    }

    if (!isValidJenjangServer(jen)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Jenjang harus ${jenjangRangeLabel()} (atau kosong).` })
      };
    }

    // --- Ambil file master
    const filePath = `${encodeURIComponent(`${kelas}.json`)}`;
    const url = `${API_BASE}/${filePath}`;
    const getRes = await fetch(url, { headers: ghHeaders() });

    if (getRes.status === 404) {
      return { statusCode: 404, body: JSON.stringify({ error: `File ${kelas}.json tidak ditemukan.` }) };
    }
    if (!getRes.ok) {
      const t = await getRes.text();
      return { statusCode: getRes.status, body: t };
    }

    const file = await getRes.json();
    const sha  = file?.sha;
    const decoded = b64dec(file?.content || "");
    let data = [];
    try {
      data = JSON.parse(decoded);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal parse JSON kelas_{}.json." }) };
    }
    if (!Array.isArray(data)) {
      return { statusCode: 500, body: JSON.stringify({ error: "Struktur kelas_{}.json tidak valid (bukan array)." }) };
    }

    // --- Cari santri & patch jenjang
    const idx = matchIndex(data, key);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: `Santri dengan key '${key}' tidak ditemukan.` }) };
    }

    data[idx].jenjang = jen || ""; // kosongkan jika ingin clear

    const newContent = JSON.stringify(data, null, 2);
    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore: update jenjang (${kelas}) key=${key} -> ${jen || "(empty)"}`,
        content: b64enc(newContent),
        sha
      })
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      return { statusCode: putRes.status, body: t };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
