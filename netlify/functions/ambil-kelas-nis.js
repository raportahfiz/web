const fetch = require('node-fetch');

const REPO = 'mrdickymiswardi/server';
const TOKEN = process.env.MTQ_TOKEN;
const BRANCH = 'main';
const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.v3+json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const kelas = event.queryStringParameters?.kelas;
  if (!kelas) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Parameter kelas wajib diisi.' }) };
  }

  try {
    // Ambil file kelas_{x}.json dari GitHub
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${kelas}.json?ref=${BRANCH}`, { headers });
    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 500, body: JSON.stringify({ message: 'Gagal ambil file kelas', error: errText }) };
    }

    const data = await res.json();
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    const santri = JSON.parse(decoded);

    // Ambil hanya properti id, nis, nama
    const result = santri.map(s => ({ id: s.id, nis: s.nis, nama: s.nama }));

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: 'Terjadi kesalahan', error: err.message }) };
  }
};
