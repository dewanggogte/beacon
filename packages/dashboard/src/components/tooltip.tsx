'use client';

import { type ReactNode, useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, above: true });
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const above = rect.top > 140;
      setCoords({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(140, Math.min(rect.left + rect.width / 2, window.innerWidth - 140)),
        above,
      });
    }
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      {children}
      {show && (
        <span
          className="fixed z-[100] w-64 p-3 text-xs leading-relaxed rounded-lg shadow-lg border bg-bg-card dark:bg-dark-bg-card text-text-primary dark:text-dark-text-primary border-border dark:border-dark-border"
          style={{
            top: coords.above ? undefined : coords.top,
            bottom: coords.above ? `calc(100vh - ${coords.top}px)` : undefined,
            left: coords.left,
            transform: 'translateX(-50%)',
          }}
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
