import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
// Public product images only (receipts live elsewhere and are admin-gated).
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const [dir, file] = (await params).path;
  if ((dir !== "products") || !file || !/^[a-f0-9]{20}\.(jpg|png|webp)$/.test(file)) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(process.cwd(), "uploads", "products", file));
    return new NextResponse(buf, { headers: { "content-type": TYPES[file.split(".")[1]], "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
