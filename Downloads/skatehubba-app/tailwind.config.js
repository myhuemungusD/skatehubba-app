module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        hubba: {
          black: "#050505",
          orange: "#ff7a00",
          green: "#00ff94"
        }
      }
    }
  },
  plugins: []
};