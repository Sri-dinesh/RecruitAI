import React from 'react';

export default function MarkdownText({ text }: { text: string }) {
  if (!text) return null;

  const compileMarkdownToHtml = (markdown: string): string => {
    if (!markdown) return '';
    
    // 1. Separate code blocks to avoid compiling markdown inside code
    const codeBlocks: string[] = [];
    let processed = markdown.replace(/```([\s\S]*?)```/g, (match, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      // Escape inside code block
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      codeBlocks.push(`<pre class="bg-slate-50 text-slate-800 p-3.5 rounded-xl border border-slate-200 font-mono text-[11px] overflow-x-auto my-3 shadow-inner"><code>${escapedCode}</code></pre>`);
      return id;
    });

    // Escape HTML in the rest of the text
    processed = processed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Parse Headings
    processed = processed.replace(/^### (.*?)$/gm, '<h3 class="text-xs font-black uppercase text-brand-primary tracking-wider mt-4 mb-2">$1</h3>');
    processed = processed.replace(/^## (.*?)$/gm, '<h2 class="text-sm font-extrabold text-slate-900 mt-5 mb-2.5 pb-1 border-b border-slate-200">$1</h2>');
    processed = processed.replace(/^# (.*?)$/gm, '<h1 class="text-base font-black text-slate-900 mt-6 mb-3">$1</h1>');

    // 3. Parse Horizontal Rules
    processed = processed.replace(/^---$/gm, '<hr class="border-slate-200 my-4" />');

    // 4. Parse Tables
    const lines = processed.split('\n');
    let inTable = false;
    let tableHtml = '';
    const newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<div class="overflow-x-auto my-4 rounded-xl border border-slate-200 bg-white"><table class="w-full text-left border-collapse text-xs">';
          const cols = line.split('|').slice(1, -1).map(c => c.trim());
          tableHtml += '<thead class="bg-white border-b border-slate-200"><tr class="text-slate-500 font-bold">';
          cols.forEach(col => {
            tableHtml += `<th class="py-2.5 px-3.5 font-bold">${col}</th>`;
          });
          tableHtml += '</tr></thead><tbody>';
          
          if (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].includes('-')) {
            i++; // Skip alignment row
          }
        } else {
          const cols = line.split('|').slice(1, -1).map(c => c.trim());
          tableHtml += '<tr class="border-b border-slate-200 hover:bg-white">';
          cols.forEach(col => {
            const cellHtml = compileInline(col);
            tableHtml += `<td class="py-2 px-3.5 text-slate-600 font-medium">${cellHtml}</td>`;
          });
          tableHtml += '</tr>';
        }
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</tbody></table></div>';
          newLines.push(tableHtml);
          tableHtml = '';
        }
        newLines.push(lines[i]);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table></div>';
      newLines.push(tableHtml);
    }
    processed = newLines.join('\n');

    // Inline elements compiler
    function compileInline(text: string): string {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-brand-primary">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-50 text-brand-primary px-1.5 py-0.5 rounded font-mono text-[11px] border border-slate-200">$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-primary hover:underline">$1</a>');
    }

    // 5. Parse Lists
    const finalLines = processed.split('\n');
    let inUl = false;
    let inOl = false;
    const outputLines: string[] = [];

    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (inOl) {
          outputLines.push('</ol>');
          inOl = false;
        }
        if (!inUl) {
          outputLines.push('<ul class="list-disc list-inside ml-4 my-2 text-slate-700 space-y-1">');
          inUl = true;
        }
        const content = trimmed.replace(/^[-*]\s+/, '');
        outputLines.push(`<li>${compileInline(content)}</li>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (inUl) {
          outputLines.push('</ul>');
          inUl = false;
        }
        if (!inOl) {
          outputLines.push('<ol class="list-decimal list-inside ml-4 my-2 text-slate-700 space-y-1">');
          inOl = true;
        }
        const content = trimmed.replace(/^\d+\.\s+/, '');
        outputLines.push(`<li>${compileInline(content)}</li>`);
        continue;
      }

      if (inUl) {
        outputLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        outputLines.push('</ol>');
        inOl = false;
      }

      // Paragraph wrapper
      if (trimmed && !trimmed.startsWith('<h') && !trimmed.startsWith('<div') && !trimmed.startsWith('<table') && !trimmed.startsWith('<tr') && !trimmed.startsWith('<td') && !trimmed.startsWith('<th') && !trimmed.startsWith('<hr') && !trimmed.startsWith('<thead') && !trimmed.startsWith('<tbody') && !trimmed.startsWith('__CODE_BLOCK_')) {
        outputLines.push(`<p class="text-slate-700 my-1">${compileInline(line)}</p>`);
      } else {
        outputLines.push(line);
      }
    }

    if (inUl) outputLines.push('</ul>');
    if (inOl) outputLines.push('</ol>');

    let finalHtml = outputLines.join('\n');

    // Restore separated code blocks
    codeBlocks.forEach((codeBlock, idx) => {
      finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, codeBlock);
    });

    return finalHtml;
  };

  return (
    <div 
      className="space-y-1.5 text-sm leading-relaxed select-text"
      dangerouslySetInnerHTML={{ __html: compileMarkdownToHtml(text) }}
    />
  );
}
