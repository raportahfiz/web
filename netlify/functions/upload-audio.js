import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN; // GitHub Personal Access Token

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    };
  }

  try {
    const { fileName, base64, folder = "audio" } = JSON.parse(event.body);
    if (!fileName || !base64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "fileName dan base64 wajib ada" })
      };
    }

    const cleanBase64 = base64.replace(/^data:.*;base64,/, "");
    const path = `${folder}/${fileName}`;
    const url = `https://api.github.com/repos/mrdickymiswardi/server/contents/${path}`;

    // Cek apakah file sudah ada
    let sha = null;
    try {
      const existing = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      if (existing.ok) {
        const json = await existing.json();
        sha = json.sha;
      }
    } catch { /* file belum ada */ }

    // Upload / update
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: sha ? `Update audio: ${fileName}` : `Add audio: ${fileName}`,
        content: cleanBase64,
        sha: sha || undefined,
      }),
    });

    let jsonRes;
    const textRes = await res.text();
    try { jsonRes = JSON.parse(textRes); } 
    catch { throw new Error(`GitHub respon bukan JSON: ${textRes}`); }

    if (!res.ok) throw new Error(jsonRes.message || "Gagal upload audio");

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, path, commit: jsonRes.commit?.sha || null })
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
  }
}
