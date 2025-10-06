// functions/api/saveData.js
import { ok, bad, serverErr, str, parseNum, studentKeyOf, totalMurFromPayload } from "./_utils";

export async function onRequestPost(ctx) {
  const db = ctx.env.ABSENSI_DB;
  try {
    const body = await ctx.request.json();
    const kelas = str(body?.kelas).trim();
    const tanggal = str(body?.tanggal).trim();
    const list = Array.isArray(body?.data) ? body.data : [];

    if (!kelas || !tanggal) return bad("kelas & tanggal wajib.");

    const now = new Date().toISOString();

    // SQLite/D1 upsert
    const sql = `
      INSERT INTO attendance_snapshots
      (class_name, tanggal, student_key, nama, jenjang, semester, payload_json, total_juz_num, total_mur_num, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
      ON CONFLICT(class_name, tanggal, student_key)
      DO UPDATE SET
        nama = excluded.nama,
        jenjang = excluded.jenjang,
        semester = excluded.semester,
        payload_json = excluded.payload_json,
        total_juz_num = excluded.total_juz_num,
        total_mur_num = excluded.total_mur_num,
        updated_at = excluded.updated_at
    `;

    const stmt = db.prepare(sql);

    for (const p of list) {
      const sKey = studentKeyOf(p);
      if (!sKey) continue; // lewati jika tidak punya kunci

      const nama = str(p?.nama).trim();
      const jenjang = str(p?.jenjang).trim();
      const semester = str(p?.semester).trim();

      const totalJuzNum = parseNum(p?.totalJuz, 0);
      const totalMurNum = totalMurFromPayload(p);

      const payload_json = JSON.stringify(p);

      await stmt.bind(
        kelas,            // 1
        tanggal,          // 2
        sKey,             // 3
        nama,             // 4
        jenjang,          // 5
        semester,         // 6
        payload_json,     // 7
        totalJuzNum,      // 8
        totalMurNum,      // 9
        now               // 10
      ).run();
    }

    return ok({ success: true, saved: list.length });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
