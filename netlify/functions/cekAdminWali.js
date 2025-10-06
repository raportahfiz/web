const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents/secureWali.json';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    const { password } = JSON.parse(event.body || '{}');

    if (!password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Password wajib diisi.' }),
      };
    }

    const res = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Gagal mengakses secure.json', error: text }),
      };
    }

    const json = await res.json();
    const decoded = Buffer.from(json.content, 'base64').toString('utf-8');
    const secure = JSON.parse(decoded);

    if (secure.adminPassword !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Password admin salah.' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Password admin valid.' }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Terjadi kesalahan server.', error: err.message }),
    };
  }
};
