const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'frontend/src/app/page.tsx'),
  path.join(__dirname, 'frontend/src/components/MarkdownText.tsx')
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Background replacements
  content = content.replace(/bg-obsidian-950\/[0-9]+/g, 'bg-white');
  content = content.replace(/bg-obsidian-900\/[0-9]+/g, 'bg-white');
  content = content.replace(/bg-slate-900\/[0-9]+/g, 'bg-white');
  content = content.replace(/bg-obsidian-[0-9]+/g, 'bg-slate-50');
  content = content.replace(/bg-zinc-950\/[0-9]+/g, 'bg-slate-50');
  
  // Hover Background replacements
  content = content.replace(/hover:bg-obsidian-800\/[0-9]+/g, 'hover:bg-slate-50');
  content = content.replace(/hover:bg-obsidian-900\/[0-9]+/g, 'hover:bg-slate-100');
  content = content.replace(/hover:bg-slate-800\/[0-9]+/g, 'hover:bg-slate-100');
  
  // Border replacements
  content = content.replace(/border-obsidian-800\/[0-9]+/g, 'border-slate-200');
  content = content.replace(/border-obsidian-800/g, 'border-slate-200');
  content = content.replace(/border-zinc-800/g, 'border-slate-200');
  content = content.replace(/border-slate-800\/[0-9]+/g, 'border-slate-200');
  content = content.replace(/border-slate-800/g, 'border-slate-200');
  content = content.replace(/border-emerald-[0-9]+\/[0-9]+/g, 'border-emerald-200');
  
  // Text color replacements
  content = content.replace(/text-slate-100/g, 'text-slate-900');
  content = content.replace(/text-slate-200/g, 'text-slate-800');
  content = content.replace(/text-slate-300/g, 'text-slate-700');
  content = content.replace(/text-slate-400/g, 'text-slate-500');
  content = content.replace(/text-emerald-400/g, 'text-emerald-600');
  content = content.replace(/text-emerald-300/g, 'text-emerald-600');
  content = content.replace(/text-emerald-200/g, 'text-emerald-700');
  content = content.replace(/text-brand-accent/g, 'text-brand-primary');
  
  // Remove glass classes and blurs
  content = content.replace(/backdrop-blur-[a-z]+/g, '');
  content = content.replace(/glass-panel/g, 'bg-white border border-slate-200 shadow-sm transition-all duration-200');
  content = content.replace(/glass-card/g, 'bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md');
  content = content.replace(/glass-input/g, 'bg-white border border-slate-300 shadow-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all');
  
  // Remove specific gradients and glows
  content = content.replace(/gradient-text-purple/g, 'text-brand-primary font-bold');
  content = content.replace(/bg-gradient-to-[a-z]+ from-[a-z]+-[a-z]+ to-[a-z]+-[a-z]+/g, 'bg-brand-primary text-white');
  content = content.replace(/shadow-\[.*?\]/g, 'shadow-sm'); // Remove custom neon shadows
  
  // Chat message background specifics
  content = content.replace(/bg-obsidian-950/g, 'bg-white');
  content = content.replace(/bg-brand-primary\/10/g, 'bg-brand-primary text-white');
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Processed', file);
});
