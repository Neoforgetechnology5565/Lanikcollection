import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage with pluggable drivers, chosen by environment variables:
 *
 *   Public product images:  CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD   (if set), else the main driver
 *   Main driver:            STORAGE_DRIVER=local (default) | s3
 *     s3 (works for AWS S3, Cloudflare R2, Supabase Storage S3, MinIO):
 *       S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 *       S3_ENDPOINT (optional, for R2/Supabase/MinIO), S3_FORCE_PATH_STYLE=1 (optional),
 *       S3_PUBLIC_BASE_URL (required: public URL prefix of the bucket/CDN for product images)
 *
 *   Private files (payment receipts) never become public: they live in the main driver
 *   (local disk or a PRIVATE bucket) and are streamed to admins through an authenticated route.
 */
const driver = () => (process.env.STORAGE_DRIVER ?? "local").toLowerCase();

let s3c: S3Client | null = null;
function s3() {
  if (s3c) return s3c;
  const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("S3 storage is not fully configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
  s3c = new S3Client({
    region: S3_REGION ?? "auto", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    // broadest compatibility with R2 / Supabase / MinIO, which predate the SDK's default checksums
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3c;
}

function cloudinaryCreds() {
  const u = process.env.CLOUDINARY_URL; if (!u) return null;
  const m = u.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/); if (!m) throw new Error("CLOUDINARY_URL must look like cloudinary://KEY:SECRET@CLOUD_NAME");
  return { key: m[1], secret: m[2], cloud: m[3] };
}

/** Signed upload to Cloudinary: signature = sha1("folder=..&timestamp=.." + api_secret). */
export function cloudinarySignature(params: Record<string, string | number>, secret: string) {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(base + secret).digest("hex");
}
async function putCloudinary(buf: Buffer, mime: string, c: { key: string; secret: string; cloud: string }) {
  const timestamp = Math.floor(Date.now() / 1000); const folder = "lanik/products";
  const signature = cloudinarySignature({ folder, timestamp }, c.secret);
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(buf)], { type: mime }), "upload"); fd.set("api_key", c.key); fd.set("timestamp", String(timestamp)); fd.set("folder", folder); fd.set("signature", signature);
  const base = process.env.CLOUDINARY_API_BASE ?? "https://api.cloudinary.com/v1_1";
  const r = await fetch(`${base}/${c.cloud}/image/upload`, { method: "POST", body: fd, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!r.ok || !j.secure_url) throw new Error(`Cloudinary upload failed: ${j.error?.message ?? r.status}`);
  return j.secure_url;
}

const localDir = (sub: string) => path.join(process.cwd(), "uploads", sub);

/** Stores a public product image and returns the URL to save in the database. */
export async function putPublicImage(name: string, buf: Buffer, mime: string): Promise<string> {
  const c = cloudinaryCreds();
  if (c) return putCloudinary(buf, mime, c);
  if (driver() === "s3") {
    const base = process.env.S3_PUBLIC_BASE_URL; if (!base) throw new Error("S3_PUBLIC_BASE_URL is required for public product images");
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: `products/${name}`, Body: buf, ContentType: mime, CacheControl: "public, max-age=31536000, immutable" }));
    return `${base.replace(/\/$/, "")}/products/${name}`;
  }
  await mkdir(localDir("products"), { recursive: true });
  await writeFile(path.join(localDir("products"), name), buf);
  return `/api/uploads/products/${name}`; // served by the app (local disk only suits a single long-lived server)
}

/** Stores a private file (payment receipt). Never returns a public URL. */
export async function putPrivate(name: string, buf: Buffer, mime: string): Promise<void> {
  if (driver() === "s3") { await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: `receipts/${name}`, Body: buf, ContentType: mime })); return; }
  await mkdir(localDir("receipts"), { recursive: true });
  await writeFile(path.join(localDir("receipts"), name), buf);
}
export async function getPrivate(name: string): Promise<Buffer | null> {
  const safe = path.basename(name);
  try {
    if (driver() === "s3") {
      const r = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: `receipts/${safe}` }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return await readFile(path.join(localDir("receipts"), safe));
  } catch { return null; }
}
