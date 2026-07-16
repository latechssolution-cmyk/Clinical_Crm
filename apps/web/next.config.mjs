/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@clinical-crm/core'],
  webpack: (config) => {
    // @clinical-crm/core ships raw TS with ESM-style ".js" import specifiers
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
