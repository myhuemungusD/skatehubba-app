import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  images: {
    domains: ['firebasestorage.googleapis.com']
  },
  typescript: {
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: false
  }
};

export default withPWA({
  dest: 'public',
  disable: !isProd,
  runtimeCaching: []
})(nextConfig);
