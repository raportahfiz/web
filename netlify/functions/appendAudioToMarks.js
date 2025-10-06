// netlify/functions/appendAudioToMarks.js
import fetch from "node-fetch";

/**
 * Body (JSON):
 * {
 *   "id": "12345",            // id santri (string/number)
 *   "kelas": "VIIA",          // kode/nama kelas
 *   "tanggal": "2025-08-01",  // format yang dipakai file absensi
 *   "filename": "rec_VIIA_12345_2025-08-01_1691234567890.webm"
 * }
 *
 * ENV:
 *   MTQ_TOKEN = GitHub Personal Access Token dengan akses repo
 */
export async function handler(event) {
  const token = process.env.MTQ_TOKEN;

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const { id, kelas, tanggal, filename } = JSON.parse(event.body || "{}");

    if (!id || !kelas || !tanggal || !filename) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Param id, kelas, tanggal, filename wajib ada",
        }),
      };
    }

    const fileName = `${kelas}_${tanggal}.json`;
    const url = `https://api.github.com/repos/mrdickymiswardi/server/contents/absensi/${fileName}`;

    // 1) Ambil file absensi
    const getRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!getRes.ok) {
      // Ikuti pola getMarksAudio: jika file tidak ada, kembalikan error
      const text = await getRes.text().catch(() => "");
      return {
        statusCode: getRes.status,
        body: JSON.stringify({
          success: false,
          error: `Gagal ambil absensi (${getRes.status}). ${text}`,
        }),
      };
    }

    const getJson = await getRes.json();
    const sha = getJson.sha;
    const contentStr = Buffer.from(getJson.content, "base64").toString("utf-8");

    let data;
    try {
      data = JSON.parse(contentStr);
      if (!Array.isArray(data)) throw new Error("Format absensi bukan array");
    } catch (e) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: `Gagal parse JSON absensi: ${e.message}`,
        }),
      };
    }

    // 2) Cari santri berdasarkan id (longgar: ==)
    const idx = data.findIndex((s) => s && s.id == id);
    if (idx === -1) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: "Santri tidak ditemukan pada file absensi",
        }),
      };
    }

    // 3) Pastikan struktur marks.audio
    const santri = data[idx];
    if (typeof santri.marks !== "object" || santri.marks === null) {
      santri.marks = {};
    }
    if (!Array.isArray(santri.marks.audio)) {
      santri.marks.audio = [];
    }

    // 4) Tambahkan filename (hindari duplikasi)
    if (!santri.marks.audio.includes(filename)) {
      santri.marks.audio.push(filename);
    }

    // 5) Tulis kembali file ke GitHub
    const newContent = Buffer.from(JSON.stringify(data, null, 2), "utf-8").toString("base64");

    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `Append audio for id=${id}: ${filename} (kelas=${kelas}, tanggal=${tanggal})`,
        content: newContent,
        sha, // wajib untuk update
      }),
    });

    const putText = await putRes.text();
    let putJson = {};
    try {
      putJson = JSON.parse(putText);
    } catch {
      // biarkan kosong; jika gagal JSON kita tampilkan raw text
    }

    if (!putRes.ok) {
      return {
        statusCode: putRes.status,
        body: JSON.stringify({
          success: false,
          error: putJson?.message || `Gagal update absensi: ${putText}`,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        file: fileName,
        id,
        kelas,
        tanggal,
        filename,
        audioCount: santri.marks.audio.length,
        commit: putJson?.commit?.sha || null,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
}
