import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        spotik: {
          black: "#000000",
          orange: "#FF4D00",
          "orange-dim": "#CC3E00",
          border: "#2a2a2a",
          muted: "#8a8a8a",
        },
      },
      fontFamily: {
        spotik: ["var(--font-spotik-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-spotik-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
