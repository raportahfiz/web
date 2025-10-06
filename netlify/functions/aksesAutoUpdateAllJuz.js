// Cloudflare Pages Functions — /api/aksesAutoUpdateAllJuz
// ENV needed: GITHUB_TOKEN (contents:read, contents:write to repo target)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const GITHUB_REPO = "mrdickymiswardi/server";
const FILE_PATH   = "autoUpdateAllJuz.json"; // ganti jika file di subfolder
const BRANCH      = "main";

// ----- Safe base64 UTF-8 helpers (tanpa escape/unescape) -----
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64encode = (str) => {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64decode = (b64) => {
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
};

// ----- GitHub helpers -----
const fileGetUrl = (path = FILE_PATH, branch = BRANCH) =>
  `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
const filePutUrl = (path = FILE_PATH) =>
  `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "cf-pages-functions",
});

async function getCurrentFile(env) {
  const r = await fetch(fileGetUrl(), {
    headers: ghHeaders(env.GITHUB_TOKEN),
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (r.status === 404) return { sha: null, contentStr: "[]" }; // file belum ada
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`GET GitHub failed ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return { sha: j.sha, contentStr: b64decode(j.content || "") };
}

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "GITHUB_TOKEN belum diset di Pages → Settings → Environment variables (Production & Preview)." }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS }
    });
  }

  const url = new URL(request.url);
  if (url.pathname !== "/api/aksesAutoUpdateAllJuz") {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  // === GET: kembalikan isi file apa adanya (string JSON) ===
  if (request.method === "GET") {
    try {
      const { contentStr } = await getCurrentFile(env);
      return new Response(contentStr, {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e?.message || e) }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
  }

  // === POST: upsert by 'kelas' ===
  if (request.method === "POST") {
    // body → { kelas: string, fromDate?: string, toDate?: string, data?: any[] }
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Body bukan JSON valid." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    const { fromDate, toDate, kelas, data } = payload || {};
    if (!kelas) {
      return new Response(JSON.stringify({ error: "Parameter 'kelas' wajib ada." }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    try {
      // 1) read current
      const { sha, contentStr } = await getCurrentFile(env);

      // 2) parse as array
      let arr;
      try {
        const parsed = JSON.parse(contentStr);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch { arr = []; }

      // 3) upsert
      const nowIso = new Date().toISOString();
      const idx = arr.findIndex((x) => x && x.kelas === kelas);
      const record = {
        kelas,
        fromDate: fromDate || "",
        toDate: toDate || "",
        updatedAt: nowIso,
        count: Array.isArray(data) ? data.length : 0,
      };
      if (idx >= 0) arr[idx] = { ...arr[idx], ...record };
      else arr.push(record);

      const newContent = JSON.stringify(arr, null, 2);

      // 4) commit (PUT)
      const body = {
        message: `autoUpdateAllJuz: upsert kelas=${kelas} (${fromDate || ""}..${toDate || ""})`,
        content: b64encode(newContent),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      };

      const putRes = await fetch(filePutUrl(), {
        method: "PUT",
        headers: ghHeaders(env.GITHUB_TOKEN),
        body: JSON.stringify(body),
      });

      if (!putRes.ok) {
        const t = await putRes.text().catch(() => "");
        // 409: conflict (sha outdated). Caller bisa retry.
        return new Response(JSON.stringify({ ok: false, error: `PUT GitHub failed ${putRes.status}`, detail: t.slice(0, 300) }), {
          status: putRes.status, headers: { "Content-Type": "application/json", ...CORS }
        });
      }

      return new Response(JSON.stringify({ ok: true, saved: record }), {
        status: 200, headers: { "Content-Type": "application/json", ...CORS }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e?.message || e) }), {
        status: 500, headers: { "Content-Type": "application/json", ...CORS }
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
