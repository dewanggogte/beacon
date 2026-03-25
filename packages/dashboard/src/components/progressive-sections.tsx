'use client';

import { useState, ReactNode } from 'react';
import { ExpandAllToggle } from './collapsible-section.js';

interface Section {
  title: string;
  preview: string;
  content: ReactNode;
}

interface ProgressiveSectionsProps {
  sections: Section[];
}

export function ProgressiveSections({ sections }: ProgressiveSectionsProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  function handleToggleAll() {
    const next = !allExpanded;
    setAllExpanded(next);
    const newMap: Record<number, boolean> = {};
    sections.forEach((_, i) => {
      newMap[i] = next;
    });
    setOpenMap(newMap);
  }

  function handleSectionToggle(index: number) {
    setOpenMap((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      // Recalculate allExpanded
      const allOpen = sections.every((_, i) => !!next[i]);
      setAllExpanded(allOpen);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider">
          Detail
        </h2>
        <ExpandAllToggle onToggle={handleToggleAll} expanded={allExpanded} />
      </div>
      <div className="space-y-2">
        {sections.map((section, i) => {
          const open = !!openMap[i];
          return (
            <div key={i} className="rounded-lg bg-bg-secondary/50 dark:bg-dark-bg-secondary/50">
              <button
                onClick={() => handleSectionToggle(i)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                type="button"
              >
                <span className="font-medium text-text-primary dark:text-dark-text-primary">
                  {section.title}
                </span>
                <span className="flex items-center gap-2 text-sm text-text-secondary dark:text-dark-text-secondary">
                  {!open && <span>{section.preview}</span>}
                  <span
                    className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                  >
                    ▸
                  </span>
                </span>
              </button>
              {open && (
                <div className="border-t border-border dark:border-dark-border px-4 py-3">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
