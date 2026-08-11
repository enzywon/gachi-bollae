import type { Metadata } from "next";
import { Geist, Geist_Mono, Gowun_Dodum, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
});

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
});

const gowunDodum = Gowun_Dodum({
  variable: "--font-gowun-dodum",
  weight: "400",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansKr.variable} ${notoSerifKr.variable} ${gowunDodum.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
