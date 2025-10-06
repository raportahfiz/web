const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    const res = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      const error = await res.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Gagal fetch file kelas', error }),
      };
    }

    const data = await res.json();

    // Ambil hanya file bernama kelas_{}.json
    const kelasFiles = data
      .filter(file => /^kelas_\d+\.json$/.test(file.name))
      .map(file => file.name.replace('.json', '')); // contoh: kelas_1, kelas_2

    return {
      statusCode: 200,
      body: JSON.stringify(kelasFiles),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Terjadi kesalahan', error: err.message }),
    };
  }
};
