import { getStore } from "@netlify/blobs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const MAX_CHARS = 500000;
const VALID_ID = /^(?:\d{1,10}|[A-Za-z0-9_-]{12,64})$/;
const ALLOWED_TTLS = new Set([null, 3600000, 86400000, 604800000]);
const rateBuckets = new Map();

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString("hex");
}

function passwordMatches(rec, password) {
  if (!rec?.passwordHash) return true;
  const actual = Buffer.from(hashPassword(password || "", rec.passwordSalt), "hex");
  const expected = Buffer.from(rec.passwordHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function limited(req) {
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const key = `${ip}:${req.method}`;
  const now = Date.now();
  const limit = req.method === "GET" ? 180 : 40;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.started > 60000) {
    rateBuckets.set(key, { started: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (rateBuckets.size > 2000) {
    for (const [k, value] of rateBuckets) if (now - value.started > 60000) rateBuckets.delete(k);
  }
  return bucket.count > limit;
}

export default async (req) => {
  if (limited(req)) return json({ error: "Too many requests. Please wait a minute." }, 429, { "retry-after": "60" });

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!VALID_ID.test(id)) return json({ error: "Invalid clipboard ID." }, 400);

  const store = getStore({ name: "clipboards", consistency: "strong" });
  const now = Date.now();
  let rec = await store.get(id, { type: "json" });
  // Only records saved by the new optional-expiration UI have a ttl field.
  // This keeps legacy records with an old expiresAt value permanent.
  if (rec?.ttl && rec.expiresAt && rec.expiresAt <= now) {
    await store.delete(id);
    rec = null;
  }

  const password = req.headers.get("x-clip-password") || "";
  if (rec?.passwordHash && !passwordMatches(rec, password)) {
    return json({ error: "Password required.", passwordRequired: true }, 401);
  }

  if (req.method === "GET") {
    const since = url.searchParams.has("since") ? Number(url.searchParams.get("since")) : null;
    if (!rec) {
      if (since === 0) return json({ changed: false, expiresAt: null, passwordProtected: false });
      return json({ changed: true, text: "", version: 0, expiresAt: null, passwordProtected: false });
    }
    if (since !== null && since === rec.version) {
      return json({ changed: false, expiresAt: rec.ttl ? rec.expiresAt : null, ttl: rec.ttl ?? null, passwordProtected: Boolean(rec.passwordHash) });
    }
    return json({
      changed: true,
      text: rec.text,
      version: rec.version,
      expiresAt: rec.ttl ? rec.expiresAt : null,
      ttl: rec.ttl ?? null,
      passwordProtected: Boolean(rec.passwordHash),
    });
  }

  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
    if (typeof body.text !== "string") return json({ error: "Missing text." }, 400);
    if (body.text.length > MAX_CHARS) return json({ error: `Too large (max ${MAX_CHARS} characters).` }, 413);

    const baseVersion = Number(body.baseVersion ?? 0);
    if (rec && !body.force && baseVersion !== rec.version) {
      return json({ error: "This clipboard changed on another device.", conflict: true, version: rec.version }, 409);
    }

    const ttl = body.ttl === null || body.ttl === undefined ? null : Number(body.ttl);
    if (!ALLOWED_TTLS.has(ttl)) return json({ error: "Invalid expiration option." }, 400);

    let passwordHash = rec?.passwordHash || null;
    let passwordSalt = rec?.passwordSalt || null;
    if (!rec && typeof body.newPassword === "string" && body.newPassword) {
      if (body.newPassword.length < 4 || body.newPassword.length > 100) return json({ error: "Password must be 4-100 characters." }, 400);
      passwordSalt = randomBytes(16).toString("hex");
      passwordHash = hashPassword(body.newPassword, passwordSalt);
    }

    const version = Math.max(now, (rec?.version || 0) + 1);
    const next = {
      text: body.text,
      version,
      expiresAt: ttl === null ? null : now + ttl,
      ttl,
      passwordHash,
      passwordSalt,
    };
    await store.setJSON(id, next);
    return json({ version, expiresAt: next.expiresAt, ttl, passwordProtected: Boolean(passwordHash) });
  }

  if (req.method === "DELETE") {
    if (!rec) return json({ deleted: true });
    await store.delete(id);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed." }, 405, { allow: "GET, PUT, DELETE" });
};
