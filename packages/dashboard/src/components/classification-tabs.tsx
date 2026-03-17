'use client';

import { useState } from 'react';
import { CompanyTable } from './company-table';

interface TabData {
  label: string;
  count: number;
  color: string;
  data: Array<{
    companyName: string;
    screenerCode: string;
    sector: string | null;
    finalScore: string | null;
    compositeScore: string | null;
    classification: string | null;
    rankOverall: number | null;
    valuationScore: string | null;
    qualityScore: string | null;
    governanceScore: string | null;
    safetyScore: string | null;
    momentumScore: string | null;
    scoreChange: string | null;
    disqualified: boolean | null;
    buffettScore?: string | null;
    grahamScore?: string | null;
    pabraiRiskScore?: string | null;
    lynchCategoryScore?: string | null;
    lynchClassification?: string | null;
    convictionLevel?: string | null;
    classificationSource?: string | null;
    quantClassification?: string | null;
  }>;
}

interface ClassificationTabsProps {
  tabs: TabData[];
}

export function ClassificationTabs({ tabs }: ClassificationTabsProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <div className="flex gap-1 border-b border-border mb-4">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === i
                ? `${tab.color} border-b-2 border-current -mb-px`
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      {tabs[activeTab] && tabs[activeTab].data.length > 0 ? (
        <CompanyTable data={tabs[activeTab].data} compact />
      ) : (
        <div className="bg-bg-card border border-border rounded-lg p-6 text-text-muted text-center">
          No companies in this category
        </div>
      )}
    </div>
  );
}
