import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://core-prime-jade.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "CORE PRIME | Prime Office Advisory", template: "%s | CORE PRIME" },
  description: "서울 주요 업무권역의 프라임 오피스를 검색·비교하고 기업 조건에 맞는 이전 후보를 제안받으세요.",
  keywords: ["서울 오피스 임대", "프라임 오피스", "사무실 이전", "강남 오피스", "여의도 오피스", "광화문 오피스"],
  openGraph: { type: "website", locale: "ko_KR", siteName: "CORE PRIME", title: "CORE PRIME | Prime Office Advisory", description: "서울 프라임 오피스를 데이터로 비교하고 기업 조건에 맞는 후보를 제안합니다." },
  twitter: { card: "summary_large_image", title: "CORE PRIME", description: "서울 프라임 오피스 검색·비교·기업 이전 자문" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CORE PRIME",
    url: siteUrl,
    description: "서울 주요 업무권역의 프라임 오피스 검색·비교 및 기업 이전 자문 서비스",
  };
  return (
    <html lang="ko" className={newsreader.variable}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <PublicHeader />
        {children}
        <PublicFooter />
      </body>
    </html>
  );
}
