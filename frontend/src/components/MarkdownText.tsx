
export default function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  
  // Split content by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return (
    <div className="space-y-1.5 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          // Inside a code block
          const lines = part.split('\n');
          const codeLines = lines.slice(1, -1).join('\n');
          return (
            <pre key={index} className="bg-slate-950 text-slate-200 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto my-2.5 shadow-inner">
              <code>{codeLines}</code>
            </pre>
          );
        }
        
        // Split by lines for headers and lists
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-1">
            {lines.map((line, lIdx) => {
              // Heading 3
              if (line.startsWith('### ')) {
                return <h3 key={lIdx} className="text-base font-bold text-slate-100 mt-3 mb-1 tracking-tight">{line.slice(4)}</h3>;
              }
              // Heading 2
              if (line.startsWith('## ')) {
                return <h2 key={lIdx} className="text-lg font-extrabold text-slate-100 mt-4 mb-2 tracking-tight border-b border-slate-800 pb-1">{line.slice(3)}</h2>;
              }
              // Heading 1
              if (line.startsWith('# ')) {
                return <h1 key={lIdx} className="text-xl font-black text-slate-100 mt-5 mb-3 tracking-tight">{line.slice(2)}</h1>;
              }
              
              // Bullet lists
              if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                const content = line.trim().slice(2);
                return (
                  <ul key={lIdx} className="list-disc list-inside ml-2.5 text-slate-300">
                    <li>{parseInlineMarkdown(content)}</li>
                  </ul>
                );
              }

              // Numbered lists
              if (/^\d+\.\s/.test(line.trim())) {
                const match = line.trim().match(/^(\d+\.\s)(.*)/);
                if (match) {
                  return (
                    <ol key={lIdx} className="list-decimal list-inside ml-2.5 text-slate-300">
                      <li>{parseInlineMarkdown(match[2])}</li>
                    </ol>
                  );
                }
              }
              
              // Horizontal rule
              if (line.trim() === '---') {
                return <hr key={lIdx} className="border-slate-800 my-4" />;
              }

              return <p key={lIdx} className="text-slate-300 min-h-[1rem]">{parseInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string) {
  // Simple bold and code format parser
  const boldParts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return boldParts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-emerald-400">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-800">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
