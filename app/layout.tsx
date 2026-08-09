import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "같이볼래 — 지금 함께 보기 좋은 콘텐츠",
  description: "상황과 두 사람의 취향을 맞춰 3분 안에 볼 콘텐츠를 골라주는 추천 서비스",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

/**
 * `viewportFit: "cover"`가 있어야 env(safe-area-inset-*)이 0이 아닌 값을 갖는다.
 * 시트 하단 버튼이 홈 인디케이터에 가리지 않도록 하는 전제 조건이다.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0d0b18",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
