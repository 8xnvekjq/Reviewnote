import React, { useEffect, useRef } from 'react';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';
import 'katex/dist/katex.min.css';

interface LaTeXRendererProps {
  text: string;
  className?: string;
}

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({ text, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Safely insert plain text first to reset previous renders
      containerRef.current.innerText = text;

      try {
        // Auto-render KaTeX math elements within the container
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
      className={`${className} whitespace-pre-line leading-relaxed text-slate-200`} 
    />
  );
};
