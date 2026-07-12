const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'frontend/src/app/page.tsx');

if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');

  // Specific text colors on brand background
  content = content.replace(/text-obsidian-950/g, 'text-white');
  
  // Leftover obsidian borders
  content = content.replace(/border-obsidian-[0-9]+\/[0-9]+/g, 'border-slate-200');
  content = content.replace(/border-obsidian-[0-9]+/g, 'border-slate-200');
  
  // Modal backdrop
  content = content.replace(/bg-obsidian-950\/85/g, 'bg-slate-900/50');
  
  // Invalid slate numbers (like 355, 350, 650)
  content = content.replace(/text-slate-355/g, 'text-slate-400');
  content = content.replace(/text-slate-350/g, 'text-slate-400');
  content = content.replace(/text-slate-650/g, 'text-slate-400');
  content = content.replace(/border-obsidian-750/g, 'border-slate-200');
  content = content.replace(/border-obsidian-805/g, 'border-slate-200');
  content = content.replace(/border-obsidian-900\/60/g, 'border-slate-200');
  
  // Light mode hover text contrast
  content = content.replace(/hover:text-white/g, 'hover:text-brand-primary');
  
  // Some extra cleanup for specific buttons
  content = content.replace(/bg-brand-primary hover:bg-\[#ff8000\]/g, 'bg-brand-primary hover:bg-brand-secondary');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Cleaned up obsidian leftovers');
}
