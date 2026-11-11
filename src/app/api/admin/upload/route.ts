import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdmin } from "@/lib/session";
import { limited, ipOf } from "@/lib/ratelimit";
import { sniffImage } from "@/lib/uploads";
import { putPublicImage } from "@/lib/storage";

export const dynamic = "force-dynamic";
// Browsers resize/crop before uploading, so files are small (Vercel rejects request bodies over ~4.5 MB).
const MAX = 4 * 1024 * 1024;

/** Admin-only image upload. Returns { url }. Validates by file signature, not the claimed type. */
export async function POST(req: Request) {
  const admin = await getAdmin(); if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await limited(`upload:${admin.id}:${ipOf(req)}`, 60, 600)) return NextResponse.json({ error: "Too many uploads. Wait a few minutes." }, { status: 429 });
  const form = await req.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image is too large (max 4 MB)" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer()); const t = sniffImage(buf);
  if (!t) return NextResponse.json({ error: "Use a JPG, PNG or WEBP image" }, { status: 400 });
  try { return NextResponse.json({ url: await putPublicImage(`${randomBytes(10).toString("hex")}.${t.ext}`, buf, t.mime) }); }
  catch (e) { console.error("upload failed", e); return NextResponse.json({ error: "Storage isn't set up for uploads yet. Add Cloudinary or S3 settings, or paste an image link instead." }, { status: 500 }); }
}
