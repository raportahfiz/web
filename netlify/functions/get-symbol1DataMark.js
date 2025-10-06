import fetch from "node-fetch";

export async function handler() {
  const token = process.env.MTQ_TOKEN;

  // URL file di GitHub API
  const files = [
    "https://api.github.com/repos/dickymiswardi/web/contents/symbol1.json",
    "https://api.github.com/repos/dickymiswardi/tadabbur/contents/ayah_page_map.json"
  ];

  try {
    // Ambil semua file paralel
    const results = await Promise.all(
      files.map(async (url) => {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });

        if (!res.ok) throw new Error(`Gagal fetch: ${url} — ${res.status}`);

        const json = await res.json();
        return JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
      })
    );

    const [symbolData, ayahPageMap] = results;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbolData, ayahPageMap })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message })
    };
  }
}
