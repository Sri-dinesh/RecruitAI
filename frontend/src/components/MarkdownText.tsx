
export default function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  
  // Split content by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return (
    <div className="space-y-1.5 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const lines = part.split('\n');
          const codeLines = lines.slice(1, -1).join('\n');
          return (
            <pre key={index} className="bg-slate-950 text-slate-200 p-3 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto my-2 shadow-inner">
              <code>{codeLines}</code>
            </pre>
          );
        }
        
        // Custom block compiler for headers, lists, and paragraphs
        const lines = part.split('\n');
        const elements: React.ReactNode[] = [];
        
        let currentListType: 'ul' | 'ol' | null = null;
        let currentListItems: React.ReactNode[] = [];
        let listKey = 0;
        
        const flushList = () => {
          if (!currentListType) return;
          const Tag = currentListType;
          const className = currentListType === 'ul' 
            ? 'list-disc list-inside ml-4 my-2 text-slate-300 space-y-1' 
            : 'list-decimal list-inside ml-4 my-2 text-slate-300 space-y-1';
          elements.push(
            <Tag key={`list-${listKey++}`} className={className}>
              {currentListItems}
            </Tag>
          );
          currentListType = null;
          currentListItems = [];
        };
        
        lines.forEach((line, lIdx) => {
          const trimmed = line.trim();
          
          // Bullet lists
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (currentListType !== 'ul') {
              flushList();
              currentListType = 'ul';
            }
            const content = line.replace(/^\s*[-*]\s/, '');
            currentListItems.push(<li key={lIdx}>{parseInlineMarkdown(content)}</li>);
            return;
          }
          
          // Numbered lists
          if (/^\d+\.\s/.test(trimmed)) {
            if (currentListType !== 'ol') {
              flushList();
              currentListType = 'ol';
            }
            const content = line.replace(/^\s*\d+\.\s/, '');
            currentListItems.push(<li key={lIdx}>{parseInlineMarkdown(content)}</li>);
            return;
          }
          
          // If we reach here, it's not a list item. Flush any active list.
          flushList();
          
          // Heading 3
          if (trimmed.startsWith('### ')) {
            elements.push(<h3 key={lIdx} className="text-xs font-extrabold text-slate-100 mt-3 mb-1 tracking-tight">{trimmed.slice(4)}</h3>);
            return;
          }
          // Heading 2
          if (trimmed.startsWith('## ')) {
            elements.push(<h2 key={lIdx} className="text-sm font-black text-slate-100 mt-4 mb-2 tracking-tight border-b border-slate-800/60 pb-0.5">{trimmed.slice(3)}</h2>);
            return;
          }
          // Heading 1
          if (trimmed.startsWith('# ')) {
            elements.push(<h1 key={lIdx} className="text-base font-black text-slate-100 mt-5 mb-2.5 tracking-tight">{trimmed.slice(2)}</h1>);
            return;
          }
          
          // Horizontal rule
          if (trimmed === '---') {
            elements.push(<hr key={lIdx} className="border-slate-800 my-3" />);
            return;
          }
          
          // Normal paragraph
          if (trimmed) {
            elements.push(<p key={lIdx} className="text-slate-300 my-0.5">{parseInlineMarkdown(line)}</p>);
          } else {
            // Spacer for empty lines
            elements.push(<div key={lIdx} className="h-1.5" />);
          }
        });
        
        flushList();
        return <div key={index} className="space-y-0.5">{elements}</div>;
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string) {
  // Simple bold, code, and italic format parser
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-emerald-400">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="bg-slate-950 text-rose-400 px-1 py-0.5 rounded font-mono text-xs border border-slate-800/80">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic text-slate-300">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
