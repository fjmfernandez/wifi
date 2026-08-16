import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next traces the files the standalone bundle needs starting from this root. Left to its
// default it starts at the app directory and, with pnpm's isolated node_modules layout,
// drops the symlinks that live inside .pnpm (for example next's own @swc/helpers), so the
// container starts and immediately dies with MODULE_NOT_FOUND. `next build` always runs
// with the app directory as its working directory, so the workspace root is two levels up.
const workspaceRoot = resolve(process.cwd(), "..", "..");

const apiOrigin = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const upgradeInsecure = process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  // next/dist/server/require-hook.js pulls @swc/helpers in at runtime, so the static tracer
  // never sees it and copies only its package.json. The server then dies with MODULE_NOT_FOUND
  // on the first request path. Force the whole package in; the glob covers both the flat and
  // the .pnpm-nested layouts so it survives a change of node-linker.
  outputFileTracingIncludes: {
    "/**/*": ["../../node_modules/**/@swc/helpers/**"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https:${upgradeInsecure}`,
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Cache-Control", value: "no-store, max-age=0" },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
