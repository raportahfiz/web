// functions/api/ambil-kelas-nis.js
// Endpoint: GET /api/ambil-kelas-nis?kelas=Nama (menerima 01, kelas_01, kelas_01.json, kelas-01)

const DEFAULT_REPO   = "raportahfiz/server";
const DEFAULT_BRANCH = "main";

const dec = new TextDecoder();
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ request, env }) {
  const TOKEN  = env.GITHUB_TOKEN;
  const REPO   = env.GITHUB_REPO   || DEFAULT_REPO;
  const BRANCH = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  if (!TOKEN) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("kelas") || "").trim();
  if (!raw) return json({ message: "Parameter kelas wajib diisi." }, 400);

  // Normalisasi input → buat beberapa kandidat path yang mungkin
  // contoh input yang didukung: "01", "kelas_01", "kelas-01", "kelas_01.json"
  const base = raw
    .replace(/\.json$/i, "")   // hilangkan .json kalau ada
    .replace(/-/g, "_");       // ganti '-' ke '_'

  const candidates = new Set();

  // jika sudah diawali "kelas_", pakai apa adanya + .json
  if (/^kelas_/.test(base)) {
    candidates.add(`${base}.json`);
  } else {
    // Kalau hanya angka 1–2 digit → nol-pad ke 2 digit: 1 -> 01
    const m = base.match(/^(\d{1,2})$/);
    if (m) {
      const two = m[1].padStart(2, "0");
      candidates.add(`kelas_${two}.json`);
    }
    // Tambah varian umum lain
    candidates.add(`kelas_${base}.json`);
  }

  // Jaga-jaga jika user sudah memasukkan .json penuh pada query
  if (/\.json$/i.test(raw)) candidates.add(raw);

  const tried = [];
  let fileJson = null;

  for (const path of candidates) {
    const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;
    tried.push(path);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "cf-pages-ambil-kelas-nis/1.1",
      },
    });

    if (res.ok) {
      fileJson = await res.json();
      break;
    }
  }

  if (!fileJson) {
    return json({
      source: "github",
      step: "get-kelas",
      message: "File kelas tidak ditemukan di repo.",
      tried, // untuk debugging: lihat kandidat yang dicoba
      hint: "Pastikan nama file sesuai, mis. kelas_01.json dan parameter 'kelas=kelas_01' atau 'kelas=01'."
    }, 404);
  }

  // Decode & petakan field
  let santri = [];
  try { santri = JSON.parse(b64decode(fileJson.content || "")) || []; } catch { santri = []; }

  const result = (santri || []).map(s => ({
    id: s?.id,
    nis: s?.nis,
    nama: s?.nama,
  }));

  return json(result, 200);
}

export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
