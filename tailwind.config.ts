import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#111C38",
        slate: "#808A95",
        bullish: "#5B8266",
        canvas: "#F7F8F4",
        ink: "#162033",
        warning: "#B98948",
        danger: "#A94D4D",
      },
      boxShadow: {
        terminal: "0 24px 60px rgba(17, 28, 56, 0.14)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
