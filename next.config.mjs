/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // pdfkit reads its .afm font metrics from disk relative to its own package folder at
  // runtime — webpack bundling the route rewrites that path and breaks it. Keeping it
  // external means Next calls the real installed package via node_modules instead.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
