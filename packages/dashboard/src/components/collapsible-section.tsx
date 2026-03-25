'use client';

import { useState, ReactNode } from 'react';

export function CollapsibleSection({
  title,
  preview,
  children,
  defaultOpen = false,
}: {
  title: string;
  preview: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg bg-bg-secondary/50 dark:bg-dark-bg-secondary/50">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        type="button"
      >
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-2 text-sm text-text-secondary dark:text-dark-text-secondary">
          {!open && <span>{preview}</span>}
          <span className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border dark:border-dark-border px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function ExpandAllToggle({
  onToggle,
  expanded,
}: {
  onToggle: () => void;
  expanded: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      type="button"
      className="text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary transition-colors"
    >
      {expanded ? 'Collapse all' : 'Expand all'}
    </button>
  );
}
