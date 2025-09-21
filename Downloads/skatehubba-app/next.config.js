const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.join(__dirname, "src"),
      zustand: path.join(__dirname, "src/vendor/zustand"),
    };
    return config;
  },
};

module.exports = nextConfig;
