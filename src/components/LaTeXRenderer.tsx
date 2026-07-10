import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LaTeXRendererProps {
  text: string;
  className?: string;
  isPrintMode?: boolean; // 인쇄 모드 여부
}

/**
 * Clean up LaTeX syntax and format into readable plain text math if KaTeX fails to parse.
 * Prevents any raw control characters or red error blocks from rendering.
 */
const formatMathFallback = (latex: string): string => {
  let s = latex;

  // 1. Replace Greek letters with Unicode equivalents
  const greekLetters: Record<string, string> = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
    '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\iota': 'ι', '\\kappa': 'κ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π',
    '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'φ',
    '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
    '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω'
  };
  Object.entries(greekLetters).forEach(([key, val]) => {
    s = s.replace(new RegExp(key.replace(/\\/g, '\\\\'), 'g'), val);
  });

  // 2. Replace common mathematical symbols
  s = s.replace(/\\le(?!a)/g, '≤').replace(/\\leq/g, '≤')
       .replace(/\\ge(?!a)/g, '≥').replace(/\\geq/g, '≥')
       .replace(/\\ne(?!q)/g, '≠').replace(/\\neq/g, '≠')
       .replace(/\\times/g, '×').replace(/\\div/g, '÷')
       .replace(/\\pm/g, '±').replace(/\\cdot/g, '·')
       .replace(/\\infty/g, '∞').replace(/\\partial/g, '∂')
       .replace(/\\approx/g, '≈').replace(/\\equiv/g, '≡')
       .replace(/\\triangle/g, '△').replace(/\\angle/g, '∠');

  // 3. Simplify commands
  // \frac{a}{b} -> (a)/(b)
  s = s.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)');
  // \sqrt{x} -> √(x)
  s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
  // Subscripts & Superscripts
  s = s.replace(/_\{([^{}]+)\}/g, '_$1');
  s = s.replace(/\^\{([^{}]+)\}/g, '^$1');

  // 4. Strip leftover LaTeX syntax markers
  s = s.replace(/\\/g, '');
  s = s.replace(/\{/g, '(').replace(/\}/g, ')');
  s = s.replace(/\s+/g, ' ').trim();

  return s;
};

/**
 * Pre-processes LaTeX formula string to protect single dollars and double backslashes.
 */
const sanitizeLatex = (raw: string): string => {
  let s = raw;

  // 1. Protect $$...$$ blocks
  const displayBlocks: string[] = [];
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
    displayBlocks.push(inner);
    return `%%DISPLAY_BLOCK_${displayBlocks.length - 1}%%`;
  });

  // 2. Remove empty inline math
  s = s.replace(/\$\s*\$/g, '');

  // 3. Balance unmatched single dollar signs
  const dollarCount = (s.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    s = s.replace(/\$(?=[^$]*$)/, '');
  }

  // 4. Remove bad double backslashes in math
  s = s.replace(/\$([^$]*?)\\\\(\s*)\$/g, (_, inner, ws) => `$${inner.trim()}${ws}$`);

  // 5. Restore display math
  s = s.replace(/%%DISPLAY_BLOCK_(\d+)%%/g, (_, idx) => {
    return `$$${displayBlocks[parseInt(idx)]}$$`;
  });

  return s;
};

/**
 * Pre-compiles Markdown text & LaTeX formulas directly to fully rendered HTML strings.
 * Catches any KaTeX parse errors and replaces them with clean Unicode fallbacks.
 */
const parseMarkdownWithMath = (text: string, isPrintMode = false): string => {
  let s = sanitizeLatex(text);

  // 1. Compile Display Math $$...$$
  const displayBlocks: string[] = [];
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
    const mathText = inner.trim();
    try {
      const html = katex.renderToString(mathText, { displayMode: true, throwOnError: true });
      displayBlocks.push(`<div class="my-3 overflow-x-auto">${html}</div>`);
    } catch (err) {
      console.warn('KaTeX display render error, falling back:', err, mathText);
      const cleanFallback = formatMathFallback(mathText);
      displayBlocks.push(`<div class="my-3 overflow-x-auto text-center py-2.5 px-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-bold text-indigo-300 break-words">${cleanFallback}</div>`);
    }
    return `%%DISPLAY_BLOCK_${displayBlocks.length - 1}%%`;
  });

  // 2. Compile Inline Math $...$
  const inlineBlocks: string[] = [];
  s = s.replace(/\$([^$]*?)\$/g, (_match, inner) => {
    const mathText = inner.trim();
    if (!mathText) return '';
    try {
      const html = katex.renderToString(mathText, { displayMode: false, throwOnError: true });
      inlineBlocks.push(html);
    } catch (err) {
      console.warn('KaTeX inline render error, falling back:', err, mathText);
      const cleanFallback = formatMathFallback(mathText);
      inlineBlocks.push(`<span class="px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] font-bold text-indigo-300 inline-block align-middle">${cleanFallback}</span>`);
    }
    return `%%INLINE_BLOCK_${inlineBlocks.length - 1}%%`;
  });

  // 3. Translate bold formatting (**text**)
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // 4. Translate Markdown lines (lists and headers)
  const lines = s.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    
    // Headings ###
    const matchH3 = trimmed.match(/^###\s+(.*)$/);
    if (matchH3) {
      return `<h3 class="text-sm sm:text-base font-extrabold text-indigo-400 mt-6 mb-3 block border-b border-slate-800/80 pb-1.5">${matchH3[1]}</h3>`;
    }

    // Headings ##
    const matchH2 = trimmed.match(/^##\s+(.*)$/);
    if (matchH2) {
      return `<h2 class="text-base sm:text-lg font-black text-white mt-8 mb-4 block">${matchH2[1]}</h2>`;
    }

    // Bullet lists
    const matchBullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (matchBullet) {
      if (isPrintMode) {
        return `<div class="flex items-start space-x-2 my-1 text-slate-900 font-medium text-[9.5pt]"><span class="text-slate-950 mt-2 flex-none w-1 h-1 rounded-full bg-slate-950"></span><span class="flex-1">${matchBullet[1]}</span></div>`;
      }
      return `<div class="flex items-start space-x-2 my-2.5 text-slate-300 font-medium text-xs sm:text-sm"><span class="text-indigo-400 mt-1.5 flex-none w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span class="flex-1">${matchBullet[1]}</span></div>`;
    }
    
    // Numbered lists
    const matchNumber = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (matchNumber) {
      if (isPrintMode) {
        return `<div class="flex items-start space-x-2 my-1 text-slate-900 font-medium text-[9.5pt]"><span class="text-slate-950 font-bold text-[9.5pt] mt-0.5 flex-none">${matchNumber[1]}.</span><span class="flex-1">${matchNumber[2]}</span></div>`;
      }
      return `<div class="flex items-start space-x-2 my-2.5 text-slate-300 font-medium text-xs sm:text-sm"><span class="text-emerald-400 font-bold text-xs sm:text-sm mt-0.5 flex-none">${matchNumber[1]}.</span><span class="flex-1">${matchNumber[2]}</span></div>`;
    }

    return line;
  });

  // Join lines and clean spacing
  let result = processed.join('\n')
    .replace(/\n/g, '<br/>')
    .replace(/<\/div><br\/>/g, '</div>')
    .replace(/<\/h3><br\/>/g, '</h3>')
    .replace(/<\/h2><br\/>/g, '</h2>');

  // 5. Restore display math
  result = result.replace(/%%DISPLAY_BLOCK_(\d+)%%/g, (_, idx) => {
    return displayBlocks[parseInt(idx)];
  });

  // 6. Restore inline math
  result = result.replace(/%%INLINE_BLOCK_(\d+)%%/g, (_, idx) => {
    return inlineBlocks[parseInt(idx)];
  });

  return result;
};

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({ text, className = '', isPrintMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Render and inject pre-compiled math HTML safely
    containerRef.current.innerHTML = parseMarkdownWithMath(text, isPrintMode);
  }, [text, isPrintMode]);

  return (
    <div 
      ref={containerRef} 
      className={`${className} break-words leading-relaxed text-slate-200 katex-rendered-text`} 
    />
  );
};
