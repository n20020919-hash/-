/** @type {import('next').NextConfig} */
const nextConfig = {
  // 本番環境向け設定
  images: {
    // 必要に応じて許可するホスト名を追加
    remotePatterns: [],
  },
};

export default nextConfig;
