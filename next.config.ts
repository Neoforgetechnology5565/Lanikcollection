import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pg"],
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
};
export default config;
