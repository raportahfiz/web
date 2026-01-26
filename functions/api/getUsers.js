// Cloudflare Pages Functions (bukan Node). Endpoint: /api/getUsers
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (url.pathname !== "/api/getUsers") return new Response("Not Found", { status: 404, headers: CORS });

  const githubApiUrl = "https://api.github.com/repos/raportahfiz/server/contents/user.json";
  try {
    const res = await fetch(githubApiUrl, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`, // set di Pages → Settings → Environment variables
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cf-pages-functions"
      }
    });
    if (!res.ok) {
      const msg = await res.text();
      return new Response(JSON.stringify({ error: "GitHub API error", status: res.status, msg }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }
    const data = await res.json();           // { content: "base64", ... }
    const jsonText = atob(data.content);     // decode base64 → string JSON
    return new Response(jsonText, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
}

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
