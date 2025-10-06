// /functions/api/pindahKelasMulaiTanggal.js
export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try{
    const b = await ctx.request.json();
    const kelasAsal   = normKelas(b?.kelasAsal);
    const kelasTujuan = normKelas(b?.kelasTujuan);
    const nises       = arr(b?.nises);        // = student_key
    const start       = String(b?.startDate||"").trim();

    if (!kelasAsal || !kelasTujuan) return jsonErr(400,"Wajib: kelasAsal & kelasTujuan");
    if (kelasAsal === kelasTujuan)  return jsonErr(400,"kelasAsal dan kelasTujuan tidak boleh sama");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return jsonErr(400,"startDate harus YYYY-MM-DD");
    if (!nises.length) return jsonErr(400,"Wajib: nises[] (student_key/NIS)");

    // Ringkasan sebelum update (untuk feedback UI)
    const before = await db.prepare(
      `SELECT tanggal, COUNT(*) AS cnt
         FROM attendance_snapshots
        WHERE class_name=? AND tanggal>=? AND student_key IN (${ph(nises.length)})
        GROUP BY tanggal ORDER BY tanggal`
    ).bind(kelasAsal, start, ...nises).all();

    const details = (before.results||[]).map(r=>({ tanggal:r.tanggal, moved:Number(r.cnt||0) }));
    const totalMoved = details.reduce((a,b)=>a+b.moved,0);
    const now = nowIso();

    // ====== ANTI-UNIQUE CONFLICT: hapus target yg bentrok, lalu UPDATE ======
    const stmts = [
      // 1) attendance_snapshots: hapus baris di kelasTujuan yg (tanggal, student_key) juga ada di kelasAsal (>= start)
      db.prepare(
        `DELETE FROM attendance_snapshots AS t
          WHERE t.class_name = ?
            AND t.tanggal >= ?
            AND t.student_key IN (${ph(nises.length)})
            AND EXISTS (
              SELECT 1 FROM attendance_snapshots s
               WHERE s.class_name = ?
                 AND s.tanggal    = t.tanggal
                 AND s.student_key= t.student_key
                 AND s.tanggal   >= ?
            )`
      ).bind(kelasTujuan, start, ...nises, kelasAsal, start),

      // 2) attendance_snapshots: pindahkan kelasAsal -> kelasTujuan (>= start)
      db.prepare(
        `UPDATE attendance_snapshots
            SET class_name=?, updated_at=?
          WHERE class_name=? AND tanggal>=? AND student_key IN (${ph(nises.length)})`
      ).bind(kelasTujuan, now, kelasAsal, start, ...nises),

      // 3) totals_store: hapus target yg bentrok (match start_date,end_date,student_key) untuk periode end_date >= start
      db.prepare(
        `DELETE FROM totals_store AS t
          WHERE t.kelas = ?
            AND t.student_key IN (${ph(nises.length)})
            AND t.end_date >= ?
            AND EXISTS (
              SELECT 1 FROM totals_store s
               WHERE s.kelas = ?
                 AND s.student_key = t.student_key
                 AND s.start_date  = t.start_date
                 AND s.end_date    = t.end_date
                 AND s.end_date   >= ?
            )`
      ).bind(kelasTujuan, ...nises, start, kelasAsal, start),

      // 4) totals_store: pindahkan kelasAsal -> kelasTujuan utk periode end_date >= start
      db.prepare(
        `UPDATE totals_store
            SET kelas=?, updated_at=?
          WHERE kelas=? AND end_date>=? AND student_key IN (${ph(nises.length)})`
      ).bind(kelasTujuan, now, kelasAsal, start, ...nises),
    ];

    await db.batch(stmts);

    return json({ success:true, totalMoved, details, from:kelasAsal, to:kelasTujuan, startDate:start });
  }catch(e){
    return jsonErr(500, e?.message || String(e));
  }
}

/* utils */
const nowIso = ()=> new Date().toISOString();
const normKelas = (k)=> String(k||"").startsWith("kelas_") ? String(k) : `kelas_${k}`;
const json = (o,s=200)=> new Response(JSON.stringify(o), {status:s, headers:hdr()});
const jsonErr = (s,e,d)=> json({success:false, error:e, ...(d?{detail:d}:{})}, s);
const hdr = ()=>({
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"content-type, authorization",
});
const arr = (v)=> Array.isArray(v)?v:[];
const ph = (n)=> Array.from({length:n},()=>"?").join(",");
