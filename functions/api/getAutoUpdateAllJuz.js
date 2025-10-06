// functions/api/getAutoUpdateAllJuz.js
import { ok, serverErr } from "./_utils";

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const rows = await db.prepare(
      `SELECT kelas, from_date AS fromDate, to_date AS toDate, updated_at AS updatedAt
       FROM auto_ranges
       WHERE kind='juz'
       ORDER BY kelas`
    ).all();
    return ok(rows.results || []);
  } catch (e) {
    return serverErr(e.message || e);
  }
}
