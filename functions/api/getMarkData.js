import { ok, bad, serverErr, str } from "./_utils";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "muqoddammtb/server";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// base64 → utf8 aman
const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

async function getFromD1(db, kelas, tanggal){
  const rows = await db.prepare(
    `SELECT payload_json
     FROM attendance_snapshots
     WHERE class_name=?1 AND tanggal=?2
     ORDER BY student_key`
  ).bind(kelas, tanggal).all();

  const out = [];
  for (const r of rows.results || []) {
    try { out.push(JSON.parse(r.payload_json)); } catch {}
  }
  return out;
}

async function getFromGitHub(token, kelas, tanggal){
  const fileName = `${kelas}_${tanggal}.json`;
  const apiUrl =
    `https://api.github.com/repos/${OWNER_REPO}/contents/absensi/` +
    `${encodeURIComponent(fileName)}?ref=${encodeURIComponent(BRANCH)}`;

  const res = await fetch(apiUrl, { headers: ghHeaders(token) });

  if (res.status === 404) return []; // tidak ada file → []

  if (!res.ok) {
    const t = await res.text().catch(()=>"");
    throw new Error(`GitHub error ${res.status}: ${t.slice(0,300)}`);
  }

  const json = await res.json(); // { content: base64, ... }
  try {
    const content = b64decode(json.content || "");
    return JSON.parse(content || "[]");
  } catch {
    return [];
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  if (request.method !== "GET")
    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const url = new URL(request.url);
    const tanggal = str(url.searchParams.get("tanggal")).trim();
    const kelas   = str(url.searchParams.get("kelas")).trim();
    if (!tanggal || !kelas) return new Response(JSON.stringify({ error:"Parameter 'tanggal' dan 'kelas' wajib ada." }), { status:400, headers:{ "Content-Type":"application/json", ...CORS } });

    // 1) D1 first
    const d1 = env.ABSENSI_DB;
    let data = await getFromD1(d1, kelas, tanggal);

    // 2) fallback GitHub jika kosong
    if (!data?.length) {
      if (!env.GITHUB_TOKEN) {
        // tanpa token → tetap balikan [] agar UI tidak error
        data = [];
      } else {
        data = await getFromGitHub(env.GITHUB_TOKEN, kelas, tanggal);
      }
    }

    return new Response(JSON.stringify(data), { status:200, headers:{ "Content-Type":"application/json", ...CORS } });

  } catch (e) {
    return new Response(JSON.stringify({ error:String(e?.message || e) }), { status:500, headers:{ "Content-Type":"application/json", ...CORS } });
  }
}
