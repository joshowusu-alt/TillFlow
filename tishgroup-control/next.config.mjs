import path from 'node:path';
import { fileURLToPath } from 'node:url';

const controlRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias['@tillflow/lib'] = path.join(controlRoot, 'lib', 'vendor');
    return config;
  },
};

export default nextConfig;
