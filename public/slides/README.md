# 🖥️ 더쿠키수학 오답클리닉 - 수업용 개념 슬라이드 폴더

이 폴더(`public/slides/`)는 선생님이 HTML/CSS로 제작하신 **수업 개념 슬라이드 자료**를 보관하는 곳입니다.
이 폴더에 아래의 파일명 형식에 맞추어 단일 HTML 파일을 업로드하시면, 오답노트 상세 페이지에서 해당 단원에 매칭되는 슬라이드가 학생들에게 자동으로 노출됩니다.

## 📁 파일 배치 가이드

1. **저장 위치**:
   - 이 README.md 파일이 위치한 `public/slides/` 폴더 내에 HTML 파일들을 직접 넣어주시면 됩니다.

2. **파일명 규칙**:
   - 오답노트에서 인식하는 단원 이름과 일치하도록 아래 매핑 사전에 약속된 파일명으로 업로드해 주세요:

| 대상 단원 (오답노트 단원명) | 업로드해야 할 파일명 |
| :--- | :--- |
| **함수의 극한** | `slide_functions_limit.html` |
| **우극한, 좌극한** (또는 우극한과 좌극한) | `slide_functions_limit_left_right.html` |
| **함수의 극한에 대한 성질** | `slide_functions_properties.html` |
| **이항분포** | `slide_binomial_distribution.html` |

*※ 매핑 단원 및 파일명 매핑 규칙은 필요 시 `src/components/MistakeDetailModal.tsx` 상단의 `SLIDE_MAP` 객체에서 언제든지 수정 및 확장할 수 있습니다.*

---

## ⚡ HTML 슬라이드 개발 규칙 권장사항
* **Self-contained**: Tailwind CSS, FontAwesome, MathJax 3 등은 CDN 방식으로 연동되어야 파일 이동 시 깨지지 않습니다.
* **16:9 비율**: 슬라이드 해상도는 16:9 규격(`1280px` × `720px`)을 준수해 주십시오. (앱에서 종횡비를 16:9 반응형으로 고정시켜 줍니다).
