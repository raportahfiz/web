const fetch = require("node-fetch");

const GITHUB_API = "https://api.github.com";
const REPO = "mrdickymiswardi/server";
const TOKEN = process.env.MTQ_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  try {
    const { namaFile } = JSON.parse(event.body || "{}");

    // Validasi format file: kelas_angka.json
    if (!namaFile || !/^kelas_\d+\.json$/.test(namaFile)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Format nama file tidak valid. Gunakan format kelas_{angka}.json",
        }),
      };
    }

    const path = `${namaFile}`; // Simpan di root (bukan di folder /absensi)
    const content = Buffer.from("[]").toString("base64"); // isi awal file

    // Cek apakah file sudah ada
    const checkRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${path}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (checkRes.ok) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: "File sudah ada." }),
      };
    }

    // Buat file baru
    const createRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `Buat file ${namaFile}`,
        content: content,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Gagal membuat file.", error: errText }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `File ${namaFile} berhasil dibuat.` }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Terjadi kesalahan server.", error: err.message }),
    };
  }
};
