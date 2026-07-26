/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 럭키상점 테마 장착 기능: indigo 팔레트를 CSS 커스텀 프로퍼티 기반으로 재정의해서
        // (기본값은 src/index.css의 :root에 정의) 컴포넌트의 기존 bg-indigo-600 등 클래스를
        // 전혀 건드리지 않고도 src/utils/theme.ts의 applyThemeColor() 호출만으로 전체 배색을
        // 즉시 바꿀 수 있게 한다. <alpha-value>는 Tailwind가 opacity 모디파이어(/10 등)에서
        // 자동으로 치환해준다.
        indigo: {
          50: 'rgb(var(--color-indigo-50) / <alpha-value>)',
          100: 'rgb(var(--color-indigo-100) / <alpha-value>)',
          200: 'rgb(var(--color-indigo-200) / <alpha-value>)',
          300: 'rgb(var(--color-indigo-300) / <alpha-value>)',
          400: 'rgb(var(--color-indigo-400) / <alpha-value>)',
          500: 'rgb(var(--color-indigo-500) / <alpha-value>)',
          600: 'rgb(var(--color-indigo-600) / <alpha-value>)',
          700: 'rgb(var(--color-indigo-700) / <alpha-value>)',
          800: 'rgb(var(--color-indigo-800) / <alpha-value>)',
          900: 'rgb(var(--color-indigo-900) / <alpha-value>)',
          950: 'rgb(var(--color-indigo-950) / <alpha-value>)',
        },
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

