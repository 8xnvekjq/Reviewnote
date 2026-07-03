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

  // Replace headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-slate-100 mt-3 mb-1.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-white mt-4 mb-2">$1</h2>');

  // Split by line to render lists correctly
  const lines = html.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    
    // Bullet lists
    const matchBullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (matchBullet) {
      return `<div class="flex items-start space-x-1.5 my-1 text-slate-300"><span class="text-indigo-400 mt-1 flex-none">•</span><span class="flex-1">${matchBullet[1]}</span></div>`;
    }
    
    // Numbered lists
    const matchNumber = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (matchNumber) {
      return `<div class="flex items-start space-x-1.5 my-1 text-slate-300"><span class="text-emerald-400 font-mono text-xs mt-0.5 flex-none">${matchNumber[1]}.</span><span class="flex-1">${matchNumber[2]}</span></div>`;
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
