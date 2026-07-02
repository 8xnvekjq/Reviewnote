/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f3ff',
          100: '#e1e7ff',
          200: '#c8d4ff',
          300: '#a3b7ff',
          400: '#7991ff',
          500: '#4f62ff',
          600: '#383eff',
          700: '#2b2bd6',
          800: '#2425ae',
          900: '#22258a',
          950: '#151551',
        },
        accent: {
          50: '#eefffa',
          100: '#c2ffe8',
          200: '#8affd5',
          300: '#47ffbd',
          400: '#0fff9e',
          500: '#00e689',
          600: '#00b86a',
          700: '#008f55',
          800: '#047045',
          900: '#055c3c',
          950: '#013422',
        }
      }
    },
  },
  plugins: [],
}

