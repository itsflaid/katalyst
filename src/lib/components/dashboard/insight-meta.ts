import type { InsightType } from '$lib/analytics';

export interface BellRestock {
  list: { id: string; name: string; stock: number }[];
  habis: number;
  menipis: number;
}

export const INSIGHT_META: Record<InsightType, { title: string; tone: 'warning' | 'positive' }> = {
  high_revenue_low_profit: { title: 'Omzet besar, profit tipis', tone: 'warning' },
  popular_low_margin: { title: 'Laris tapi margin tipis', tone: 'warning' },
  high_margin_low_demand: { title: 'Margin tinggi, peminat sedikit', tone: 'positive' }
};
