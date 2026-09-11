import type { MetadataRoute } from "next";

const SITE_URL = "https://core-prime-8zg6gcr9g-scvjcs-8407.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/admin/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
