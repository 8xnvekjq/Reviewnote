import React, { useEffect, useRef } from 'react';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';
import 'katex/dist/katex.min.css';

interface LaTeXRendererProps {
  text: string;
  className?: string;
}

const parseMarkdownToHTML = (md: string): string => {
  // Replace bold syntax (**text**)
  let html = md.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Split by line to render lists and headings correctly line-by-line
  const lines = html.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    
    // Headings ### (Sub-headings / Steps)
    // Structured to have proper margins (mt-6 mb-3) and a distinct text color (indigo-400) and bottom border line
    const matchH3 = trimmed.match(/^###\s+(.*)$/);
    if (matchH3) {
      return `<h3 class="text-sm sm:text-base font-extrabold text-indigo-400 mt-6 mb-3 block border-b border-slate-800/80 pb-1.5">${matchH3[1]}</h3>`;
    }

    // Headings ## (Section Headings)
    // Structured to be extra bold, larger (text-base sm:text-lg) and white
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
  return processed.join('\n')
    .replace(/\n/g, '<br/>')
    .replace(/(<\/div>)<br\/>/g, '$1')
    .replace(/(<\/h3>)<br\/>/g, '$1')
    .replace(/(<\/h2>)<br\/>/g, '$1');
};

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({ text, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Parse markdown to HTML first
      containerRef.current.innerHTML = parseMarkdownToHTML(text);

      try {
        // Auto-render KaTeX math elements within the container HTML
        renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (err) {
        console.error('KaTeX auto-render failed:', err);
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
