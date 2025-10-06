// /functions/api/getAbsensiRange.js
// GET /api/getAbsensiRange?kelas=kelas_01&from=2025-09-01&to=2025-09-07
// ENV: GITHUB_TOKEN (contents:read)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER = "muqoddammtb";
const REPO  = "server";
const BRANCH = "main";

// Headers GitHub API
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// base64 → UTF-8 aman
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTanggal(dt) {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  if (request.method !== "GET")
    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset di environment." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const url = new URL(request.url);
  const kelas = url.searchParams.get("kelas");
  const from  = url.searchParams.get("from");
  const to    = url.searchParams.get("to");

  if (!kelas || !from || !to) {
    return new Response(JSON.stringify({ error: "Parameter 'kelas', 'from', dan 'to' wajib diisi." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const startDate = parseDate(from);
  const endDate   = parseDate(to);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return new Response(JSON.stringify({ error: "Format tanggal tidak valid." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const dateList = [];
  for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
    dateList.push(formatTanggal(dt));
  }

  const results = [];

  for (const tanggal of dateList) {
    const fileName = `${kelas}_${tanggal}.json`;
    const apiUrl =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/absensi/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(BRANCH)}`;

    try {
      const res = await fetch(apiUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });

      if (res.status === 404) {
        results.push({ tanggal, data: [] });
        continue;
      }

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        results.push({ tanggal, error: `Gagal fetch (${res.status})`, detail: t.slice(0, 200), data: [] });
        continue;
      }

      const json = await res.json(); // { content: "base64", ... }
      let decoded = "[]";
      try {
        decoded = b64decode(json.content || "") || "[]";
      } catch {
        decoded = "[]";
      }

      let data = [];
      try {
        data = JSON.parse(decoded || "[]");
      } catch {
        data = [];
      }

      // format sesuai frontend
      const formattedData = (Array.isArray(data) ? data : []).map((s) => ({
        id: s.id,
        absensi: s.absensi || "",
        dari: s.dari || "1:1",
        sampai: s.sampai || "1:1",
        halaman: s.halaman || "-",
        totalHalaman: s.totalHalaman || "-",
        juzTerbaca: s.juzTerbaca || "-",
        totalJuz: s.totalJuz || 0,
        buttonCell: s.buttonCell || null,
      }));

      results.push({ tanggal, data: formattedData });
    } catch (err) {
      results.push({ tanggal, error: String(err?.message || err), data: [] });
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
