const fetch = require('node-fetch');
const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents/absensi';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async () => {
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { statusCode: res.status, body: JSON.stringify([]) };

    const data = await res.json();
    const absensiFiles = data
      .filter(file => /^kelas_\d+_\d{4}-\d{2}-\d{2}\.json$/.test(file.name))
      .map(file => file.name);

    return { statusCode: 200, body: JSON.stringify(absensiFiles) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify([]) };
  }
};
