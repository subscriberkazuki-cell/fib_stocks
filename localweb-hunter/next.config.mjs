/** @type {import('next').NextConfig} */
const nextConfig = {
  // サーバー専用モジュール（node:sqlite・env・プロバイダ実装）は 'server-only' で
  // クライアントからの import を禁止しているため、ここでの追加設定は不要。
  // データソースやAIプロバイダの切り替えはすべて環境変数で行う（src/config/env.ts）。
};

export default nextConfig;
