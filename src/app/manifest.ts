import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CULIVER 스마트팜 현장관리",
    short_name: "CULIVER 현장",
    description: "컬리버 스마트팜 통합 현장관리 시스템",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f5",
    theme_color: "#133128",
    lang: "ko",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
