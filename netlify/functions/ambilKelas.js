const fetch = require('node-fetch');
const GITHUB_API = 'https://api.github.com/repos/mrdickymiswardi/server/contents';
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async () => {
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { statusCode: res.status, body: JSON.stringify([]) };

    const data = await res.json();
    const kelasFiles = data
      .filter(file => /^kelas_\d+\.json$/.test(file.name))
      .map(file => file.name.replace('.json', ''));

    return { statusCode: 200, body: JSON.stringify(kelasFiles) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify([]) };
  }
};
