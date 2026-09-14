import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://core-prime-jade.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CORE PRIME | Prime Office Advisory",
    template: "%s | CORE PRIME",
  },
  description: "서울 주요 업무권역의 프라임 오피스를 검색·비교하고 기업 조건에 맞는 이전 후보를 제안받으세요.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "CORE PRIME",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={newsreader.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>
        <PublicHeader />
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
