// netlify/functions/gitFile.js
import { Buffer } from "node:buffer";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(status, data) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...cors() }, body: JSON.stringify(data) };
}
async function safeText(res){ try { return await res.text(); } catch { return ""; } }

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };

  try {
    const token = process.env.MTQ_TOKEN;
    if (!token) return json(500, { error: "ENV MTQ_TOKEN tidak ditemukan" });

    const body = JSON.parse(event.body || "{}");
    const { action, owner, repo, branch = "main", path } = body || {};
    if (!action || !owner || !repo || !path) return json(400, { error: "Param wajib: action, owner, repo, path" });

    const base = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

    if (action === "get") {
      const r = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "netlify-fn" },
      });
      if (!r.ok) return json(r.status, { error: `GET gagal: ${r.status} ${r.statusText}`, more: await safeText(r) });
      const js = await r.json();
      const content = Buffer.from(js.content || "", "base64").toString("utf8");
      return json(200, { content, sha: js.sha });
    }

    if (action === "put") {
      const { content, message = `update ${path}`, sha } = body || {};
      if (typeof content !== "string") return json(400, { error: "content (string) wajib" });

      const payload = {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      };
      const r = await fetch(base, {
        method: "PUT",
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "User-Agent": "netlify-fn", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return json(r.status, { error: `PUT gagal: ${r.status} ${r.statusText}`, more: await safeText(r) });
      const js = await r.json();

      // optional deploy trigger
      let hookStatus = null;
      if (process.env.NETLIFY_BUILD_HOOK) {
        try {
          const hr = await fetch(process.env.NETLIFY_BUILD_HOOK, { method: "POST" });
          hookStatus = hr.ok ? "ok" : `fail ${hr.status}`;
        } catch { hookStatus = "error"; }
      }
      return json(200, { ok: true, commit: js.commit?.sha, hookStatus });
    }

    return json(400, { error: "action tidak dikenal" });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}
