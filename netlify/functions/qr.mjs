import QRCode from "qrcode";

export default async (req) => {
  const url = new URL(req.url);
  const value = url.searchParams.get("url") || "";
  let target;
  try { target = new URL(value); } catch { return new Response("Invalid URL", { status: 400 }); }
  if (target.origin !== url.origin || value.length > 500) return new Response("Invalid URL", { status: 400 });
  const svg = await QRCode.toString(value, { type: "svg", margin: 2, width: 280, color: { dark: "#111827", light: "#ffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
};
