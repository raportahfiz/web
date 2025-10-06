// netlify/functions/aksesAutoUpdateAllJuzMur.js  (COMMONJS, Node 18+)

const GITHUB_REPO = "mrdickymiswardi/server";
const FILE_PATH   = "autoUpdateAllJuzMur.json"; // ← khusus Murajaah
const BRANCH      = "main";

const TOKEN = process.env.MTQ_TOKEN;

const ghHeaders = () => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});

const fileUrl = (path = FILE_PATH) =>
  `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;

const putUrl = (path = FILE_PATH) =>
  `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;

async function getCurrentFile() {
  const res = await fetch(fileUrl(), { headers: ghHeaders() });
  if (res.status === 404) {
    // file belum ada
    return { sha: null, contentStr: "[]" };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GET GitHub failed ${res.status}: ${t}`);
  }
  const json = await res.json();
  const contentStr = Buffer.from(json.content || "", "base64").toString("utf8");
  const sha = json.sha;
  return { sha, contentStr };
}

function base64Encode(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

exports.handler = async (event) => {
  try {
    if (!TOKEN) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "MTQ_TOKEN belum diset di environment." }),
      };
    }

    // === GET: ambil isi file seadanya (array JSON) ===
    if (event.httpMethod === "GET") {
      try {
        const { contentStr } = await getCurrentFile();
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: contentStr,
        };
      } catch (e) {
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: String(e.message || e) }),
        };
      }
    }

    // === POST: upsert per kelas (fromDate, toDate, metadata) ===
    if (event.httpMethod === "POST") {
      let payload = {};
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Body bukan JSON valid." }) };
      }

      const { fromDate, toDate, kelas, data } = payload || {};
      if (!kelas) {
        return { statusCode: 400, body: JSON.stringify({ error: "Parameter 'kelas' wajib ada." }) };
      }

      const { sha, contentStr } = await getCurrentFile();

      let arr;
      try {
        const parsed = JSON.parse(contentStr);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        arr = [];
      }

      const nowIso = new Date().toISOString();
      const idx = arr.findIndex((x) => x && x.kelas === kelas);

      const record = {
        kelas,
        fromDate: fromDate || "",
        toDate: toDate || "",
        // metadata opsional
        updatedAt: nowIso,
        count: Array.isArray(data) ? data.length : 0,
      };

      if (idx >= 0) arr[idx] = { ...arr[idx], ...record };
      else arr.push(record);

      const newContent = JSON.stringify(arr, null, 2);

      const putBody = {
        message: `autoUpdateAllJuzMur: upsert kelas=${kelas} (${fromDate || ""}..${toDate || ""})`,
        content: base64Encode(newContent),
        branch: BRANCH,
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(putUrl(), {
        method: "PUT",
        headers: ghHeaders(),
        body: JSON.stringify(putBody),
      });

      if (!putRes.ok) {
        const t = await putRes.text().catch(() => "");
        return {
          statusCode: putRes.status,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: `PUT GitHub failed ${putRes.status}: ${t}` }),
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, saved: record }),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
