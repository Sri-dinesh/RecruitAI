/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#F8F6F2",
        foreground: "#111111",
        accent: "#1B2A4A",
        "brand-primary": "#1B2A4A",
        "brand-hover": "#263A66",
        "brand-dark": "#10192E",
        "brand-emerald": "#059669",
        "brand-rose": "#E11D48",
        "brand-amber": "#F59E0B",
        muted: "#6B7280",
        border: "#E5E7EB",
      },
      fontFamily: {
        serif: ["Fraunces_600SemiBold"],
        "serif-bold": ["Fraunces_700Bold"],
        sans: ["DMSans_400Regular"],
        "sans-medium": ["DMSans_500Medium"],
        "sans-bold": ["DMSans_700Bold"],
        "sans-black": ["DMSans_900Black"],
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "6px",
        lg: "6px",
        xl: "6px",
        "2xl": "12px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
