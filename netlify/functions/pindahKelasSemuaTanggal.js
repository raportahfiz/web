// netlify/functions/pindahKelasSemuaTanggal.js
const OWNER_REPO = "mrdickymiswardi/server";
const BRANCH     = "main";
const API_BASE   = `https://api.github.com/repos/${OWNER_REPO}/contents`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});
const withRef = (url) => `${url}?ref=${encodeURIComponent(BRANCH)}`;
const normKelas = (k) => (k?.startsWith("kelas_") ? k : `kelas_${k}`);

const readDir = async (dir, token) => {
  const res = await fetch(withRef(`${API_BASE}/${dir}`), { headers: ghHeaders(token) });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=>"") };
  return { ok: true, status: 200, data: await res.json() };
};
const readJsonFile = async (path, token) => {
  const res = await fetch(withRef(`${API_BASE}/${path}`), { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, exists: false, sha: null, data: [] };
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(()=>"") };
  const json = await res.json();
  let arr = [];
  try { arr = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8")); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return { ok: true, exists: true, sha: json.sha, data: arr };
};
const writeJsonFile = async (path, arrayData, token, sha = null, message = "update") => {
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
};

const mapIdIfNeeded = (row, idMap) => {
  if (!Array.isArray(idMap) || idMap.length === 0) return row;
  const oldId = (row.id ?? "").toString();
  const found = idMap.find(m => String(m.oldId) === oldId);
  if (found && found.newId) return { ...row, id: String(found.newId) };
  return row;
};
const sortByIdNumeric = (arr) => [...arr].sort((a, b) => {
  const ai = parseInt((a.id ?? 0), 10) || 0;
  const bi = parseInt((b.id ?? 0), 10) || 0;
  return ai - bi;
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const token = process.env.MTQ_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ error: "MTQ_TOKEN tidak tersedia" }) };

    // Payload: { kelasAsal, kelasTujuan, ids?, nises?, santriIds?, idMap? }
    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Body bukan JSON valid" }) };
    }

    let { kelasAsal, kelasTujuan, ids, nises, santriIds, idMap } = payload || {};
    if (!kelasAsal || !kelasTujuan) {
      return { statusCode: 400, body: JSON.stringify({ error: "Wajib: kelasAsal & kelasTujuan" }) };
    }

    const asal   = normKelas(kelasAsal);
    const tujuan = normKelas(kelasTujuan);

    const idsArr   = Array.isArray(ids)       ? ids       : [];
    const nisesArr = Array.isArray(nises)     ? nises     : [];
    const legacy   = Array.isArray(santriIds) ? santriIds : [];
    const rawKeys  = [...idsArr, ...nisesArr, ...legacy]
      .map(x => String(x || "").trim())
      .filter(Boolean);

    if (rawKeys.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Wajib: minimal satu id/nis (ids/nises/santriIds)" }) };
    }

    const idPick   = new Set(rawKeys);
    const nisPick  = new Set(rawKeys);
    const namePick = new Set(rawKeys.map(v => v.toLowerCase()));
    const matchRow = (row) => {
      const rid  = (row.id   ?? "").toString();
      const rnis = (row.nis  ?? "").toString();
      const rnmL = String(row.nama ?? "").toLowerCase();
      return (rid && idPick.has(rid)) || (rnis && nisPick.has(rnis)) || (rnmL && namePick.has(rnmL));
    };

    const dir = await readDir("absensi", token);
    if (!dir.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal membaca folder absensi", detail: dir.error, status: dir.status }) };
    }

    const asalFiles = (dir.data || [])
      .filter(f => f.type === "file" && new RegExp(`^${asal}_\\d{4}-\\d{2}-\\d{2}\\.json$`).test(f.name))
      .map(f => ({ name: f.name, path: `absensi/${f.name}`, date: f.name.replace(`${asal}_`, "").replace(".json","") }))
      .sort((a,b) => a.date.localeCompare(b.date));

    if (asalFiles.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "Tidak ada file absensi untuk kelas asal" }) };
    }

    const report = [];
    let totalMoved = 0;

    for (const f of asalFiles) {
      const tanggal = f.date;
      const srcPath = f.path;
      const dstPath = `absensi/${tujuan}_${tanggal}.json`;

      const src = await readJsonFile(srcPath, token);
      if (!src.ok)  { report.push({ tanggal, moved: 0, note: `asal gagal dibaca (${src.status})` }); continue; }
      if (!src.exists || !Array.isArray(src.data) || src.data.length === 0) {
        report.push({ tanggal, moved: 0, note: "asal kosong/tidak ada" });
        continue;
      }

      const toMoveRaw = src.data.filter(matchRow);
      if (toMoveRaw.length === 0) {
        report.push({ tanggal, moved: 0, note: "tidak ada match (id/nis/nama)" });
        continue;
      }

      const toMove = toMoveRaw.map(r => mapIdIfNeeded(r, idMap));
      const remaining = src.data.filter(r => !matchRow(r));

      const dst = await readJsonFile(dstPath, token);
      if (!dst.ok)  { report.push({ tanggal, moved: 0, note: `gagal baca tujuan (${dst.status})` }); continue; }
      const dstArr = Array.isArray(dst.data) ? dst.data : [];

      const merged = [...dstArr, ...toMove];
      const seenId  = new Set();
      const seenNis = new Set();
      const deduped = [];
      for (const r of merged) {
        const rid  = (r.id  ?? "").toString();
        const rnis = (r.nis ?? "").toString();
        const k1 = rid  ? `id:${rid}`   : null;
        const k2 = rnis ? `nis:${rnis}` : null;
        if (k1 && seenId.has(k1)) continue;
        if (k2 && seenNis.has(k2)) continue;
        if (k1) seenId.add(k1);
        if (k2) seenNis.add(k2);
        deduped.push(r);
      }
      const sortedCombined = sortByIdNumeric(deduped);

      const okDst = await writeJsonFile(
        dstPath,
        sortedCombined,
        token,
        dst.exists ? dst.sha : null,
        dst.exists
          ? `Append ${toMove.length} santri -> ${tujuan} (${tanggal}, sorted)`
          : `Create ${tujuan} (${tanggal}) & seed ${toMove.length} santri (sorted)`
      );
      if (!okDst.ok) { report.push({ tanggal, moved: 0, note: `gagal tulis tujuan (${okDst.status})` }); continue; }

      const sortedRemaining = sortByIdNumeric(remaining);
      const okSrc = await writeJsonFile(
        srcPath,
        sortedRemaining,
        token,
        src.sha,
        `Remove ${toMoveRaw.length} santri pindah dari ${asal} (${tanggal}, sorted)`
      );
      if (!okSrc.ok) { report.push({ tanggal, moved: 0, note: `gagal tulis asal (${okSrc.status})` }); continue; }

      totalMoved += toMove.length;
      report.push({ tanggal, moved: toMove.length, created: !dst.exists });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, totalMoved, details: report }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Unhandled error", detail: e?.message || String(e) }) };
  }
};
