import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

const SIG: [string, string, (b: Buffer) => boolean][] = [
  ["image/jpeg", "jpg", (b) => b[0] === 0xff && b[1] === 0xd8],
  ["image/png", "png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/webp", "webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
];
export const MAX_IMAGE = 5 * 1024 * 1024;

/** Validates by file signature (not the client's claimed type) and stores under uploads/products. Returns the public URL. */
export async function saveProductImage(file: File): Promise<string | null> {
  if (!file.size || file.size > MAX_IMAGE) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const t = SIG.find(([, , ok]) => ok(buf));
  if (!t) return null;
  const dir = path.join(process.cwd(), "uploads", "products");
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(10).toString("hex")}.${t[1]}`;
  await writeFile(path.join(dir, name), buf);
  return `/api/uploads/products/${name}`;
}
