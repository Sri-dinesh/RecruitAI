'use client';

import Image from 'next/image';
import Link from 'next/link';

export interface LogoProps {
  variant?: 'mark' | 'full';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'light' | 'dark';
  href?: string;
  className?: string;
  textClassName?: string;
  priority?: boolean;
}

const sizeMap = {
  xs: { img: 18, text: 'text-sm', gap: 'gap-1.5' },
  sm: { img: 22, text: 'text-base', gap: 'gap-2' },
  md: { img: 28, text: 'text-xl', gap: 'gap-2.5' },
  lg: { img: 36, text: 'text-2xl', gap: 'gap-3' },
  xl: { img: 48, text: 'text-3xl', gap: 'gap-3.5' },
};

export default function Logo({
  variant = 'full',
  size = 'md',
  theme = 'light',
  href,
  className = '',
  textClassName = '',
  priority = false,
}: LogoProps) {
  const { img: imgSize, text: textSize, gap } = sizeMap[size];
  const imgSrc = theme === 'dark' ? '/logo-mark-white.png' : '/logo-mark.png';

  const content = (
    <div className={`inline-flex items-center ${gap} ${className}`}>
      <Image
        src={imgSrc}
        alt="RecruitAI Logo"
        width={imgSize}
        height={imgSize}
        className="object-contain shrink-0 transition-transform duration-200 group-hover:scale-105"
        priority={priority}
      />
      {variant === 'full' && (
        <span
          className={`font-serif font-semibold tracking-tight transition-colors ${textSize} ${
            theme === 'dark' ? 'text-white' : 'text-foreground'
          } ${textClassName}`}
        >
          RecruitAI<span className="text-accent">.</span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group inline-flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}
