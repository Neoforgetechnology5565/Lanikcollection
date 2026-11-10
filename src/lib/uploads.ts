import "server-only";
import { randomBytes } from "node:crypto";
import { putPublicImage } from "./storage";

const SIG: [string, string, (b: Buffer) => boolean][] = [
  ["image/jpeg", "jpg", (b) => b[0] === 0xff && b[1] === 0xd8],
  ["image/png", "png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/webp", "webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
];
export const MAX_IMAGE = 5 * 1024 * 1024;

export function sniffImage(buf: Buffer) { const t = SIG.find(([, , ok]) => ok(buf)); return t ? { mime: t[0], ext: t[1] } : null; }

/** Validates by file signature (not the client's claimed type), then stores via the configured driver. Returns the URL. */
export async function saveProductImage(file: File): Promise<string | null> {
  if (!file.size || file.size > MAX_IMAGE) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const t = sniffImage(buf); if (!t) return null;
  try { return await putPublicImage(`${randomBytes(10).toString("hex")}.${t.ext}`, buf, t.mime); }
  catch (e) { console.error("image upload failed", e); return null; }
}
