// netlify/functions/getMarksAudio.js
import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const { id, tanggal, kelas } = event.queryStringParameters || {};

  if (!id || !tanggal || !kelas) {
    return { statusCode: 400, body: JSON.stringify({ error: "Parameter id, tanggal, atau kelas tidak ada" }) };
  }

  try {
    const fileName = `${kelas}_${tanggal}.json`;
    const url = `https://api.github.com/repos/mrdickymiswardi/server/contents/absensi/${fileName}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
    });

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: "File tidak ditemukan" }) };
    }

    const json = await res.json();
    const content = Buffer.from(json.content, "base64").toString("utf-8");
    const data = JSON.parse(content);

    // Cari santri berdasarkan id
    const santri = data.find(s => s.id == id);
    if (!santri) {
      return { statusCode: 404, body: JSON.stringify({ error: "Santri tidak ditemukan" }) };
    }

    // Ambil marks + audio
    const marksAudio = santri.marks || {};

    return {
      statusCode: 200,
      body: JSON.stringify({
        nama: santri.nama,
        marks: marksAudio
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
