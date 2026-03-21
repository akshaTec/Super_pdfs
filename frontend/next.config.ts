import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    resolveAlias: {
      // pdfjs-dist optionally imports `canvas` for server-side rendering;
      // we use ssr:false so this import never runs in the browser bundle.
      canvas: "./empty-module.js",
    },
  },
};

export default nextConfig;
