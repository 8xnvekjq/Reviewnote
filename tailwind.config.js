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
        // 오답 문제 카드 겉/속 및 모든 패널 배경/테두리를 테마 변동 변수에 100% 연동.
        // slate-750/850은 Tailwind 기본 팔레트에 없는 프로젝트 커스텀 shade인데, 지금까지
        // tailwind.config.js 어디에도 정의된 적이 없어서 bg-slate-850/border-slate-750 클래스가
        // 실제로는 색이 전혀 적용되지 않고 있었다 (문제카드/패널 내부 박스가 테마에 반응 안 하던 원인).
        // 이번에 처음으로 실제 값을 채워 넣으면서 동시에 테마 변수에 연결한다.
        slate: {
          750: 'rgb(var(--theme-border) / <alpha-value>)',
          800: 'rgb(var(--theme-border) / <alpha-value>)',
          850: 'rgb(var(--theme-bg-elevated) / <alpha-value>)',
          900: 'rgb(var(--theme-bg-surface) / <alpha-value>)',
          950: 'rgb(var(--theme-bg-main) / <alpha-value>)',
          955: 'rgb(var(--theme-bg-main) / <alpha-value>)',
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

