// functions/api/getAbsensiRange.js
import { ok, bad, serverErr, str } from "./_utils";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet(ctx) {
  const db = ctx.env.ABSENSI_DB;

  try {
    const url   = new URL(ctx.request.url);
    const kelas = str(url.searchParams.get("kelas")).trim();
    let   start = str(url.searchParams.get("start")).trim();
    let   end   = str(url.searchParams.get("end")).trim();
    const aggregate = str(url.searchParams.get("aggregate")).trim() === "1";

    if (!kelas || !start || !end) return bad("kelas, start, end wajib.");
    if (!ISO.test(start) || !ISO.test(end)) return bad("format tanggal harus YYYY-MM-DD.");

    // Normalisasi: pastikan start <= end
    if (start > end) { const t = start; start = end; end = t; }

    if (!aggregate) {
      // =============== MODE NON-AGGREGATE (PER TANGGAL / PER SNAPSHOT) ===============
      // Ambil tanggal JUGA, supaya UI bisa render baris per-hari.
      const rows = await db.prepare(
        `SELECT tanggal, payload_json
           FROM attendance_snapshots
          WHERE class_name=?1
            AND tanggal BETWEEN ?2 AND ?3
          ORDER BY tanggal, student_key`
      ).bind(kelas, start, end).all();

      const list = [];
      for (const r of rows.results || []) {
        try {
          const obj = JSON.parse(r.payload_json);
          // Pastikan field tanggal ada di objek
          if (!obj.tanggal) obj.tanggal = r.tanggal;
          list.push(obj);
        } catch {}
      }

      // >>>>> SELALU KEMBALIKAN DALAM BENTUK { list: [...] }
      return ok({ aggregate: false, kelas, start, end, list });
    }

    // ===================== MODE AGGREGATE (DIRINGKAS PER SANTRI) =====================
    const rows = await db.prepare(
      `SELECT student_key,
              SUM(total_juz_num) AS total_juz,
              SUM(total_mur_num) AS total_mur
         FROM attendance_snapshots
        WHERE class_name=?1
          AND tanggal BETWEEN ?2 AND ?3
        GROUP BY student_key
        ORDER BY student_key`
    ).bind(kelas, start, end).all();

    const list = (rows.results || []).map(r => ({
      key: r.student_key,
      totalJuz: Number(r.total_juz || 0),
      totalMur: Number(r.total_mur || 0),
    }));

    return ok({ aggregate: true, kelas, start, end, list });
  } catch (e) {
    return serverErr(e.message || e);
  }
}
