import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0d1b30",
        charcoal: "#1a1c20",
        silver: "#9aa1ab",
        fog: "#f5f6f7",
      },
      fontFamily: {
        serif: ["Newsreader", "serif"],
        sans: ["Pretendard", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
