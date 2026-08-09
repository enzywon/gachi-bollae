import type { NextConfig } from "next";

/**
 * 폰 같은 다른 기기에서 개발 서버를 열려면 그 호스트를 허용해야 한다.
 * Next.js 16은 허용하지 않은 오리진의 `/_next` 요청을 403으로 막는데,
 * 이 경우 HTML만 렌더링되고 스크립트가 전부 차단되어 화면이 멀쩡해 보이는 채로
 * 아무 버튼도 동작하지 않는다.
 *
 * 개인 네트워크 주소는 저장소에 두지 않고 `.env.local`에서 받는다.
 * 예: ALLOWED_DEV_ORIGINS=192.168.0.42
 */
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
};

export default nextConfig;
