'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface MarkdownTextProps {
  content?: string;
  text?: string;
  className?: string;
}

// Allow target="_blank" and rel attributes on anchor elements
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), ['target', '_blank'], ['rel', 'noopener noreferrer']],
  },
};

/**
 * Production-grade markdown compiler replacing hand-rolled regex parser.
 * Backed by react-markdown, remark-gfm (tables, checklists, autolinks),
 * and rehype-sanitize to prevent XSS and attribute injection vulnerabilities (ENG-1).
 */
export default function MarkdownText({ content, text, className = '' }: MarkdownTextProps) {
  const rawContent = content ?? text ?? '';
  if (!rawContent) return null;

  return (
    <div className={`space-y-2 text-sm leading-relaxed select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-black text-slate-900 mt-5 mb-2 tracking-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-extrabold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider mt-3.5 mb-1.5">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mt-3 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-slate-700 my-1 leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700">{children}</em>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName && typeof children === 'string' && !children.includes('\n');
            if (isInline) {
              return (
                <code className="bg-indigo-50 text-indigo-700 font-mono text-[11px] px-1.5 py-0.5 rounded border border-indigo-100" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-[11px] text-slate-800" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-slate-50 text-slate-800 p-3.5 rounded-xl border border-slate-200 font-mono text-[11px] overflow-x-auto my-3 shadow-inner">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside ml-2 my-2 text-slate-700 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside ml-2 my-2 text-slate-700 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-slate-700">{children}</li>
          ),
          hr: () => <hr className="border-slate-200 my-4" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="py-2.5 px-3.5 font-bold text-slate-800">{children}</th>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="py-2 px-3.5 text-slate-700 font-medium">{children}</td>
          ),
          a: ({ href, children }) => {
            const safeHref = href && /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(href) ? href : '#';
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium inline-flex items-center gap-0.5"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-300 pl-3 my-2 text-slate-600 italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {rawContent}
      </ReactMarkdown>
    </div>
  );
}
