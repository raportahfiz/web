// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=1&start=YYYY-MM-DD&end=YYYY-MM-DD[&ref=main]
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER = "muqoddammtb";
const REPO  = "server";
const DEFAULT_BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// base64 → UTF-8 safe
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

function generateDateRange(startDate, endDate) {
  const out = [];
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return out;

  // berjalan harian dalam UTC untuk stabilitas tanggal
  let cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const endUTC = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
  while (cur <= endUTC) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function normKelas(k) {
  if (!k) return k;
  const s = String(k).trim();
  return s.startsWith("kelas_") ? s : `kelas_${s}`;
}

async function fetchGithubJsonFile({ owner, repo, path, token, ref = DEFAULT_BRANCH }) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });

  if (res.status === 404) return { ok: false, status: 404, data: null };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, data: text || null };
  }

  const payload = await res.json();
  try {
    const decoded = b64decode(payload.content || "");
    return { ok: true, status: 200, data: JSON.parse(decoded) };
  } catch {
    return { ok: false, status: 422, data: `Invalid JSON in ${path}` };
  }
}

async function buildIdToNisMap({ owner, repo, kelas, token, ref }) {
  const rosterPath = `${kelas}.json`; // contoh: "kelas_1.json" (root)
  const roster = await fetchGithubJsonFile({ owner, repo, path: rosterPath, token, ref });

  if (!roster.ok) return { idToNis: {}, nisMeta: {} };

  const idToNis = {};
  const nisMeta = {};
  (roster.data || []).forEach((s) => {
    const idNum = typeof s?.id === "number" ? s.id : parseInt(s?.id);
    const nis = s?.nis ? String(s.nis).trim() : null;
    if (idNum && nis) idToNis[idNum] = nis;
    if (nis) {
      nisMeta[nis] = {
        nama: s?.nama || "",
        semester: s?.semester != null ? parseInt(s.semester) : null,
      };
    }
  });

  return { idToNis, nisMeta };
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET")     return new Response("Method Not Allowed", { status: 405, headers: CORS });

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const url   = new URL(request.url);
  const ref   = url.searchParams.get("ref") || DEFAULT_BRANCH;
  const kelas = url.searchParams.get("kelas");
  const start = url.searchParams.get("start");
  const end   = url.searchParams.get("end");

  if (!kelas || !start || !end) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas', 'start', dan 'end' wajib diisi." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const kelasNorm = normKelas(kelas);
  const tanggalList = generateDateRange(start, end);
  if (!tanggalList.length) {
    return new Response(JSON.stringify({ error: "Rentang tanggal tidak valid." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  try {
    const { idToNis } = await buildIdToNisMap({
      owner: OWNER, repo: REPO, kelas: kelasNorm, token: env.GITHUB_TOKEN, ref
    });

    const hasil = [];
    for (const tanggal of tanggalList) {
      const path = `absensi/${kelasNorm}_${tanggal}.json`;
      const res = await fetchGithubJsonFile({
        owner: OWNER, repo: REPO, path, token: env.GITHUB_TOKEN, ref
      });

      if (res.status === 404) continue;
      if (!res.ok) continue;

      const daily = Array.isArray(res.data) ? res.data : [];
      daily.forEach((it) => {
        if (it && !it.tanggal) it.tanggal = tanggal;
        if (!it?.nis) {
          const idNum = typeof it?.id === "number" ? it.id : parseInt(it?.id);
          const mapped = idNum ? idToNis[idNum] : null;
          if (mapped) it.nis = String(mapped);
        }
      });

      hasil.push(...daily);
    }

    return new Response(JSON.stringify(hasil), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
