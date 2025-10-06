import { Buffer } from "node:buffer";

export async function handler() {
  const token = process.env.MTQ_TOKEN;
  const githubApiUrl = "https://api.github.com/repos/mrdickymiswardi/server/contents/user.json";

  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal fetch data: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Decode base64 ke teks
    const content = Buffer.from(result.content, "base64").toString("utf-8");

    return {
      statusCode: 200,
      body: content // langsung JSON string
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
