/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    "./src/store/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        hubba: {
          ink: "#050505",
          orange: "#ff6400",
          green: "#5ef38c",
        },
      },
      boxShadow: {
        neon: "0 0 20px rgba(94, 243, 140, 0.45)",
      },
    },
  },
  plugins: [],
};
