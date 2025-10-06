// netlify/functions/pindahRosterKelas.js
const OWNER_REPO = "mrdickymiswardi/server";
const BRANCH     = "main";
const API_BASE   = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});

const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;

const normKelas = (k) => (k && k.startsWith("kelas_") ? k : `kelas_${k}`);

async function readJsonFile(path, token) {
  const res = await fetch(withRef(`${API_BASE}/${path}`), { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, exists: false, sha: null, data: [] };
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=>"") };
  const json = await res.json();
  let arr = [];
  try { arr = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8")); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return { ok: true, exists: true, sha: json.sha, data: arr };
}

async function writeJsonFile(path, arrayData, token, sha = null, message = "update") {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(arrayData, null, 2)).toString("base64"),
    committer: { name: "admin", email: "admin@local" },
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${API_BASE}/${path}`, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=>"") };
  return { ok: true };
}

function collectUsedIdsNumeric(arr) {
  const set = new Set();
  for (const r of arr) {
    const n = parseInt((r.id ?? "").toString(), 10);
    if (Number.isInteger(n) && n > 0) set.add(String(n));
  }
  return set;
}
function allocNextIdGapFirst(usedSet) {
  let i = 1;
  while (usedSet.has(String(i))) i++;
  return String(i);
}
function sortByIdNumeric(arr) {
  return [...arr].sort((a, b) => {
    const ai = parseInt((a.id ?? 0), 10) || 0;
    const bi = parseInt((b.id ?? 0), 10) || 0;
    return ai - bi;
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }
    const token = process.env.MTQ_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ error: "MTQ_TOKEN tidak tersedia" }) };

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Body bukan JSON valid" }) };
    }

    let { kelasAsal, kelasTujuan, identifiers } = body;
    if (!kelasAsal || !kelasTujuan || !Array.isArray(identifiers) || identifiers.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Wajib: kelasAsal, kelasTujuan, identifiers[]" }) };
    }

    const asal = normKelas(kelasAsal);
    const tujuan = normKelas(kelasTujuan);
    const asalPath = `${asal}.json`;
    const tujuanPath = `${tujuan}.json`;

    const src = await readJsonFile(asalPath, token);
    if (!src.ok || !src.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: "File kelas asal tidak ditemukan" }) };
    }
    const dst = await readJsonFile(tujuanPath, token);
    if (!dst.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal baca kelas tujuan", detail: dst.error }) };
    }

    const cleanIds = identifiers.map(v => String(v ?? "").trim()).filter(Boolean);
    const idPick   = new Set(cleanIds);
    const nisPick  = new Set(cleanIds);
    const namePick = new Set(cleanIds.map(v => v.toLowerCase()));

    const match = (row) => {
      const id  = (row.id   ?? "").toString();
      const nis = (row.nis  ?? "").toString();
      const nmL = String(row.nama ?? "").toLowerCase();
      return idPick.has(id) || (nis && nisPick.has(nis)) || (nmL && namePick.has(nmL));
    };

    const toMove = src.data.filter(match);
    if (toMove.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "Santri tidak ditemukan di kelas asal" }) };
    }

    const dstArr = Array.isArray(dst.data) ? [...dst.data] : [];
    const usedIds = collectUsedIdsNumeric(dstArr);

    // dedupe target berdasarkan toMove (bukan seluruh identifiers)
    const mvId   = new Set(toMove.map(r => (r.id  ?? "").toString()).filter(Boolean));
    const mvNis  = new Set(toMove.map(r => (r.nis ?? "").toString()).filter(Boolean));
    const mvName = new Set(toMove.map(r => String(r.nama ?? "").toLowerCase()).filter(Boolean));

    const cleanedDst = dstArr.filter(r => {
      const rid  = (r.id  ?? "").toString();
      const rnis = (r.nis ?? "").toString();
      const rnmL = String(r.nama ?? "").toLowerCase();
      return !( (rid && mvId.has(rid)) || (rnis && mvNis.has(rnis)) || (rnmL && mvName.has(rnmL)) );
    });

    const idMap = []; // { oldId, newId, nis, nama }
    const movedWithIds = toMove.map(orig => {
      const row = { ...orig };
      const oldIdStr = (row.id ?? "").toString();
      const oldIdNum = parseInt(oldIdStr, 10);
      const keepOld = Number.isInteger(oldIdNum) && oldIdNum > 0 && !usedIds.has(String(oldIdNum));

      const newIdStr = keepOld ? String(oldIdNum) : allocNextIdGapFirst(usedIds);
      if (!keepOld) {
        idMap.push({ oldId: oldIdStr, newId: newIdStr, nis: row.nis ?? "", nama: row.nama ?? "" });
      }

      usedIds.add(newIdStr);
      row.id = newIdStr;
      return row;
    });

    const newDst = [...cleanedDst, ...movedWithIds];
    const sortedDst = sortByIdNumeric(newDst);

    const wDst = await writeJsonFile(
      tujuanPath, sortedDst, token, dst.exists ? dst.sha : null,
      dst.exists ? `Upsert ${movedWithIds.length} santri (gap-ID, sorted) ke ${tujuan}`
                 : `Create ${tujuan} & seed ${movedWithIds.length} santri (gap-ID, sorted)`
    );
    if (!wDst.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal menulis kelas tujuan", detail: wDst.error, status: wDst.status }) };
    }

    const remaining = src.data.filter(r => !match(r));
    const sortedRemaining = sortByIdNumeric(remaining);
    const wSrc = await writeJsonFile(
      asalPath, sortedRemaining, token, src.sha,
      `Remove ${toMove.length} santri pindah dari ${asal} (sorted)`
    );
    if (!wSrc.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal menulis kelas asal", detail: wSrc.error, status: wSrc.status }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, moved: toMove.length, idMap }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Unhandled error", detail: e?.message || String(e) }) };
  }
};
