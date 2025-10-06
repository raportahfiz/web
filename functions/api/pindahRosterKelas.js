// functions/api/pindahRosterKelas.js
// Cloudflare Pages Functions (ESM)

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
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

const normKelas = (k) => {
  let v = String(k || "").trim().replace(/-/g, "_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-pindahRosterKelas/1.1",
});

const withRef = (url, branch) => `${url}?ref=${encodeURIComponent(branch)}`;

async function readJsonFile(repo, path, token, branch) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(withRef(url, branch), { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, exists: false, sha: null, data: [] };
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => "") };
  const meta = await res.json();
  let arr = [];
  try { arr = JSON.parse(b64decode(meta.content || "")); } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return { ok: true, exists: true, sha: meta.sha, data: arr };
}

async function writeJsonFile(repo, path, token, branch, arrayData, sha, message) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: b64encode(JSON.stringify(arrayData, null, 2)),
    branch,
  };
  if (sha) body.sha = sha;

  // try-put + one-shot refresh-then-put if conflict
  let res = await fetch(url, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    const ref = await fetch(withRef(url, branch), { headers: ghHeaders(token) });
    if (ref.status === 200) {
      const meta = await ref.json();
      res = await fetch(url, {
        method: "PUT",
        headers: ghHeaders(token),
        body: JSON.stringify({ ...body, sha: meta.sha }),
      });
    }
  }
  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => "") };
  return { ok: true };
}

function collectUsedIdsNumeric(arr) {
  const set = new Set();
  for (const r of arr) {
    const n = parseInt(String(r?.id ?? ""), 10);
    if (Number.isInteger(n) && n > 0) set.add(String(n));
  }
  return set;
}
function allocNextIdGapFirst(used) {
  let i = 1;
  while (used.has(String(i))) i++;
  return String(i);
}
function sortByIdNumeric(arr) {
  return [...arr].sort((a, b) => (parseInt(a?.id || 0, 10) || 0) - (parseInt(b?.id || 0, 10) || 0));
}

export const onRequestOptions = () => json({}, 204);

export async function onRequestPost({ request, env }) {
  const TOKEN  = env.GITHUB_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ error: "GITHUB_TOKEN tidak tersedia" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Body bukan JSON valid" }, 400); }

  let { kelasAsal, kelasTujuan, identifiers } = body || {};
  if (!kelasAsal || !kelasTujuan || !Array.isArray(identifiers) || identifiers.length === 0) {
    return json({ error: "Wajib: kelasAsal, kelasTujuan, identifiers[]" }, 400);
  }

  const asal   = normKelas(kelasAsal);
  const tujuan = normKelas(kelasTujuan);
  const asalPath = `${asal}.json`;
  const tujuanPath = `${tujuan}.json`;

  // --- load roster
  const src = await readJsonFile(REPO, asalPath, TOKEN, BRANCH);
  if (!src.ok || !src.exists) return json({ error: "File kelas asal tidak ditemukan" }, 404);
  const dst = await readJsonFile(REPO, tujuanPath, TOKEN, BRANCH);
  if (!dst.ok) return json({ error: "Gagal baca kelas tujuan", detail: dst.error, status: dst.status }, 502);

  // --- tentukan santri yang dipindah
  const cleanIds = identifiers.map(v => String(v ?? "").trim()).filter(Boolean);
  const pickNis  = new Set(cleanIds.filter(v => /^\d{3,}$/.test(v))); // tebakan nis = deretan digit
  const pickName = new Set(cleanIds.map(v => v.toLowerCase()));
  const pickId   = new Set(cleanIds); // tetap boleh pilih via id

  const match = (r) => {
    const id  = String(r?.id ?? "");
    const nis = String(r?.nis ?? "");
    const nmL = String(r?.nama ?? "").toLowerCase();
    return pickId.has(id) || (nis && pickNis.has(nis)) || (nmL && pickName.has(nmL));
  };

  const toMove = src.data.filter(match);
  if (!toMove.length) return json({ error: "Santri tidak ditemukan di kelas asal" }, 404);

  // --- siapkan index tujuan untuk MERGE berdasar NIS/NAMA (bukan ID!)
  const dstArr   = Array.isArray(dst.data) ? [...dst.data] : [];
  const usedIds  = collectUsedIdsNumeric(dstArr);
  const byNisDst = new Map();   // nis -> index
  const byNameDst= new Map();   // lower(nama) -> index
  dstArr.forEach((r, i) => {
    const nis = String(r?.nis ?? "").trim();
    const nmL = String(r?.nama ?? "").trim().toLowerCase();
    if (nis) byNisDst.set(nis, i);
    if (nmL) byNameDst.set(nmL, i);
  });

  const idMap = [];     // catatan perubahan id {oldId, newId, nis, nama}
  const mergedOrAdded = [];

  for (const orig of toMove) {
    const srcNis = String(orig?.nis ?? "").trim();
    const srcNmL = String(orig?.nama ?? "").trim().toLowerCase();

    // 1) Jika ada di tujuan (match NIS dulu, lalu nama), lakukan UPDATE/MERGE
    let idx = -1;
    if (srcNis && byNisDst.has(srcNis)) idx = byNisDst.get(srcNis);
    else if (srcNmL && byNameDst.has(srcNmL)) idx = byNameDst.get(srcNmL);

    if (idx >= 0) {
      // merge ke baris tujuan tanpa mengubah id tujuan
      const keep = dstArr[idx];
      const merged = {
        ...keep,
        // field identitas dari sumber boleh override (kecuali id)
        nis: srcNis || keep.nis,
        nama: orig?.nama ?? keep.nama,
        jenjang: orig?.jenjang ?? keep.jenjang,
        semester: orig?.semester ?? keep.semester,
        keterangan: orig?.keterangan ?? keep.keterangan,
      };
      dstArr[idx] = merged;
      mergedOrAdded.push({ type: "merged", nis: merged.nis, id: keep.id });
      continue;
    }

    // 2) Tidak ada di tujuan → tambahkan sebagai baris baru, buat ID baru (gap-first)
    const newId = allocNextIdGapFirst(usedIds);
    usedIds.add(newId);

    const row = {
      id: newId,
      nis: srcNis,
      nama: orig?.nama ?? "",
      jenjang: orig?.jenjang ?? "",
      semester: orig?.semester ?? "",
      keterangan: orig?.keterangan ?? "",
    };
    dstArr.push(row);
    mergedOrAdded.push({ type: "added", nis: row.nis, id: row.id });

    const oldIdStr = String(orig?.id ?? "");
    if (oldIdStr && oldIdStr !== newId) {
      idMap.push({ oldId: oldIdStr, newId, nis: row.nis || "", nama: row.nama || "" });
    }
  }

  // --- Tulis tujuan (tanpa menghapus siapa pun)
  const sortedDst = sortByIdNumeric(dstArr);
  const wDst = await writeJsonFile(
    REPO,
    tujuanPath,
    TOKEN,
    BRANCH,
    sortedDst,
    dst.exists ? dst.sha : null,
    dst.exists ? `Pindah roster → merge/add ${mergedOrAdded.length} santri ke ${tujuan}` :
                 `Buat ${tujuan} + seed ${mergedOrAdded.length} santri`
  );
  if (!wDst.ok) return json({ error: "Gagal menulis kelas tujuan", detail: wDst.error, status: wDst.status }, 502);

  // --- Hapus dari asal: hanya baris yang *dipindah* (match()), sisanya dibiarkan
  const remaining = src.data.filter(r => !match(r));
  const sortedRemaining = sortByIdNumeric(remaining);
  const wSrc = await writeJsonFile(
    REPO,
    asalPath,
    TOKEN,
    BRANCH,
    sortedRemaining,
    src.sha,
    `Remove ${toMove.length} santri pindah dari ${asal}`
  );
  if (!wSrc.ok) return json({ error: "Gagal menulis kelas asal", detail: wSrc.error, status: wSrc.status }, 502);

  return json({ success: true, moved: toMove.length, idMap, detail: mergedOrAdded }, 200);
}

export async function onRequest(ctx) {
  if (!["POST", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ error: "Method Not Allowed" }, 405);
  }
}
