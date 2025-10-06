// /functions/api/updateKeteranganKelas.js
// POST /api/updateKeteranganKelas?kelas=kelas_01
// Body JSON: { "key": "<nis | id | nama>", "keterangan": "SP1|SP2|SP3|SP4" | "" }
// ENV: GITHUB_TOKEN (disarankan) atau MTQ_TOKEN
// Branch: main

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const API_BASE = "https://api.github.com/repos/muqoddammtb/server/contents";
const BRANCH   = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-update-keterangan",
});

// Base64 helpers (tanpa Buffer)
const dec = new TextDecoder();
const enc = new TextEncoder();
const b64enc = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64dec = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

// Cari index santri: nis → id(string) → id(number)
function matchIndex(list, key) {
  if (!Array.isArray(list)) return -1;
  const keyStr = String(key ?? "").trim();
  if (!keyStr) return -1;

  let idx = list.findIndex((x) => String(x?.nis ?? "").trim() === keyStr);
  if (idx !== -1) return idx;

  idx = list.findIndex((x) => String(x?.id ?? "").trim() === keyStr);
  if (idx !== -1) return idx;

  if (!Number.isNaN(Number(keyStr))) {
    const keyNum = Number(keyStr);
    idx = list.findIndex((x) => Number(x?.id) === keyNum);
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN || env.MTQ_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const url = new URL(request.url);
  const kelas = (url.searchParams.get("kelas") || "").trim(); // ex: kelas_1
  if (!kelas) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // body JSON
  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Body harus JSON." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const key = String(body?.key ?? "").trim();
  const ket = String(body?.keterangan ?? "").trim();

  if (!key) {
    return new Response(JSON.stringify({ error: "Field 'key' wajib." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
  // VALIDASI: boleh kosong atau SP1..SP4
  if (ket && !/^SP[1-4]$/.test(ket)) {
    return new Response(JSON.stringify({ error: "Keterangan harus SP1-SP4 (atau kosong)." }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  // --- Ambil file kelas
  const filePath = `${encodeURIComponent(`${kelas}.json`)}`;
  const getUrl   = `${API_BASE}/${filePath}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const getRes = await fetch(getUrl, { headers: ghHeaders(token) });

    if (getRes.status === 404) {
      return new Response(JSON.stringify({ error: `File ${kelas}.json tidak ditemukan.` }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    if (!getRes.ok) {
      const t = await getRes.text().catch(() => "");
      return new Response(t || "Failed fetching file", {
        status: getRes.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const file = await getRes.json();
    const sha  = file?.sha || null;

    let data = [];
    try { data = JSON.parse(b64dec(file?.content || "")); }
    catch {
      return new Response(JSON.stringify({ error: "Gagal parse JSON kelas_{}.json." }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ error: "Struktur kelas_{}.json tidak valid (bukan array)." }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    // --- Update keterangan
    const idx = matchIndex(data, key);
    if (idx === -1) {
      return new Response(JSON.stringify({ error: `Santri dengan key '${key}' tidak ditemukan.` }), {
        status: 404, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    data[idx].keterangan = ket || ""; // boleh kosong

    // --- Commit PUT
    const putUrl = `${API_BASE}/${filePath}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `chore: update keterangan (${kelas}) key=${key} -> ${ket || "-"}`,
        content: b64enc(JSON.stringify(data, null, 2)),
        sha,
        branch: BRANCH,
      }),
    });

    if (!putRes.ok) {
      const t = await putRes.text().catch(() => "");
      return new Response(t || "Failed updating file", {
        status: putRes.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }
}
