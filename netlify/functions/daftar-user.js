const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents/user.json';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { username, password, akses_kelas } = JSON.parse(event.body);

    if (!username || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Username dan password wajib diisi.' })
      };
    }

    // Ambil isi file user.json dari GitHub
    const res = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ message: 'Gagal mengambil user.json dari GitHub.' })
      };
    }

    const json = await res.json();
    const currentContent = Buffer.from(json.content, 'base64').toString();
    const users = JSON.parse(currentContent);

    // Cek apakah username sudah ada
    if (users.some(u => u.username === username)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Username sudah terdaftar.' })
      };
    }

    // Siapkan user baru dengan akses_kelas (default: [])
    const userBaru = {
      username,
      password,
      akses_kelas: Array.isArray(akses_kelas) ? akses_kelas : []
    };

    // Tambahkan ke daftar user
    users.push(userBaru);
    const updatedContent = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');

    // Push perubahan ke GitHub
    const update = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Tambah user ${username}`,
        content: updatedContent,
        sha: json.sha
      })
    });

    if (!update.ok) {
      const text = await update.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Gagal menyimpan ke GitHub.', error: text })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Pendaftaran berhasil!' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Terjadi kesalahan server.', error: err.message })
    };
  }
};
