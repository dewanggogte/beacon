import type { NextConfig } from 'next';
import { resolve } from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@screener/shared'],
  outputFileTracingRoot: resolve(import.meta.dirname, '../../'),
  webpack: (config) => {
    // Resolve .js imports to .ts files (for ESM packages using .js extensions)
    config.resolve.extensionAlias = {
      '.js': ['.tsx', '.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
