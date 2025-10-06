// netlify/functions/getData.js
import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const { tanggal, kelas } = event.queryStringParameters || {};

  if (!tanggal || !kelas) {
    return { statusCode: 400, body: JSON.stringify({ error: "Tanggal atau kelas tidak ada" }) };
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

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
