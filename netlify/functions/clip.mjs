import { getStore } from "@netlify/blobs";

const MAX_CHARS = 500000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";

  if (!/^\d{1,10}$/.test(id)) {
    return json({ error: "Clipboard number must be 1-10 digits." }, 400);
  }

  const store = getStore({ name: "clipboards", consistency: "strong" });
  const now = Date.now();
  const rec = await store.get(id, { type: "json" });
  const live = rec || null;

  if (req.method === "GET") {
    const since = url.searchParams.has("since")
      ? Number(url.searchParams.get("since"))
      : null;

    if (!live) {
      if (since === 0) return json({ changed: false, expiresAt: null });
      return json({ changed: true, text: "", version: 0, expiresAt: null });
    }
    if (since !== null && since === live.version) {
      return json({ changed: false, expiresAt: live.expiresAt });
    }
    return json({
      changed: true,
      text: live.text,
      version: live.version,
      expiresAt: live.expiresAt,
    });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }
    if (typeof body.text !== "string") {
      return json({ error: "Missing text." }, 400);
    }
    if (body.text.length > MAX_CHARS) {
      return json({ error: `Too large (max ${MAX_CHARS} characters).` }, 413);
    }

    if (body.text === "") {
      await store.delete(id);
      return json({ version: 0, expiresAt: null });
    }

    const version = Math.max(now, (live ? live.version : 0) + 1);
    const next = { text: body.text, version, expiresAt: null };
    await store.setJSON(id, next);
    return json({ version, expiresAt: next.expiresAt });
  }

  return json({ error: "Method not allowed." }, 405);
};
