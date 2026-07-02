# 📓 AI 수학 오답노트 PWA (AI Math Mistakes Note)

> 수학 문제 사진을 촬영하면 AI(Gemini)가 오답 원인을 정밀 진단하고 학습 피드백을 제공하며, 데이터를 안전하게 암호화하여 로컬에 영구 저장하는 PWA(Progressive Web App) 서비스입니다.

---

## 🌟 주요 기능 (Key Features)

1. **실시간 카메라 문제 스캔 (`CameraScanner`)**
   - 모바일 브라우저의 미디어 장치를 제어하여 후면 카메라로 문제를 선명하게 촬영합니다.
   - 레이저 빔 애니메이션 및 격자 Reticle 가이드로 네이티브 앱과 같은 사용자 경험을 제공합니다.
   - 데스크톱 및 카메라 미지원 환경을 위한 갤러리 이미지 업로드(Fallback)를 제공합니다.

2. **강력한 클라이언트 암호화 보안 (`Web Crypto API`)**
   - 브라우저 내장 Web Crypto API를 사용하여 **AES-GCM (256-bit)** 방식으로 API Key를 브라우저 내에서 안전하게 암호화하여 저장합니다.
   - 사용자가 임의로 지정한 **보안 PIN 코드(숫자 4~6자리)**와 **PBKDF2 (100,000회 반복)** 기반의 키 유도를 사용하여 기기 복사본 노출 시에도 Plaintext Key가 누출되는 위험을 완벽 차단합니다.
   - 해제된 복호키는 세션 메모리(`sessionStorage`)에 임시 보관하며 브라우저 세션 종료 시 자동으로 다시 잠깁니다.

3. **Gemini 2.5 Flash 기반 4단계 문제 진단**
   - Gemini API의 **JSON Schema Constraint (Structured Output)**를 적용하여 AI가 정해진 구조의 JSON 응답을 신뢰도 100%로 반환합니다.
   - 오답에 대해 다음 4가지 핵심 클리닉 보고서를 도출합니다:
     - **[문제 풀이 과정]** (정석적인 수학 풀이)
     - **[실수한 지점 상세 분석]** (사진 속 풀이 흔적 분석 및 오류 지점 집어내기)
     - **[근본적인 틀린 이유]** (수학적 개념의 누수나 오개념 분석)
     - **[향후 재발 방지 대책]** (유사 실수 방지를 위한 구체적 솔루션)

4. **Progressive Web App (PWA) 지원**
   - 홈 화면에 앱 설치(A2HS)가 가능하도록 `manifest.json` 및 메타 태그가 최적화되어 있습니다.
   - 서비스 워커(`sw.js`) 및 Network-First 캐싱 정책을 활성화하여 네트워크 불안정 또는 오프라인 상태에서도 쉘이 안정적으로 구동됩니다.

5. **LocalStorage 로컬 DB 영구 저장**
   - 커스텀 훅(`useLocalStorage`)을 사용하여 스캔 및 분석된 오답 리스트가 브라우저 재시작 시에도 영구적으로 보존됩니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS v3, Vanilla CSS Animations
- **AI Service**: Gemini 2.5 Flash Multimodal API (Direct HTTP Fetch)
- **Security**: SubtleCrypto (Web Crypto API - AES-GCM, PBKDF2)
- **Database**: LocalStorage & SessionStorage
- **Platform**: Progressive Web App (PWA)

---

## 🚀 로컬 실행 방법 (How to Run)

### 1. 패키지 설치
이 프로젝트는 **Node.js LTS (v24.18.0 이상)**가 설치된 환경에서 구동됩니다.
```bash
npm install
```

### 2. 로컬 개발 서버 실행
```bash
npm run dev
```
기본적으로 `http://localhost:5173`에서 실행됩니다. 모바일 기기 테스트를 원하시면 다음 명령어로 로컬 네트워크에 노출할 수 있습니다:
```bash
npm run dev -- --host
```

### 3. 프로덕션 빌드
```bash
npm run build
```
빌드된 파일은 `dist/` 폴더에 생성되며, 정적 호스팅 서버(Vercel, Netlify, GitHub Pages 등)에 바로 배포 가능합니다.

---

## 🔑 API Key 설정 가이드 (API Key Configuration)

1. 앱 실행 후 하단 네비게이션 바의 **설정(⚙️)** 탭으로 이동합니다.
2. [Google AI Studio](https://aistudio.google.com/)에서 발급받은 **Gemini API Key**를 입력합니다.
3. 복호화에 사용할 **비밀 PIN 번호(숫자 4~6자리)**를 지정합니다.
4. **[보안 저장하기]**를 눌러 암호화 완료합니다.
5. 오답 카드를 누르고 **[AI 분석 시작하기]**를 실행할 때, 설정한 PIN 번호를 입력하면 실시간 진단이 시작됩니다.

*(개발 편의를 위해 로컬 환경에서 `.env` 파일을 생성하고 `VITE_GEMINI_API_KEY=발급받은키`를 기입하면 PIN 입력 과정을 바이패스하여 바로 AI 분석을 테스트해 보실 수 있습니다. 해당 `.env` 파일은 Git 추적에서 제외되도록 설정되어 있어 안심하고 사용하실 수 있습니다.)*
