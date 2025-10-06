import fetch from "node-fetch";

export async function handler(event) {
  const token = process.env.MTQ_TOKEN; // token GitHub untuk akses repo privat
  const { kelas, from, to } = event.queryStringParameters;

  if (!kelas || !from || !to) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter 'kelas', 'from', dan 'to' wajib diisi" }),
    };
  }

  // Fungsi bantu konversi string tanggal ke Date
  const parseDate = (str) => {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const startDate = parseDate(from);
  const endDate = parseDate(to);

  const dateList = [];
  for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    dateList.push(`${yyyy}-${mm}-${dd}`);
  }

  const results = [];

  for (const tanggal of dateList) {
    try {
      // Ambil file JSON kelas per tanggal
      const url = `https://raw.githubusercontent.com/dickymiswardi/usermtq/main/absensi/${kelas}_${tanggal}.json`;
      const res = await fetch(url, {
        headers: { Authorization: `token ${token}` },
      });

      let data = [];
      if (res.ok) {
        data = await res.json();
      } // else biarkan kosong jika file tidak ada

      // format sesuai permintaan frontend
      const formattedData = data.map(s => ({
        id: s.id,
        absensi: s.absensi || "",
        dari: s.dari || "1:1",
        sampai: s.sampai || "1:1",
        halaman: s.halaman || "-",
        totalHalaman: s.totalHalaman || "-",
        juzTerbaca: s.juzTerbaca || "-",
        totalJuz: s.totalJuz || 0,
        buttonCell: s.buttonCell || null
      }));

      results.push({ tanggal, data: formattedData });
    } catch (err) {
      console.error(`Gagal ambil data ${kelas} ${tanggal}:`, err);
      results.push({ tanggal, data: [] });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(results),
  };
}
