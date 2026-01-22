
// Cloudflare Pages Functions
// Endpoint: /api/getUsers
// Mode:
// - POST {username,password} -> cek ke user.json (GitHub private) -> return {ok:true,user:{...}} tanpa password
// - Jika salah -> return {ok:false, users:[{dummy}]} (agar DevTools tetap lihat dummy)
// - GET -> return dummy list (untuk kompatibilitas lama, kalau masih ada yang memanggil GET)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function headers(extra = {}) {
  return {
    ...CORS,
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    ...extra,
  };
}

const DUMMY_USERS = [
  { username: "dummy_user_1", password: "dummy_pass_1", kelas: [], nis: [] }
];

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (url.pathname !== "/api/getUsers") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  // GET: selalu dummy (biar yang lihat Network dapat palsu)
  if (request.method === "GET") {
    return new Response(JSON.stringify(DUMMY_USERS), { status: 200, headers: headers() });
  }

  // POST: cek kredensial secara server-side
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST" }), { status: 405, headers: headers() });
  }

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "Missing env.GITHUB_TOKEN" }), {
      status: 500,
      headers: headers(),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: headers(),
    });
  }

  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, users: DUMMY_USERS }), {
      status: 400,
      headers: headers(),
    });
  }

  const githubApiUrl = "https://api.github.com/repos/raportahfiz/server/contents/user.json";

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
      // Jangan bocorkan detail sensitif ke client (opsional).
      // Tapi untuk debug, Anda bisa sementara tampilkan msg.
      return new Response(JSON.stringify({ ok: false, error: "GitHub API error", status: res.status, msg }), {
        status: 500,
        headers: headers(),
      });
    }

    const data = await res.json();
    const base64 = (data.content || "").replace(/\n/g, "");
    const jsonText = atob(base64);

    let parsed = JSON.parse(jsonText);

    // Support 2 format:
    // 1) [ {...}, {...} ]
    // 2) { users: [ ... ] }
    const users = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.users) ? parsed.users : []);

    const found = users.find(u => u && u.username === username && u.password === password);

    if (!found) {
      // Salah -> tetap balas dummy agar DevTools lihat palsu
      return new Response(JSON.stringify({ ok: false, users: DUMMY_USERS }), {
        status: 401,
        headers: headers(),
      });
    }

    // Benar -> balas profil user TANPA password
    const safeUser = {
      username: found.username,
      kelas: Array.isArray(found.kelas) ? found.kelas : [],
      nis: Array.isArray(found.nis) ? found.nis : [],
    };

    return new Response(JSON.stringify({ ok: true, user: safeUser }), {
      status: 200,
      headers: headers(),
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: headers(),
    });
  }
}
