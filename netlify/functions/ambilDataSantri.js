import fetch from "node-fetch";
import { Buffer } from "buffer";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  const { kelas } = event.queryStringParameters;

  if (!kelas) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter kelas wajib diisi" }),
    };
  }

  const fileName = `${kelas}.json`; // contoh: kelas_1.json
  const githubApiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/${fileName}`;

  try {
    // Ambil file dari GitHub
    const res = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "NetlifyFunction",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      throw new Error(`Gagal ambil data GitHub: ${res.statusText}`);
    }

    const fileData = await res.json();
    const contentDecoded = Buffer.from(fileData.content, "base64").toString("utf-8");
    const santriList = JSON.parse(contentDecoded);

    return {
      statusCode: 200,
      body: JSON.stringify(santriList),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
