// functions/api/getAbsensi.js
import { ok, bad, serverErr, str } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const url = new URL(ctx.request.url);
    const kelas   = str(url.searchParams.get("kelas")).trim();
    const tanggal = str(url.searchParams.get("tanggal")).trim();

    if (!kelas || !tanggal) return bad("kelas & tanggal wajib.");

    const rows = await db.prepare(
      `SELECT payload_json FROM attendance_snapshots
       WHERE class_name=?1 AND tanggal=?2
       ORDER BY student_key`
    ).bind(kelas, tanggal).all();

    const out = [];
    for (const r of rows.results || []) {
      try {
        out.push(JSON.parse(r.payload_json));
      } catch {
        // skip baris rusak
      }
    }
    return ok(out);
  } catch (e) {
    return serverErr(e.message || e);
  }
}
