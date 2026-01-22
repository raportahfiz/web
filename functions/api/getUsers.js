
// Cloudflare Pages Functions
// Endpoint: /api/getUsers
// GET  -> dummy list (agar DevTools melihat palsu)
// POST -> autentikasi server-side (cek user.json private), return user safe (tanpa password)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DUMMY_USERS = [
  { username: "zRB&91q2@m", password: "8#zL9!pQx2@mR5tVkP$7wN*2yB&9zX1q", kelas: [], nis: [], role: "user" }
];

function headers(extra = {}) {
  return {
    ...CORS,
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    ...extra,
  };
}

// helper: ambil array kelas dari berbagai nama field
function getKelas(u) {
  // admin Anda pakai akses_kelas, user lain pakai kelas
  if (Array.isArray(u?.kelas)) return u.kelas;
  if (Array.isArray(u?.akses_kelas)) return u.akses_kelas;
  return [];
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (url.pathname !== "/api/getUsers") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  // GET: selalu dummy supaya di Network terlihat palsu
  if (request.method === "GET") {
    return new Response(JSON.stringify(DUMMY_USERS), { status: 200, headers: headers() });
  }

  // POST: autentikasi
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
      return new Response(JSON.stringify({ ok: false, error: "GitHub API error", status: res.status, msg }), {
        status: 500,
        headers: headers(),
      });
    }

    const data = await res.json();
    const base64 = (data.content || "").replace(/\n/g, "");
    const jsonText = atob(base64);

    const users = JSON.parse(jsonText); // sesuai user.json Anda: array

    const found = Array.isArray(users)
      ? users.find(u => u && u.username === username && u.password === password)
      : null;

    if (!found) {
      // salah login -> tetap balas dummy agar DevTools tidak dapat data asli
      return new Response(JSON.stringify({ ok: false, users: DUMMY_USERS }), {
        status: 401,
        headers: headers(),
      });
    }

    // aman: balas profil TANPA password
    const safeUser = {
      username: found.username,
      role: found.role || "user",
      kelas: getKelas(found),
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
