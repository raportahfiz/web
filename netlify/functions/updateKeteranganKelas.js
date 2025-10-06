// netlify/functions/updateKeteranganKelas.js
// Update field "keterangan" untuk satu santri di kelas_{}.json via GitHub Contents API

const API_BASE = "https://api.github.com/repos/mrdickymiswardi/server/contents";
const token = process.env.MTQ_TOKEN;

function ghHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "netlify-fn-update-keterangan",
  };
}

function b64enc(str) { return Buffer.from(str, "utf8").toString("base64"); }
function b64dec(str) { return Buffer.from(str, "base64").toString("utf8"); }

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

    const key = String(body?.key ?? "").trim();
    const ket = String(body?.keterangan ?? "").trim();

    if (!key) {
      return { statusCode: 400, body: JSON.stringify({ error: "Field 'key' wajib." }) };
    }
    // VALIDASI: boleh kosong atau SP1..SP4
    if (ket && !/^SP[1-4]$/.test(ket)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Keterangan harus SP1-SP4 (atau kosong)." }) };
    }

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
    try { data = JSON.parse(decoded); }
    catch { return { statusCode: 500, body: JSON.stringify({ error: "Gagal parse JSON kelas_{}.json." }) }; }

    if (!Array.isArray(data)) {
      return { statusCode: 500, body: JSON.stringify({ error: "Struktur kelas_{}.json tidak valid (bukan array)." }) };
    }

    const idx = matchIndex(data, key);
    if (idx === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: `Santri dengan key '${key}' tidak ditemukan.` }) };
    }

    data[idx].keterangan = ket || ""; // izinkan kosong

    const newContent = JSON.stringify(data, null, 2);
    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore: update keterangan (${kelas}) key=${key} -> ${ket || '-'}`,
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
