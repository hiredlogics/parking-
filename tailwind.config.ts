import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "375px",
        "sm-plus": "390px",
        "md-plus": "430px",
      },
      colors: {
        ink: {
          950: "#050509",
          900: "#0a0a12",
          800: "#101019",
          700: "#181824",
          600: "#22222f",
          500: "#33333f",
        },
        accent: {
          pink: "#ff2ea6",
          fuchsia: "#c33bff",
          violet: "#7c3aed",
        },
        brand: {
          pink: "#EC1573",
          pinkDark: "#C21469",
          pinkLight: "#FDE8F1",
          pinkPale: "#FDF3F7",
          navy: "#0F0F1A",
          navyMute: "#1A1A2E",
          text: "#111827",
          mute: "#6B7280",
          border: "#E5E7EB",
          borderSoft: "#F1F1F4",
          canvas: "#F5F5F7",
          yellow: "#FFE01B",
          green: "#00B67A",
          blue: "#1B8FD6",
          blueDark: "#1477B5",
          bluePale: "#E8F5FC",
          helpGreen: "#2EAA5A",
          helpGreenDark: "#248A48",
          helpGreenPale: "#EAF8EF",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-manrope)",
          "Manrope",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-jakarta)",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(60% 60% at 30% 20%, rgba(195,59,255,0.35) 0%, rgba(255,46,166,0.18) 35%, rgba(5,5,9,0) 70%)",
        "brand-gradient":
          "linear-gradient(135deg, #ff2ea6 0%, #c33bff 45%, #7c3aed 100%)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(195, 59, 255, 0.35)",
        card: "0 1px 2px rgba(15,15,26,0.04), 0 4px 12px rgba(15,15,26,0.06)",
        cardHover: "0 2px 4px rgba(15,15,26,0.06), 0 12px 24px rgba(15,15,26,0.08)",
        pop: "0 12px 30px rgba(15,15,26,0.10), 0 4px 8px rgba(15,15,26,0.06)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 6s linear infinite",
        fadeUp: "fadeUp 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
