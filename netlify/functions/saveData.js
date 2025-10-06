// netlify/functions/saveData.js
import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { tanggal, kelas, data } = JSON.parse(event.body);

    if (!tanggal || !kelas || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Data tidak lengkap" }),
      };
    }

    const fileName = `${kelas}_${tanggal}.json`;
    const url = `https://api.github.com/repos/mrdickymiswardi/server/contents/absensi/${fileName}`;

    // Ambil data lama dari GitHub
    let sha = null;
    let existingData = [];
    const existingRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
    });

    if (existingRes.status === 200) {
      const json = await existingRes.json();
      sha = json.sha;
      const content = Buffer.from(json.content, "base64").toString("utf-8");
      existingData = JSON.parse(content);
    }

    // Merge data baru + audio lama
    const mergedData = data.map(newItem => {
      const oldItem = existingData.find(e => e.id === newItem.id) || {};
      const oldMarks = oldItem.marks || {};
      const newMarks = newItem.marks || {};

      // Merge audio: gabungkan lama + baru tanpa duplikat
      const audio = Array.isArray(oldMarks.audio) ? [...oldMarks.audio] : [];
      if (Array.isArray(newMarks.audio)) {
        newMarks.audio.forEach(a => {
          if (!audio.includes(a)) audio.push(a);
        });
      }
      newMarks.audio = audio;

      return {
        ...newItem,
        marks: newMarks
      };
    });

    // Simpan ke GitHub
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `Update data absensi ${kelas} tanggal ${tanggal}`,
        content: Buffer.from(JSON.stringify(mergedData, null, 2)).toString("base64"),
        sha: sha || undefined,
      }),
    });

    if (!res.ok) throw new Error(`Gagal menyimpan data: ${res.status}`);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
