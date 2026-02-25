/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#137fec",
        "background-light": "#f6f7f8",
        "background-dark": "#121212",
        "surface-dark": "#2d2d2d",
        "surface-darker": "#1a1a1a",
        "border-dark": "#3c3c3c",
        "icon-inactive": "#b1b1b1",
        "icon-active": "#ffffff",
        "toggle-bg": "#0f0f0f",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        panel: "0 12px 30px rgba(0, 0, 0, 0.7)",
      },
    },
  },
  plugins: [],
};
