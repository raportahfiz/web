
const CORS = {
  "Access-Control-Allow-Origin": "*", // saran: ganti ke domain Anda
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function base64urlEncode(strOrBuf) {
  const bytes = typeof strOrBuf === "string" ? new TextEncoder().encode(strOrBuf) : new Uint8Array(strOrBuf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecodeToString(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64urlEncode(sig);
}

async function createSessionToken(secret, payloadObj) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payloadObj));
  const toSign = `${headerB64}.${payloadB64}`;
  const sigB64 = await hmacSign(secret, toSign);
  return `${toSign}.${sigB64}`;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (url.pathname !== "/api/login") return new Response("Not Found", { status: 404, headers: CORS });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, error: "Missing username/password" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Ambil user.json dari GitHub (private repo) server-side
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
        headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
      });
    }

    const data = await res.json();
    const base64 = (data.content || "").replace(/\n/g, "");
    const jsonText = atob(base64);

    const users = JSON.parse(jsonText); // asumsi: array of user objects
    const found = Array.isArray(users)
      ? users.find(u => u && u.username === username && u.password === password)
      : null;

    if (!found) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
      });
    }

    // Payload session: simpan izin akses tanpa password
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: found.username,
      kelas: found.kelas || [],
      nis: found.nis || [],
      iat: now,
      exp: now + 60 * 60 * 8, // 8 jam
    };

    if (!env.AUTH_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "Missing AUTH_SECRET env var" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
      });
    }

    const token = await createSessionToken(env.AUTH_SECRET, payload);

    // Set cookie HttpOnly agar tidak bisa dibaca JS (lebih aman dari XSS)
    const cookie = [
      `session=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=28800", // 8 jam
    ].join("; ");

    return new Response(JSON.stringify({ ok: true, username: found.username }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS,
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }
}
