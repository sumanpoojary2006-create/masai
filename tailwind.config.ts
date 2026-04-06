import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        mist: "#f5f7fb",
        brand: "#0f766e",
        ember: "#f97316",
        rose: "#dc2626"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(15, 23, 42, 0.08)"
      },
      backgroundImage: {
        haze:
          "radial-gradient(circle at top left, rgba(15,118,110,0.16), transparent 28%), radial-gradient(circle at top right, rgba(249,115,22,0.16), transparent 24%), linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)"
      }
    }
  },
  plugins: []
};

export default config;

