import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인 사용자별 데이터이므로 요청 시점 렌더링만 사용한다.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
