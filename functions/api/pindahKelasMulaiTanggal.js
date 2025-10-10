// /functions/api/pindahKelasMulaiTanggal.js
export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try{
    const b = await ctx.request.json();
    const kelasAsal   = normKelas(b?.kelasAsal);
    const kelasTujuan = normKelas(b?.kelasTujuan);
    const nisesIn     = arr(b?.nises);        // = student_key / NIS
    const start       = String(b?.startDate||"").trim();

    if (!kelasAsal || !kelasTujuan) return jsonErr(400,"Wajib: kelasAsal & kelasTujuan");
    if (kelasAsal === kelasTujuan)  return jsonErr(400,"kelasAsal dan kelasTujuan tidak boleh sama");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return jsonErr(400,"startDate harus YYYY-MM-DD");
    if (!nisesIn.length) return jsonErr(400,"Wajib: nises[] (student_key/NIS)");

    const nises = [...new Set(nisesIn.map(String).filter(Boolean))];
    const now = nowIso();

    // Ringkasan (sebelum update) untuk feedback UI
    const before = await db.prepare(
      `SELECT tanggal, COUNT(*) AS cnt
         FROM attendance_snapshots
        WHERE class_name=? AND tanggal>=? AND student_key IN (${ph(nises.length)})
        GROUP BY tanggal ORDER BY tanggal`
    ).bind(kelasAsal, start, ...nises).all();

    const details = (before.results||[]).map(r=>({ tanggal:r.tanggal, moved:Number(r.cnt||0) }));
    const totalMoved = details.reduce((a,b)=>a+b.moved,0);

    // ====== ANTI-UNIQUE CONFLICT + PEMINDAHAN INTI (attendance & totals) ======
    const stmts = [
      // 1) attendance_snapshots: hapus calon duplikat di kelasTujuan (>= start)
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

      // 3) totals_store: hapus target yg bentrok utk periode yang beririsan (end_date >= start)
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

    // ====== MURAJAAH (opsional): hanya jika tabelnya ada ======
    const mur = await detectMurajaah(db);
    if (mur){
      // 5) murajaah: hapus calon duplikat di tujuan (>= start jika ada kolom tanggal)
      const delSql = `
        DELETE FROM ${mur.table} AS t
         WHERE t.${mur.classCol} = ?
           AND ${mur.keyCol} IN (${ph(nises.length)})
           ${mur.dateCol ? `AND t.${mur.dateCol} >= ?` : ``}
           AND EXISTS (
             SELECT 1 FROM ${mur.table} s
              WHERE s.${mur.classCol} = ?
                AND s.${mur.keyCol}  = t.${mur.keyCol}
                ${mur.dateCol ? `AND s.${mur.dateCol} = t.${mur.dateCol}` : ``}
                ${mur.sesiCol ? `AND s.${mur.sesiCol} = t.${mur.sesiCol}` : ``}
                ${mur.dateCol ? `AND s.${mur.dateCol} >= ?` : ``}
           )
      `;
      const delBind = mur.dateCol
        ? [kelasTujuan, ...nises, start, kelasAsal, start]
        : [kelasTujuan, ...nises, kelasAsal];
      stmts.push(db.prepare(delSql).bind(...delBind));

      // 6) murajaah: UPDATE kelas dari asal -> tujuan (>= start jika ada kolom tanggal)
      const updSql = `
        UPDATE ${mur.table}
           SET ${mur.classCol}=?, updated_at=?
         WHERE ${mur.classCol}=? 
           ${mur.dateCol ? `AND ${mur.dateCol} >= ?` : ``}
           AND ${mur.keyCol} IN (${ph(nises.length)})
      `;
      const updBind = mur.dateCol
        ? [kelasTujuan, now, kelasAsal, start, ...nises]
        : [kelasTujuan, now, kelasAsal, ...nises];
      stmts.push(db.prepare(updSql).bind(...updBind));
    }

    // Eksekusi dalam satu transaksi aman
    await db.batch(stmts);

    return json({
      success:true,
      totalMoved,
      details,
      from: kelasAsal,
      to: kelasTujuan,
      startDate: start,
      murajaahHandled: Boolean(mur)
    });

  }catch(e){
    console.error("pindahKelasMulaiTanggal error:", e);
    return jsonErr(500, e?.message || String(e));
  }
}

/* ================= Utils ================= */
const nowIso = ()=> new Date().toISOString();
const normKelas = (k)=> {
  let v = String(k||"").trim().replace(/-/g,"_");
  if (!/^kelas_/.test(v)) v = `kelas_${v}`;
  return v;
};
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

// Deteksi tabel "murajaah" & kolom-kolom penting secara dinamis
async function detectMurajaah(db){
  // cek ada tabel murajaah
  const t = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='murajaah'`
  ).all();
  if (!(t.results||[]).length) return null;

  // cek kolom
  const cols = await db.prepare(`PRAGMA table_info("murajaah")`).all();
  const C = new Set((cols.results||[]).map(r => String(r.name).toLowerCase()));

  const classCol = C.has("kelas") ? "kelas" : (C.has("class_name") ? "class_name" : null);
  const keyCol   = C.has("student_key") ? "student_key" : (C.has("nis") ? "nis" : null);
  const dateCol  = C.has("tanggal") ? "tanggal" : (C.has("date") ? "date" : null);
  const sesiCol  = C.has("sesi") ? "sesi" : null;

  if (!classCol || !keyCol) return null; // minimal harus ada

  return {
    table: "murajaah",
    classCol,
    keyCol,
    dateCol,   // optional
    sesiCol,   // optional
  };
}
