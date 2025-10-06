// netlify/functions/getAbsensiRange.js
import fetch from "node-fetch";

/**
 * Helper: GitHub Contents API -> parse JSON dari file
 */
async function fetchGithubJsonFile({ owner, repo, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (res.status === 404) {
    return { ok: false, status: 404, data: null };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, data: text || null };
  }

  const payload = await res.json();
  const decoded = Buffer.from(payload.content, "base64").toString("utf-8");
  try {
    const json = JSON.parse(decoded);
    return { ok: true, status: 200, data: json };
  } catch (e) {
    return { ok: false, status: 422, data: `Invalid JSON in ${path}` };
  }
}

/**
 * Helper: buat range tanggal (YYYY-MM-DD) inklusif
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  let current = new Date(startDate);
  const endD = new Date(endDate);
  if (Number.isNaN(current.getTime()) || Number.isNaN(endD.getTime())) return dates;

  while (current <= endD) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Helper: normalisasi nama kelas ke format "kelas_X"
 */
function normKelas(k) {
  if (!k) return k;
  return String(k).startsWith("kelas_") ? String(k) : `kelas_${k}`;
}

/**
 * Build peta id->nis dari roster kelas_X.json
 */
async function buildIdToNisMap({ owner, repo, kelas, token }) {
  const rosterPath = `${kelas}.json`; // contoh: "kelas_1.json" (root repo)
  const roster = await fetchGithubJsonFile({ owner, repo, path: rosterPath, token });

  if (!roster.ok) {
    // Tetap lanjut tanpa nis injection jika roster tidak ada/invalid
    console.warn(`[getAbsensiRange] roster not available: ${rosterPath} (status ${roster.status})`);
    return { idToNis: {}, nisMeta: {} };
  }

  const idToNis = {};
  const nisMeta = {};
  (roster.data || []).forEach((s) => {
    const idNum = typeof s.id === "number" ? s.id : parseInt(s.id);
    const nis = s?.nis ? String(s.nis).trim() : null;
    if (idNum && nis) idToNis[idNum] = nis;
    if (nis) {
      nisMeta[nis] = {
        nama: s?.nama || "",
        semester: s?.semester != null ? parseInt(s.semester) : null,
      };
    }
  });

  return { idToNis, nisMeta };
}

export async function handler(event) {
  try {
    const token = process.env.MTQ_TOKEN;
    const owner = "mrdickymiswardi";
    const repo = "server";

    if (!token) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MTQ_TOKEN tidak terpasang di environment." }),
      };
    }

    const qs = event.queryStringParameters || {};
    const kelasRaw = qs.kelas;
    const start = qs.start;
    const end = qs.end;

    if (!kelasRaw || !start || !end) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Parameter 'kelas', 'start', dan 'end' wajib diisi",
        }),
      };
    }

    const kelas = normKelas(kelasRaw);
    const tanggalList = generateDateRange(start, end);
    if (!tanggalList.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Rentang tanggal tidak valid." }),
      };
    }

    // Siapkan peta id->nis dari roster kelas_X.json
    const { idToNis } = await buildIdToNisMap({ owner, repo, kelas, token });

    const hasilGabungan = [];

    // Ambil semua file absensi harian dan gabungkan
    for (const tanggal of tanggalList) {
      const fileName = `absensi/${kelas}_${tanggal}.json`;
      const res = await fetchGithubJsonFile({ owner, repo, path: fileName, token });

      if (res.status === 404) {
        // Tidak ada file untuk tanggal ini → lewati saja
        continue;
      }
      if (!res.ok) {
        console.error(`[getAbsensiRange] gagal fetch ${fileName}:`, res.status, res.data);
        // lanjut tanggal berikutnya, jangan matikan semuanya
        continue;
      }

      const daily = Array.isArray(res.data) ? res.data : [];
      // Inject NIS jika hilang
      daily.forEach((it) => {
        // sisipkan tanggal jika belum ada (berguna untuk dedup downstream)
        if (it && !it.tanggal) it.tanggal = tanggal;

        if (!it?.nis) {
          // pakai mapping dari roster berdasarkan id
          const idNum = typeof it?.id === "number" ? it.id : parseInt(it?.id);
          const mapped = idNum ? idToNis[idNum] : null;
          if (mapped) it.nis = String(mapped);
        }
      });

      hasilGabungan.push(...daily);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(hasilGabungan),
    };
  } catch (err) {
    console.error("[getAbsensiRange] fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Gagal memproses permintaan." }),
    };
  }
}
