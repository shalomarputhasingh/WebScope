/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit loads its font files from disk, so it must not be bundled.
  serverExternalPackages: ["pdfkit"],
};
export default nextConfig;
