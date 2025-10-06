import fetch from "node-fetch";

export async function handler(event) {
  try {
    const token = process.env.MTQ_TOKEN;
    const { kelas, identifier } = JSON.parse(event.body);

    if (!kelas || !identifier) {
      return { statusCode: 400, body: JSON.stringify({ error: "kelas & identifier wajib" }) };
    }

    const filePath = kelas.toLowerCase().startsWith("kelas_") ? `${kelas}.json` : `kelas_${kelas}.json`;
    const apiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/${filePath}`;

    // Ambil file terbaru
    const getRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
    });

    if (!getRes.ok) return { statusCode: getRes.status, body: JSON.stringify({ error: "Gagal ambil file" }) };

    const fileData = await getRes.json();
    const sha = fileData.sha;
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");
    let santriData = JSON.parse(content);

    // Hapus santri berdasarkan id atau nis
    santriData = santriData.filter(s => s.id != identifier && s.nis != identifier);

    // Update file ke GitHub
    const updateRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      body: JSON.stringify({
        message: `Hapus santri ${identifier}`,
        content: Buffer.from(JSON.stringify(santriData, null, 2)).toString("base64"),
        sha,
        committer: { name: "admin", email: "admin@local" }
      })
    });

    if (!updateRes.ok) return { statusCode: updateRes.status, body: JSON.stringify({ error: "Gagal update file" }) };

    return { statusCode: 200, body: JSON.stringify({ success: true, deleted: identifier }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
