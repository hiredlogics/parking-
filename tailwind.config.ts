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
        // Legacy tokens kept so internal (dark) pages remain intact.
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
        // Brand tokens for the landing page — sampled from the client's
        // reference screenshot.
        brand: {
          pink: "#EC1573",       // Primary hot-pink CTAs / accents
          pinkDark: "#C21469",   // Hover state
          pinkLight: "#FDE8F1",  // Card / section tint
          pinkPale: "#FDF3F7",   // Full-section wash
          navy: "#0F0F1A",       // Header + bottom CTA
          navyMute: "#1A1A2E",   // Slightly lighter navy
          text: "#111827",       // Primary body text
          mute: "#6B7280",       // Muted secondary text
          border: "#E5E7EB",     // Card borders
          borderSoft: "#F1F1F4", // Very soft dividers
          canvas: "#F5F5F7",     // Light gray section backgrounds
          yellow: "#FFE01B",     // Penalty-charge sticker
          green: "#00B67A",      // Trustpilot green stars
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
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
      },
      animation: {
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
