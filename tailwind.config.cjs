/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#137fec",
        "background-light": "#f6f7f8",
        "background-dark": "#101922",
        "surface-dark": "#182430",
        "surface-darker": "#111a22",
        "border-dark": "#233648",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        panel: "0 12px 36px rgba(8, 18, 30, 0.35)",
      },
    },
  },
  plugins: [],
};
