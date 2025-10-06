// functions/api/getUsersNis.js
// Endpoint: GET /api/getUsersNis

const DEFAULT_REPO = "raportahfiz/server";
const USERS_PATH   = "user.json";

const dec = new TextDecoder();
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

const json = (obj, status = 200, cors = true) => {
  const headers = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }
  return new Response(JSON.stringify(obj), { status, headers });
};

export const onRequestOptions = () => json({}, 204);

export async function onRequestGet({ env }) {
  const TOKEN = env.GITHUB_TOKEN;
  const REPO  = env.GITHUB_REPO || DEFAULT_REPO;
  if (!TOKEN) return json({ message: "GITHUB_TOKEN belum diset." }, 500);

  const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(USERS_PATH)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cf-pages-getUsersNis/1.0",
    },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ source: "github", step: "get-users", status: res.status, error: t }, 502);
  }

  const file = await res.json();
  let users = [];
  try { users = JSON.parse(b64decode(file.content || "")) || []; } catch { users = []; }

  const seen = new Set();
  const usedNis = [];
  for (const u of users) {
    const arr = Array.isArray(u?.nis) ? u.nis : (u?.nis ? [u.nis] : []);
    for (const n of arr) {
      const disp = String(n ?? "").trim();
      const key  = disp.toLowerCase();
      if (!disp || seen.has(key)) continue;
      seen.add(key);
      usedNis.push(disp);
    }
  }

  return json({ usedNis, count: usedNis.length }, 200);
}

// Guard method lain
export async function onRequest(ctx) {
  if (!["GET", "OPTIONS"].includes(ctx.request.method.toUpperCase())) {
    return json({ message: "Method Not Allowed" }, 405);
  }
}
