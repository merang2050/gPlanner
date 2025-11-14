/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow opening the dev app from another origin (your LAN IP)
  allowedDevOrigins: ['http://10.1.100.63:3000'],
};

export default nextConfig;

