// functions/api/aksesAutoUpdateAllJuz.js
import { ok, bad, serverErr, str } from "./_utils";

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

export async function onRequestPost(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const body = await ctx.request.json();
    const kelas = str(body?.kelas).trim();
    const fromDate = str(body?.fromDate).trim();
    const toDate   = str(body?.toDate).trim();
    if (!kelas) return bad("kelas wajib.");
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO auto_ranges (kelas, kind, from_date, to_date, updated_at)
       VALUES (?1, 'juz', ?2, ?3, ?4)
       ON CONFLICT(kelas, kind)
       DO UPDATE SET from_date=excluded.from_date, to_date=excluded.to_date, updated_at=excluded.updated_at`
    ).bind(kelas, fromDate, toDate, now).run();

    return ok({ success: true });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
