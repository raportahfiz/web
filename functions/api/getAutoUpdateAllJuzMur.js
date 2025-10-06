// functions/api/getAutoUpdateAllJuzMur.js
import { ok, serverErr } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const rows = await db.prepare(
      `SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt
       FROM auto_ranges
       WHERE kind='mur'
       ORDER BY kelas`
    ).all();
    return ok(rows.results || []);
  } catch (e) {
    return serverErr(e.message || e);
  }
}
