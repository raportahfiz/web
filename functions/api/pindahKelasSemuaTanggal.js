// /functions/api/pindahKelasSemuaTanggal.js
export const onRequestOptions = () => json({}, 204);

export async function onRequestPost(ctx){
  const db = ctx.env.ABSENSI_DB || ctx.env.DB;
  if (!db) return jsonErr(500, "Database binding (env.ABSENSI_DB) tidak tersedia.");

  try{
    const b = await ctx.request.json();
    const kelasAsal   = normKelas(b?.kelasAsal);
    const kelasTujuan = normKelas(b?.kelasTujuan);
    const nisesIn     = arr(b?.nises);   // = student_key

    if (!kelasAsal || !kelasTujuan) return jsonErr(400,"Wajib: kelasAsal & kelasTujuan");
    if (kelasAsal === kelasTujuan)  return jsonErr(400,"kelasAsal dan kelasTujuan tidak boleh sama");
    if (!nisesIn.length)            return jsonErr(400,"Wajib: nises[] (student_key/NIS)");

    const nises = [...new Set(nisesIn.map(String).filter(Boolean))];
    const now = nowIso();

    // Ringkasan (sebelum update) untuk feedback UI
    const before = await db.prepare(
      `SELECT tanggal, COUNT(*) AS cnt
         FROM attendance_snapshots
        WHERE class_name=? AND student_key IN (${ph(nises.length)})
        GROUP BY tanggal ORDER BY tanggal`
    ).bind(kelasAsal, ...nises).all();

    const details = (before.results||[]).map(r=>({ tanggal:r.tanggal, moved:Number(r.cnt||0) }));
    const totalMoved = details.reduce((a,b)=>a+b.moved,0);

    const stmts = [
      // --- attendance_snapshots: hapus duplikat di tujuan ---
      db.prepare(
        `DELETE FROM attendance_snapshots AS t
          WHERE t.class_name = ?
            AND t.student_key IN (${ph(nises.length)})
            AND EXISTS (
              SELECT 1 FROM attendance_snapshots s
               WHERE s.class_name = ?
                 AND s.tanggal    = t.tanggal
                 AND s.student_key= t.student_key
            )`
      ).bind(kelasTujuan, ...nises, kelasAsal),

      // --- attendance_snapshots: pindahkan semua tanggal ---
      db.prepare(
        `UPDATE attendance_snapshots
            SET class_name=?, updated_at=?
          WHERE class_name=? AND student_key IN (${ph(nises.length)})`
      ).bind(kelasTujuan, now, kelasAsal, ...nises),

      // --- totals_store: hapus duplikat di tujuan ---
      db.prepare(
        `DELETE FROM totals_store AS t
          WHERE t.kelas = ?
            AND t.student_key IN (${ph(nises.length)})
            AND EXISTS (
              SELECT 1 FROM totals_store s
               WHERE s.kelas = ?
                 AND s.student_key = t.student_key
                 AND s.start_date  = t.start_date
                 AND s.end_date    = t.end_date
            )`
      ).bind(kelasTujuan, ...nises, kelasAsal),

      // --- totals_store: pindahkan semua periode ---
      db.prepare(
        `UPDATE totals_store
            SET kelas=?, updated_at=?
          WHERE kelas=? AND student_key IN (${ph(nises.length)})`
      ).bind(kelasTujuan, now, kelasAsal, ...nises),
    ];

    // ==== MURAJAAH (opsional): hanya jika tabelnya ada ====
    const mur = await detectMurajaah(db);
    if (mur){
      // 1) Hapus duplikat di tujuan untuk kombinasi kunci yang sama
      const delSql = `
        DELETE FROM ${mur.table} AS t
         WHERE t.${mur.classCol} = ?
           AND t.${mur.keyCol} IN (${ph(nises.length)})
           AND EXISTS (
             SELECT 1 FROM ${mur.table} s
              WHERE s.${mur.classCol} = ?
                AND s.${mur.keyCol}  = t.${mur.keyCol}
                ${mur.dateCol ? `AND s.${mur.dateCol} = t.${mur.dateCol}` : ``}
                ${mur.sesiCol ? `AND s.${mur.sesiCol} = t.${mur.sesiCol}` : ``}
           )
      `;
      stmts.push(
        db.prepare(delSql).bind(kelasTujuan, ...nises, kelasAsal)
      );

      // 2) Update kelas dari asal -> tujuan (semua tanggal)
      const updSql = `
        UPDATE ${mur.table}
           SET ${mur.classCol}=?, updated_at=?
         WHERE ${mur.classCol}=? AND ${mur.keyCol} IN (${ph(nises.length)})
      `;
      stmts.push(
        db.prepare(updSql).bind(kelasTujuan, now, kelasAsal, ...nises)
      );
    }

    // Eksekusi dalam satu transaksi aman
    await db.batch(stmts);

    return json({
      success:true,
      totalMoved,
      details,
      from:kelasAsal,
      to:kelasTujuan,
      murajaahHandled: Boolean(mur)
    });

  }catch(e){
    console.error("pindahKelasSemuaTanggal error:", e);
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
