import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const { kelas } = event.queryStringParameters;

  if (!kelas) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter 'kelas' wajib diisi" }),
    };
  }

  const fileName = `${kelas}.json`;
  const apiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/absensi/${fileName}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.status === 404) {
      return {
        statusCode: 200,
        body: JSON.stringify([]), // Kosong jika file tidak ada
      };
    }

    if (!response.ok) {
      throw new Error(`Gagal mengambil data: ${response.status}`);
    }

    const result = await response.json();
    const decoded = Buffer.from(result.content, "base64").toString("utf-8");

    return {
      statusCode: 200,
      body: decoded,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
