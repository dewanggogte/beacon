'use client';

import { type ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition(rect.top < 120 ? 'bottom' : 'top');
    }
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      {children}
      {show && (
        <span
          className={`absolute z-50 w-64 p-3 text-xs leading-relaxed rounded-lg shadow-lg border
            bg-bg-card dark:bg-dark-bg-card text-text-primary dark:text-dark-text-primary
            border-border dark:border-dark-border
            ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
            left-1/2 -translate-x-1/2`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

// Small info icon to trigger tooltips
export function InfoIcon() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full border border-text-muted dark:border-dark-text-muted text-text-muted dark:text-dark-text-muted cursor-help ml-1">
      i
    </span>
  );
}
