// /functions/api/gitFile.js
// POST /api/gitFile
// Body JSON:
//   { action: "get", owner, repo, path, branch? }
//   { action: "put", owner, repo, path, branch?, content, message?, sha? }
// ENV: GITHUB_TOKEN (wajib), optional: BUILD_WEBHOOK_URL

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "cf-pages-functions",
});

// UTF-8 safe base64 helpers
const dec = new TextDecoder();
const enc = new TextEncoder();
const b64decode = (b64 = "") => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};
const b64encode = (str = "") => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const safeText = async (res) => {
  try { return await res.text(); } catch { return ""; }
};

const isSafePath = (p = "") =>
  !p.includes("..") && !p.startsWith("/") && !p.startsWith("\\");

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const token = env.GITHUB_TOKEN;
  if (!token) return json(500, { error: "ENV GITHUB_TOKEN tidak ditemukan" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body bukan JSON valid" });
  }

  const { action, owner, repo, path, branch = "main" } = body || {};
  if (!action || !owner || !repo || !path) {
    return json(400, { error: "Param wajib: action, owner, repo, path" });
  }
  if (!isSafePath(path)) {
    return json(400, { error: "Path tidak valid" });
  }

  const base =
    `https://api.github.com/repos/${owner}/${repo}/contents/` +
    `${encodeURIComponent(path)}`;

  try {
    // === GET file content (decoded) + sha ===
    if (action === "get") {
      const r = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, {
        headers: ghHeaders(token),
      });

      if (!r.ok) {
        return json(r.status, {
          error: `GET gagal: ${r.status} ${r.statusText}`,
          more: (await safeText(r)).slice(0, 500),
        });
      }

      const js = await r.json(); // { content, sha, ... }
      const content = b64decode(js.content || "");
      return json(200, { content, sha: js.sha });
    }

    // === PUT/UPSERT file content ===
    if (action === "put") {
      const { content, message = `update ${path}`, sha } = body || {};
      if (typeof content !== "string") {
        return json(400, { error: "content (string) wajib" });
      }

      const payload = {
        message,
        content: b64encode(content),
        branch,
        ...(sha ? { sha } : {}),
      };

      const r = await fetch(base, {
        method: "PUT",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        return json(r.status, {
          error: `PUT gagal: ${r.status} ${r.statusText}`,
          more: (await safeText(r)).slice(0, 800),
        });
      }

      const js = await r.json(); // { commit: { sha }, content: {...} }
      let hookStatus = null;

      // Optional: trigger webhook (contoh untuk CI/CD eksternal)
      if (env.BUILD_WEBHOOK_URL) {
        try {
          const hr = await fetch(env.BUILD_WEBHOOK_URL, { method: "POST" });
          hookStatus = hr.ok ? "ok" : `fail ${hr.status}`;
        } catch {
          hookStatus = "error";
        }
      }

      return json(200, { ok: true, commit: js.commit?.sha, hookStatus });
    }

    // Unknown action
    return json(400, { error: "action tidak dikenal" });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
