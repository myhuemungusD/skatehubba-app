import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        hubba: {
          black: '#050505',
          orange: '#FF6B1A',
          green: '#3FFF92'
        }
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
} satisfies Config;
