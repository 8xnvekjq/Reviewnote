/// <reference types="vite/client" />

// 빌드 타임에 vite.config.ts의 define 블록에서 자동 주입되는 전역 상수
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
