export interface PresetFilter {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number | string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  filters: PresetFilter[];
}

export const presets: Preset[] = [
  {
    id: 'value-picks',
    name: 'Value Picks',
    description: 'Low P/E + high ROCE + low debt',
    filters: [
      { metric: 'pe', operator: '<', value: 20 },
      { metric: 'roce', operator: '>', value: 15 },
      { metric: 'de', operator: '<', value: 0.5 },
    ],
  },
  {
    id: 'quality-compounders',
    name: 'Quality Compounders',
    description: 'Consistent ROCE >15% + strong fundamentals',
    filters: [
      { metric: 'roce', operator: '>', value: 15 },
      { metric: 'piotroski', operator: '>=', value: 6 },
    ],
  },
  {
    id: 'low-debt-growth',
    name: 'Low Debt Growth',
    description: 'Low leverage + not disqualified',
    filters: [
      { metric: 'de', operator: '<', value: 0.5 },
      { metric: 'disqualified', operator: '=', value: 'false' },
    ],
  },
  {
    id: 'turnaround',
    name: 'Turnaround Candidates',
    description: 'Lynch turnaround + improving Piotroski',
    filters: [
      { metric: 'lynchClassification', operator: '=', value: 'turnaround' },
      { metric: 'piotroski', operator: '>', value: 4 },
    ],
  },
  {
    id: 'dividend-plays',
    name: 'Dividend Plays',
    description: 'High yield + strong fundamentals',
    filters: [
      { metric: 'dividendYield', operator: '>', value: 2 },
      { metric: 'piotroski', operator: '>=', value: 5 },
      { metric: 'disqualified', operator: '=', value: 'false' },
    ],
  },
  {
    id: 'high-conviction',
    name: 'High Conviction',
    description: 'Multi-framework alignment + LLM validated',
    filters: [
      { metric: 'convictionLevel', operator: '=', value: 'high' },
    ],
  },
];
