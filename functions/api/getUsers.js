
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request }) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (url.pathname !== "/api/getUsers") return new Response("Not Found", { status: 404, headers: CORS });

  return new Response(JSON.stringify([
    { username: "dummy_user", password: "dummy_pass", kelas: [] }
  ]), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS, "Cache-Control": "no-store" },
  });
}
