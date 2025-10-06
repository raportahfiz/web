export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const kelas = event.queryStringParameters.kelas;

  if (!kelas) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter 'kelas' wajib diisi" })
    };
  }

  // URL API GitHub (bukan raw)
  const apiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/${kelas}.json`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Gagal fetch data: ${response.status}` }),
      };
    }

    const result = await response.json();

    // Decode base64 -> UTF-8
    const decoded = Buffer.from(result.content, 'base64').toString('utf-8');

    return {
      statusCode: 200,
      body: decoded
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
