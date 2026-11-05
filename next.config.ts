import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Edumi Study Hall moved from "/" to /study_hall (Nov 2026). Hyphenated spellings land there too.
  async redirects() {
    return [
      { source: "/study-hall", destination: "/study_hall", permanent: true },
      { source: "/zh/study-hall", destination: "/zh/study_hall", permanent: true },
    ];
  },
  turbopack: {
    // Pin the root: there's a stray package-lock.json in the home directory above this repo.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
