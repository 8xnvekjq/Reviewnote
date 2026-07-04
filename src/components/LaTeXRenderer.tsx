import React, { useEffect, useRef } from 'react';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';
import 'katex/dist/katex.min.css';

interface LaTeXRendererProps {
  text: string;
  className?: string;
}

/**
 * LaTeX 수식 문자열을 안전하게 전처리합니다.
 * Gemini가 불완전하거나 잘못된 수식을 반환하는 경우를 방어합니다.
 */
const sanitizeLatex = (raw: string): string => {
  let s = raw;

  // 1. $$...$$ 블록을 임시 플레이스홀더로 보호 (줄바꿈에 쪼개지지 않도록)
  const displayBlocks: string[] = [];
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
    displayBlocks.push(inner);
    return `%%DISPLAY_BLOCK_${displayBlocks.length - 1}%%`;
  });

  // 2. 인라인 $...$에서 내용이 비어있거나 공백만 있는 경우 제거
  s = s.replace(/\$\s*\$/g, '');

  // 3. 짝이 안 맞는 단독 $ 기호 — 수식이 아닌 단순 달러 기호로 escape
  //    아이디어: $ 개수가 홀수면 마지막 $를 제거
  const dollarCount = (s.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    // 마지막 단독 $를 빈 문자로 제거
    s = s.replace(/\$(?=[^$]*$)/, '');
  }

  // 4. \\ 로 끝나는 수식 내 잘못된 줄바꿈 제거 (KaTeX가 싫어함)
  s = s.replace(/\$([^$]*?)\\\\(\s*)\$/g, (_, inner, ws) => `$${inner.trim()}${ws}$`);

  // 5. %%DISPLAY_BLOCK_%% 플레이스홀더를 복원
  s = s.replace(/%%DISPLAY_BLOCK_(\d+)%%/g, (_, idx) => {
    return `$$${displayBlocks[parseInt(idx)]}$$`;
  });

  return s;
};

const parseMarkdownToHTML = (md: string): string => {
  // 먼저 $$...$$ 블록을 보호 (br 삽입 방지)
  const displayBlocks: string[] = [];
  let html = md.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
    displayBlocks.push(`$$${inner}$$`);
    return `%%DISP_${displayBlocks.length - 1}%%`;
  });

  // Replace bold syntax (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Split by line to render lists and headings correctly line-by-line
  const lines = html.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    
    // Headings ### (Sub-headings / Steps)
    const matchH3 = trimmed.match(/^###\s+(.*)$/);
    if (matchH3) {
      return `<h3 class="text-sm sm:text-base font-extrabold text-indigo-400 mt-6 mb-3 block border-b border-slate-800/80 pb-1.5">${matchH3[1]}</h3>`;
    }

    // Headings ## (Section Headings)
    const matchH2 = trimmed.match(/^##\s+(.*)$/);
    if (matchH2) {
      return `<h2 class="text-base sm:text-lg font-black text-white mt-8 mb-4 block">${matchH2[1]}</h2>`;
    }

    // Bullet lists (- or *)
    const matchBullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (matchBullet) {
      return `<div class="flex items-start space-x-2 my-2.5 text-slate-300 font-medium text-xs sm:text-sm"><span class="text-indigo-400 mt-1.5 flex-none w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span class="flex-1">${matchBullet[1]}</span></div>`;
    }
    
    // Numbered lists (1. or 2.)
    const matchNumber = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (matchNumber) {
      return `<div class="flex items-start space-x-2 my-2.5 text-slate-300 font-medium text-xs sm:text-sm"><span class="text-emerald-400 font-bold text-xs sm:text-sm mt-0.5 flex-none">${matchNumber[1]}.</span><span class="flex-1">${matchNumber[2]}</span></div>`;
    }

    return line;
  });

  // Join lines with line break, and clean up unnecessary double breaks
  let result = processed.join('\n')
    .replace(/\n/g, '<br/>')
    .replace(/<\/div><br\/>/g, '</div>')
    .replace(/<\/h3><br\/>/g, '</h3>')
    .replace(/<\/h2><br\/>/g, '</h2>');

  // %%DISP_%% 플레이스홀더 복원 (br로 쪼개진 것도 복원)
  result = result.replace(/%%DISP_(\d+)%%/g, (_, idx) => {
    return `<div class="my-3 overflow-x-auto">${displayBlocks[parseInt(idx)]}</div>`;
  });

  return result;
};

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({ text, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. LaTeX 전처리 (불완전한 수식 방어)
    const sanitized = sanitizeLatex(text);

    // 2. 마크다운 → HTML 변환
    containerRef.current.innerHTML = parseMarkdownToHTML(sanitized);

    // 3. KaTeX 렌더링
    try {
      renderMathInElement(containerRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        // 수식 파싱 오류 시 원문 텍스트로 fallback
        errorCallback: (msg: string, err: unknown) => {
          console.warn('[KaTeX] render warning:', msg, err);
        }
      });
    } catch (err) {
      console.error('KaTeX auto-render failed:', err);
      // 치명적 오류 시 수식 구분자를 제거하고 평문 텍스트로 fallback
      if (containerRef.current) {
        containerRef.current.innerHTML = parseMarkdownToHTML(
          text.replace(/\$\$[\s\S]*?\$\$/g, '[수식]').replace(/\$[^$]*?\$/g, '[수식]')
        );
      }
    }
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className={`${className} break-words leading-relaxed text-slate-200`} 
    />
  );
};
