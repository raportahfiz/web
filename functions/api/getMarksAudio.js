import { ok, bad, serverErr, str } from "./_utils";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const OWNER_REPO = "raportahfiz/server";
const BRANCH = "main";

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

const dec = new TextDecoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

async function getAllPayloadsD1(db, kelas, tanggal){
  const rows = await db.prepare(
    `SELECT payload_json
     FROM attendance_snapshots
     WHERE class_name=?1 AND tanggal=?2`
  ).bind(kelas, tanggal).all();

  const out=[];
  for(const r of rows.results||[]){
    try{ out.push(JSON.parse(r.payload_json)); }catch{}
  }
  return out;
}

async function getAllPayloadsGitHub(token, kelas, tanggal){
  const fileName = `${encodeURIComponent(kelas)}_${encodeURIComponent(tanggal)}.json`;
  const apiUrl = `https://api.github.com/repos/${OWNER_REPO}/contents/absensi/${fileName}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(apiUrl, { headers: ghHeaders(token) });

  if (res.status === 404) return null; // ikuti perilaku lama: 404 jika file tidak ada

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
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

function findSantriByIdOrNis(list, id){
  if(!Array.isArray(list)) return null;
  // longgar: cocokkan id atau nis
  return list.find(s => s && (String(s.id) == id || String(s.nis) == id)) || null;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status:204, headers:CORS });

  if (request.method !== "GET")
    return new Response("Method Not Allowed", { status:405, headers:CORS });

  try {
    const url = new URL(request.url);
    const id      = str(url.searchParams.get("id")).trim();
    const tanggal = str(url.searchParams.get("tanggal")).trim();
    const kelas   = str(url.searchParams.get("kelas")).trim();

    if (!id || !tanggal || !kelas) {
      return new Response(JSON.stringify({ error:"Parameter 'id', 'tanggal', dan 'kelas' wajib ada." }),
        { status:400, headers:{ "Content-Type":"application/json", ...CORS } });
    }

    // 1) D1 first
    const db = env.ABSENSI_DB;
    let list = await getAllPayloadsD1(db, kelas, tanggal);
    let santri = findSantriByIdOrNis(list, id);

    // 2) fallback GitHub jika tidak ketemu
    if (!santri) {
      if (!env.GITHUB_TOKEN) {
        // ikuti perilaku lama: jika file tidak ada → 404; di sini tanpa token kita tidak bisa cek GitHub
        return new Response(JSON.stringify({ error:"Santri tidak ditemukan." }),
          { status:404, headers:{ "Content-Type":"application/json", ...CORS } });
      }
      const ghList = await getAllPayloadsGitHub(env.GITHUB_TOKEN, kelas, tanggal);
      if (ghList === null) {
        return new Response(JSON.stringify({ error:"File absensi tidak ditemukan." }),
          { status:404, headers:{ "Content-Type":"application/json", ...CORS } });
      }
      santri = findSantriByIdOrNis(ghList, id);
      if (!santri) {
        return new Response(JSON.stringify({ error:"Santri tidak ditemukan." }),
          { status:404, headers:{ "Content-Type":"application/json", ...CORS } });
      }
    }

    const marks = santri.marks || {};

    return new Response(JSON.stringify({ nama: santri.nama, marks }), {
      status:200, headers:{ "Content-Type":"application/json", ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error:String(e?.message || e) }), {
      status:500, headers:{ "Content-Type":"application/json", ...CORS }
    });
  }
}
