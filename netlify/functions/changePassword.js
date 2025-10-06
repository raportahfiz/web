const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents/user.json';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { username, oldPassword, newPassword } = JSON.parse(event.body);

    if (!username || !oldPassword || !newPassword) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Username, password lama, dan password baru wajib diisi.' })
      };
    }

    // Ambil isi file user.json dari GitHub
    const res = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    const json = await res.json();
    const currentContent = Buffer.from(json.content, 'base64').toString();
    const users = JSON.parse(currentContent);

    // Cari user dan verifikasi password lama
    const userIndex = users.findIndex(u => u.username === username && u.password === oldPassword);
    if (userIndex === -1) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Username atau password lama salah.' })
      };
    }

    // Update password
    users[userIndex].password = newPassword;
    const updatedContent = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');

    // Push ke GitHub
    const update = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Ganti password untuk ${username}`,
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
      body: JSON.stringify({ message: 'Password berhasil diubah.' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Terjadi kesalahan server.', error: err.message })
    };
  }
};
