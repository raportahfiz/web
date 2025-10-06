// netlify/functions/getUsersNis.js
import { Buffer } from "node:buffer";

export async function handler() {
  const token = process.env.MTQ_TOKEN;
  const githubApiUrl = "https://api.github.com/repos/mrdickymiswardi/server/contents/user.json";

  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal fetch data: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Decode base64 -> teks JSON
    const content = Buffer.from(result.content || "", "base64").toString("utf-8");

    // Parse ke array users
    const users = JSON.parse(content || "[]");

    // Kumpulkan NIS unik (berdasarkan normalisasi: trim + lowercase),
    // tapi simpan nilai tampilan aslinya.
    const seen = new Set();
    const usedNis = [];

    for (const u of users || []) {
      const arr = Array.isArray(u?.nis) ? u.nis : (u?.nis ? [u.nis] : []);
      for (const n of arr) {
        const key = String(n ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        usedNis.push(String(n ?? "").trim());
      }
    }

    return {
      statusCode: 200,
      // Kembalikan sebagai JSON string
      body: JSON.stringify({ usedNis, count: usedNis.length })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
