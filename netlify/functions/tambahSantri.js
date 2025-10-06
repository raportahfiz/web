// netlify/functions/tambahSantri.js
import fetch from "node-fetch";
import { Buffer } from "buffer";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "MTQ_TOKEN tidak terpasang di environment." }),
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body harus JSON." }) };
  }

  const { nama, semester, kelas, nis, jenjang = "" } = payload;

  // Validasi minimal
  if (!nama || !semester || !kelas || !nis) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter nama, semester, kelas, dan nis wajib diisi." }),
    };
  }
  if (!/^[1-6]$/.test(String(semester))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Semester harus 1-6." }) };
  }
  // Jenjang boleh kosong atau A1..A8. Jika ingin wajib, ganti validasi jadi: if (!/^A[1-8]$/.test(jenjang)) { ... }
  if (jenjang && !/^A[1-8]$/.test(String(jenjang))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Jenjang harus A1-A8 (atau kosong)." }) };
  }

  // Normalisasi nama file kelas
  const normKelas = (() => {
    const k = String(kelas).trim();
    return k.startsWith("kelas_") ? k : `kelas_${k}`;
  })();
  const fileName = `${normKelas}.json`;
  const githubApiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/${encodeURIComponent(fileName)}`;

  try {
    // 1) Ambil file lama dari GitHub
    const getRes = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "NetlifyFunction",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!getRes.ok) {
      const txt = await getRes.text();
      return { statusCode: getRes.status, body: txt };
    }

    const fileData = await getRes.json();
    const contentDecoded = Buffer.from(fileData.content || "", "base64").toString("utf-8");

    let santriList = [];
    try {
      santriList = JSON.parse(contentDecoded);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: "Gagal parse JSON roster kelas." }) };
    }
    if (!Array.isArray(santriList)) {
      return { statusCode: 500, body: JSON.stringify({ error: "Struktur roster tidak valid (bukan array)." }) };
    }

    // (Opsional) Cegah duplikasi NIS
    if (santriList.some(s => String(s?.nis ?? "").trim() === String(nis).trim())) {
      return { statusCode: 409, body: JSON.stringify({ error: `NIS '${nis}' sudah ada.` }) };
    }

    // 2) Buat ID baru yang robust
    const currentMaxId = santriList.reduce((max, s) => {
      const n = Number(s?.id);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    const nextId = currentMaxId + 1;

    // 3) Tambahkan santri (sertakan JENJANG)
    santriList.push({
      id: nextId,
      nis: String(nis).trim(),
      nama: String(nama).trim(),
      semester: String(semester).trim(),
      jenjang: String(jenjang).trim(), // ⬅⬅⬅ INI KUNCI
    });

    // 4) Encode & simpan kembali ke GitHub
    const updatedContent = Buffer.from(JSON.stringify(santriList, null, 2)).toString("base64");

    const putRes = await fetch(githubApiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "NetlifyFunction",
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Menambahkan santri ${nama} (NIS ${nis}) ke ${fileName}`,
        content: updatedContent,
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errorText = await putRes.text();
      return { statusCode: putRes.status, body: errorText };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Santri berhasil ditambahkan" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
