
// Cloudflare Pages Functions (bukan Node)
// Endpoint: /api/getUsers
// Tujuan: ambil user.json dari GitHub private, tapi kirim ke browser versi "dummy"
// sehingga di DevTools Network tidak terlihat kredensial asli.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withHeaders(extra = {}) {
  return {
    ...CORS,
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    ...extra,
  };
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Pages Functions biasanya sudah route by path,
  // tapi kalau Anda ingin tetap aman, boleh cek:
  if (url.pathname !== "/api/getUsers") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  // Pastikan token ada
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing env.GITHUB_TOKEN" }), {
      status: 500,
      headers: withHeaders(),
    });
  }

  const githubApiUrl =
    "https://api.github.com/repos/raportahfiz/server/contents/user.json";

  try {
    const res = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cf-pages-functions",
      },
    });

    if (!res.ok) {
      const msg = await res.text();
      return new Response(
        JSON.stringify({ error: "GitHub API error", status: res.status, msg }),
        { status: 500, headers: withHeaders() }
      );
    }

    const data = await res.json(); // { content: "base64", ... }
    const base64 = (data.content || "").replace(/\n/g, "");
    const jsonText = atob(base64);

    let usersRaw;
    try {
      usersRaw = JSON.parse(jsonText);
    } catch (e) {
      return new Response(JSON.stringify({ error: "user.json invalid JSON" }), {
        status: 500,
        headers: withHeaders(),
      });
    }

    // Support 2 format:
    // 1) array: [ {...}, {...} ]
    // 2) object: { users: [ ... ] }
    const users = Array.isArray(usersRaw)
      ? usersRaw
      : Array.isArray(usersRaw.users)
      ? usersRaw.users
      : [];

    // --- MASKING ---
    // Kembalikan username & password palsu.
    // Field lain (kelas/nis) boleh ikut kalau Anda butuh untuk fitur filter.
    const masked = users.map((u, i) => ({
      username: `dummy_user_${i + 1}`,
      password: `dummy_pass_${i + 1}`,

      // OPTIONAL: kalau Anda masih butuh akses kelas/nis di frontend, biarkan ikut:
      kelas: Array.isArray(u?.kelas) ? u.kelas : [],
      nis: Array.isArray(u?.nis) ? u.nis : [],
    }));

    // IMPORTANT: Response harus ARRAY karena frontend Anda pakai users.find(...)
    return new Response(JSON.stringify(masked), {
      status: 200,
      headers: withHeaders(),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: withHeaders(),
    });
  }
}
