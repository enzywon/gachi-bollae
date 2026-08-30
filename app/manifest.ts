import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "같이볼래 — 지금 함께 보기 좋은 콘텐츠",
    short_name: "같이볼래",
    description: "상황과 두 사람의 취향을 맞춰 3분 안에 볼 콘텐츠를 골라주는 추천 서비스",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0b18",
    theme_color: "#0d0b18",
    lang: "ko",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
