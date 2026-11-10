import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";

const objects = new Map<string, { body: Buffer; type: string }>();
let cloud: { fields: Record<string, string>; size: number } | null = null;
let srv: http.Server; let port: number;

before(async () => {
  srv = http.createServer((req, res) => {
    const chunks: Buffer[] = []; req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (req.url!.startsWith("/s3/")) { // path-style S3: /s3/<bucket>/<key>
        const key = decodeURIComponent(req.url!.slice(4).split("?")[0]);
        if (req.method === "PUT") { objects.set(key, { body, type: String(req.headers["content-type"]) }); res.writeHead(200, { ETag: '"x"' }); return res.end(); }
        if (req.method === "GET") { const o = objects.get(key); if (!o) { res.writeHead(404); return res.end("<Error><Code>NoSuchKey</Code></Error>"); } res.writeHead(200, { "content-type": o.type }); return res.end(o.body); }
      }
      if (req.url!.startsWith("/cld/demo/image/upload")) { // Cloudinary: multipart form; pull simple text fields out
        const text = body.toString("latin1"); const fields: Record<string, string> = {};
        for (const m of text.matchAll(/name="([a-z_]+)"\r\n\r\n([^\r]*)\r\n/g)) fields[m[1]] = m[2];
        cloud = { fields, size: body.length };
        res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ secure_url: "https://res.cloudinary.test/demo/image/upload/lanik/products/abc.jpg" }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise<void>((r) => srv.listen(0, r)); port = (srv.address() as { port: number }).port;
});
after(() => srv.close());

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

test("S3 driver: public image goes to products/ and returns the CDN URL", async () => {
  Object.assign(process.env, { STORAGE_DRIVER: "s3", S3_BUCKET: "bkt", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "AK", S3_SECRET_ACCESS_KEY: "SK", S3_ENDPOINT: `http://localhost:${port}/s3`, S3_FORCE_PATH_STYLE: "1", S3_PUBLIC_BASE_URL: "https://cdn.example.com/" });
  delete process.env.CLOUDINARY_URL;
  const { putPublicImage } = await import("@/lib/storage");
  const url = await putPublicImage("a1.jpg", JPEG, "image/jpeg");
  assert.equal(url, "https://cdn.example.com/products/a1.jpg");
  const o = objects.get("bkt/products/a1.jpg"); assert.ok(o); assert.equal(o!.type, "image/jpeg"); assert.ok(o!.body.equals(JPEG));
});

test("S3 driver: receipts are stored privately and read back (no public URL)", async () => {
  const { putPrivate, getPrivate } = await import("@/lib/storage");
  await putPrivate("LNK-1-aa.jpg", JPEG, "image/jpeg");
  assert.ok(objects.has("bkt/receipts/LNK-1-aa.jpg"));
  assert.ok((await getPrivate("LNK-1-aa.jpg"))!.equals(JPEG));
  assert.equal(await getPrivate("missing.jpg"), null);
  assert.ok((await getPrivate("../../etc/passwd")) === null); // path is reduced to its basename
});

test("Cloudinary: request is signed with sha1(sorted params + secret)", async () => {
  Object.assign(process.env, { CLOUDINARY_URL: "cloudinary://KEY123:SECRET456@demo", CLOUDINARY_API_BASE: `http://localhost:${port}/cld` });
  const { putPublicImage, cloudinarySignature } = await import("@/lib/storage");
  const url = await putPublicImage("x.jpg", JPEG, "image/jpeg");
  assert.equal(url, "https://res.cloudinary.test/demo/image/upload/lanik/products/abc.jpg");
  const f = cloud!.fields; assert.equal(f.api_key, "KEY123"); assert.equal(f.folder, "lanik/products");
  assert.equal(f.signature, createHash("sha1").update(`folder=lanik/products&timestamp=${f.timestamp}SECRET456`).digest("hex"));
  assert.equal(cloudinarySignature({ timestamp: 1, folder: "f" }, "s"), createHash("sha1").update("folder=f&timestamp=1s").digest("hex"));
  assert.ok(!JSON.stringify(f).includes("SECRET456")); // the secret itself is never sent
});

test("local driver writes to disk and returns an app URL", async () => {
  delete process.env.CLOUDINARY_URL; process.env.STORAGE_DRIVER = "local";
  const { putPublicImage, putPrivate, getPrivate } = await import("@/lib/storage");
  const name = `t${Date.now()}.jpg`;
  assert.equal(await putPublicImage(name, JPEG, "image/jpeg"), `/api/uploads/products/${name}`);
  await putPrivate(`r${name}`, JPEG, "image/jpeg"); assert.ok((await getPrivate(`r${name}`))!.equals(JPEG));
  const f = path.join(process.cwd(), "uploads", "products", name); assert.ok((await readFile(f)).equals(JPEG));
  await rm(f); await rm(path.join(process.cwd(), "uploads", "receipts", `r${name}`));
});

test("image sniffing trusts bytes, not the claimed type", async () => {
  const { sniffImage } = await import("@/lib/uploads");
  assert.equal(sniffImage(JPEG)?.ext, "jpg");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(Buffer.from("GIF89a")), null);
});
