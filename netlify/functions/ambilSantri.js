export async function handler(event) {
  const token = process.env.MTQ_TOKEN;
  let kelasParam = event.queryStringParameters?.kelas;

  if (!kelasParam) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter 'kelas' wajib diisi" })
    };
  }

  // Sesuaikan format: jika sudah "kelas_1" biarkan, jika cuma "1" → tambah "kelas_"
  let kelasFile;
  if (kelasParam.toLowerCase().startsWith("kelas_")) {
    kelasFile = `${kelasParam}.json`;
  } else {
    kelasFile = `kelas_${kelasParam}.json`;
  }

  const apiUrl = `https://api.github.com/repos/mrdickymiswardi/server/contents/${kelasFile}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    // Kalau file tidak ada → return array kosong
    if (response.status === 404) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Gagal fetch data: ${response.status}` })
      };
    }

    const result = await response.json();

    // Decode base64 → parse JSON
    let santriData = [];
    try {
      santriData = JSON.parse(Buffer.from(result.content, 'base64').toString('utf-8'));
    } catch (err) {
      console.error("JSON decode error:", err.message);
      santriData = [];
    }

    // Pastikan selalu array
    if (!Array.isArray(santriData)) santriData = [];

    return { statusCode: 200, body: JSON.stringify(santriData) };

  } catch (error) {
    console.error("Error ambilSantri:", error.message);
    return { statusCode: 500, body: JSON.stringify([]) };
  }
}
