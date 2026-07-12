const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'frontend/src/app/page.tsx');

if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix stacked text colors
  content = content.replace(/text-white text-slate-[0-9]+/g, 'text-white');
  content = content.replace(/text-slate-[0-9]+ text-white/g, 'text-white');
  content = content.replace(/text-slate-[0-9]+ text-brand-primary/g, 'text-brand-primary');
  content = content.replace(/text-brand-primary text-slate-[0-9]+/g, 'text-brand-primary');

  // Standardize Brand variations to brand-primary or native indigo
  content = content.replace(/hover:bg-brand-secondary/g, 'hover:bg-indigo-700');
  content = content.replace(/border-brand-accent\/[0-9]+/g, 'border-brand-primary');
  content = content.replace(/bg-brand-accent/g, 'bg-brand-primary');
  content = content.replace(/text-brand-accent/g, 'text-brand-primary');

  // Standardize soft backgrounds and borders to native slate/indigo
  content = content.replace(/bg-brand-primary\/15/g, 'bg-indigo-50');
  content = content.replace(/bg-brand-primary\/10/g, 'bg-indigo-50');
  content = content.replace(/bg-brand-primary\/20/g, 'bg-indigo-50');
  content = content.replace(/bg-brand-primary\/25/g, 'bg-indigo-50');
  
  content = content.replace(/border-brand-primary\/15/g, 'border-indigo-200');
  content = content.replace(/border-brand-primary\/20/g, 'border-indigo-200');
  content = content.replace(/border-brand-primary\/25/g, 'border-indigo-200');
  content = content.replace(/border-brand-primary\/30/g, 'border-indigo-200');
  content = content.replace(/border-brand-primary\/45/g, 'border-indigo-200');
  content = content.replace(/border-brand-primary\/60/g, 'border-indigo-300');
  
  content = content.replace(/shadow-brand-primary\/5/g, 'shadow-sm');
  
  // Standardize the primary buttons' hover effects to translate-y
  content = content.replace(/hover:scale-\[1.02\] active:scale-\[0.98\]/g, 'hover:-translate-y-[1px] active:translate-y-0');
  content = content.replace(/hover:scale-\[1.03\] active:scale-\[0.97\]/g, 'hover:-translate-y-[1px] active:translate-y-0');

  // Fix that lingering #ff8000
  content = content.replace(/hover:bg-\[#ff8000\]/g, 'hover:bg-indigo-700');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Polished page.tsx for single brand color consistency');
}
