import { getStore } from "@netlify/blobs";

const VALID_ID = /^(?:\d{1,10}|[A-Za-z0-9_-]{12,64})$/;
const buckets = new Map();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

function isLimited(req) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.started > 60000) {
    buckets.set(ip, { started: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 30;
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.filter(item => {
    if (!item || typeof item.id !== "string" || !VALID_ID.test(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 10).map(item => ({
    id: item.id,
    name: typeof item.name === "string" ? item.name.slice(0, 80) : "",
    openedAt: Number.isFinite(Number(item.openedAt)) ? Number(item.openedAt) : Date.now(),
  }));
}

export default async req => {
  if (isLimited(req)) return json({ error: "Too many sync requests. Please wait." }, 429);
  const token = req.headers.get("x-sync-token") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid sync code." }, 401);

  const store = getStore({ name: "recent-history", consistency: "strong" });
  if (req.method === "GET") {
    const record = await store.get(token, { type: "json" });
    return json({ items: cleanItems(record?.items) });
  }
  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
    const items = cleanItems(body.items);
    await store.setJSON(token, { items, updatedAt: Date.now() });
    return json({ items });
  }
  if (req.method === "DELETE") {
    await store.delete(token);
    return json({ deleted: true });
  }
  return json({ error: "Method not allowed." }, 405);
};
