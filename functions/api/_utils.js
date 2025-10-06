// functions/api/_utils.js
export function json(status, data, init = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...init.headers },
  });
}
export const ok = (data) => json(200, data);
export const bad = (msg, code = 400) => json(code, { success: false, error: String(msg || "Bad Request") });
export const serverErr = (msg) => json(500, { success: false, error: String(msg || "Server Error") });

export function str(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}
export function parseNum(v, fallback = 0) {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const s = String(v ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

// student_key = nis || id
export function studentKeyOf(payload) {
  const nis = str(payload?.nis).trim();
  if (nis) return nis;
  const id = str(payload?.id).trim();
  return id || ""; // boleh kosong (tapi sebaiknya selalu ada salah satu)
}

// hitung total mur dari payload
export function totalMurFromPayload(p) {
  // prioritas: juzmurajaah; jika tidak, jumlahkan 1+2+3
  const j1 = parseNum(p?.juzmur1, 0);
  const j2 = parseNum(p?.juzmur2, 0);
  const j3 = parseNum(p?.juzmur3, 0);
  const sum = j1 + j2 + j3;
  const tot = parseNum(p?.juzmurajaah, sum);
  return Number.isFinite(tot) ? tot : 0;
}
