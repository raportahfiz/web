import fetch from "node-fetch";

export async function handler() {
  const token = process.env.MTQ_TOKEN;
  const apiUrl = "https://api.github.com/repos/mrdickymiswardi/server/contents/getAyat.json";

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) throw new Error(`Gagal fetch data: ${response.status}`);

    const result = await response.json();

    // Decode isi base64 ke JSON string
    const decoded = Buffer.from(result.content, 'base64').toString('utf-8');

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: decoded
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message })
    };
  }
}
