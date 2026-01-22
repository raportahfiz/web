
const CORS = {
  "Access-Control-Allow-Origin": "*", // saran: batasi domain
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

function base64urlDecodeToString(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacVerify(secret, message, sigB64url) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Convert base64url signature to bytes
  const b64 = sigB64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sigB64url.length + 3) % 4);
  const bin = atob(b64);
  const sigBytes = Uint8Array.from(bin, c => c.charCodeAt(0));

  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(message));
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (url.pathname !== "/api/me") return new Response("Not Found", { status: 404, headers: CORS });

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const token = cookies.session;

  if (!token || !env.AUTH_SECRET) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }

  const [h, p, s] = parts;
  const toVerify = `${h}.${p}`;

  const valid = await hmacVerify(env.AUTH_SECRET, toVerify, s);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecodeToString(p));
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) {
    return new Response(JSON.stringify({ ok: false, expired: true }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
    });
  }

  // Kembalikan profil tanpa password
  return new Response(JSON.stringify({
    ok: true,
    username: payload.sub,
    kelas: payload.kelas || [],
    nis: payload.nis || [],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
  });
}
