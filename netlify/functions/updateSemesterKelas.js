// netlify/functions/updateSemesterKelas.js
// Update field "semester" untuk satu santri di kelas_{}.json (master) via GitHub Contents API

const API_BASE = "https://api.github.com/repos/mrdickymiswardi/server/contents";
const token = process.env.MTQ_TOKEN;
// Bisa diubah di Netlify env var. Default 12.
const MAX_SEMESTER = Number(process.env.MAX_SEMESTER || "888");

function ghHeaders() {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "netlify-fn-update-semester"
  };
}

function b64enc(str) { return Buffer.from(str, "utf8").toString("base64"); }
function b64dec(str) { return Buffer.from(str, "base64").toString("utf8"); }

// Normalisasi kunci: cari nis → id (string) → id (number)
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

    const key = String(body?.key ?? "").trim();           // NIS (prioritas) atau ID
    const semRaw = String(body?.semester ?? "").trim();   // bisa "7", 8, dst

    if (!key) {
      return { statusCode: 400, body: JSON.stringify({ error: "Field 'key' wajib." }) };
    }

    // Validasi: bilangan bulat 1..MAX_SEMESTER (default 12)
    const semNum = Number(semRaw);
    if (!Number.isInteger(semNum) || semNum < 1 || semNum > MAX_SEMESTER) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Semester harus 1-${MAX_SEMESTER}.` })
      };
    }
    const sem = String(semNum); // normalisasi jadi string angka

    // --- Ambil file master ---
    const filePath = encodeURIComponent(`${kelas}.json`);
    const getUrl = `${API_BASE}/${filePath}`;
    const getRes = await fetch(getUrl, { headers: ghHeaders() });

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

    // --- Cari santri dan update semester ---
    const idx = matchIndex(data, key);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: `Santri dengan key '${key}' tidak ditemukan.` }) };
    }

    data[idx].semester = sem;

    const newContent = JSON.stringify(data, null, 2);
    const putBody = {
      message: `chore: update semester (${kelas}) key=${key} -> ${sem}`,
      content: b64enc(newContent),
      sha
    };

    // --- Simpan ke GitHub ---
    const putRes = await fetch(getUrl, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      return { statusCode: putRes.status, body: t };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
