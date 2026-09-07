/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite / robots・HTMLパースはすべてサーバー側でのみ動く。
  // APIキーを含むモジュールがクライアントバンドルに混ざらないよう、
  // 外部依存を持つサーバー専用パッケージはここで明示する。
  serverExternalPackages: [],
  experimental: {
    // Server Actions は使わず API Routes に寄せている（§4-1）。
  },
};

export default nextConfig;
