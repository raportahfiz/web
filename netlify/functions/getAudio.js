// netlify/functions/getAudio.js
import fetch from 'node-fetch';

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const { file } = event.queryStringParameters || {};
  if (!file) return { statusCode: 400, body: 'File tidak ada' };

  const url = `https://api.github.com/repos/mrdickymiswardi/server/contents/audio/${file}`;

  // Tentukan MIME type berdasarkan ekstensi
  const ext = file.split('.').pop().toLowerCase();
  let mime = 'audio/wav';
  if (ext === 'mp3') mime = 'audio/mpeg';
  if (ext === 'ogg') mime = 'audio/ogg';

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' }
    });
    if (!res.ok) return { statusCode: res.status, body: 'Gagal fetch audio' };

    const buffer = await res.arrayBuffer();
    return {
      statusCode: 200,
      headers: { 'Content-Type': mime },
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch(err) {
    return { statusCode: 500, body: err.message };
  }
}
