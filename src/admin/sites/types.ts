export type MonitoredSite = {
  id: string;
  host: string;
  siteUrl: string;
  siteName: string;
  active: boolean;
  monitorCode: string;
  lastSeenAt: string | null;
  createdAt: string | null;
  sessions7d: number;
  conversions7d: number;
  hasForm: boolean;
  hasButton: boolean;
  embedSnippet: string;
};

export type Totals = {
  sessions: number;
  visitors: number;
  newVisitors: number;
  pageviews: number;
  avgDuration: number;
  bounceRate: number;
  engaged: number;
  intent: number;
  conversions: number;
  conversionRate: number;
  convForm: number;
  convWhatsapp: number;
  convPhone: number;
  formStarted: number;
  whatsappOpened: number;
};

export type InsightSeverity = 'critical' | 'warning' | 'tip' | 'positive';

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action: string;
};

export type ClickKind = 'link' | 'external' | 'button' | 'dead' | 'whatsapp' | 'phone' | 'email';

export type SiteOverview = {
  site: { id: string; host: string; siteUrl: string; siteName: string };
  range: { from: string; to: string; days: number; hourly: boolean };
  totals: Totals;
  previous: Totals;
  quick: {
    online: number;
    periods: { key: string; label: string; sessions: number; conversions: number }[];
  };
  series: { bucket: string; sessions: number; conversions: number }[];
  sources: { source: string; medium: string; sessions: number; conversions: number; avgDuration: number }[];
  campaigns: { source: string; campaign: string; sessions: number; conversions: number }[];
  regions: { country: string; region: string; sessions: number; conversions: number }[];
  cities: { city: string; region: string; country: string; sessions: number; conversions: number }[];
  devices: { device: string; sessions: number; conversions: number; avgDuration: number }[];
  browsers: { browser: string; sessions: number }[];
  weekHour: { dow: number; hour: number; sessions: number; conversions: number }[];
  landingPages: { path: string; sessions: number; bounces: number; conversions: number }[];
  pages: {
    path: string;
    title: string;
    views: number;
    sessions: number;
    avgScroll: number | null;
    avgTime: number | null;
    exits: number;
    conversions: number;
  }[];
  links: { kind: ClickKind; label: string; href: string; clicks: number; sessions: number; path: string }[];
  deadClicks: { path: string; label: string; clicks: number }[];
  rageClicks: { path: string; label: string; clicks: number }[];
  eventTypes: Record<string, { events: number; sessions: number }>;
  journeys: { steps: string[]; sessions: number }[];
  recentConversions: {
    id: string;
    startedAt: string;
    source: string;
    medium: string;
    device: string;
    region: string;
    city: string;
    country: string;
    landingPath: string;
    duration: number;
    pageviews: number;
    channel: 'whatsapp' | 'form' | 'phone';
    steps: string[];
  }[];
  insights: Insight[];
};

export type HeatmapDevice = 'desktop' | 'mobile' | 'tablet';

export type SiteHeatmap = {
  site: { id: string; host: string; siteUrl: string };
  device: HeatmapDevice;
  path: string;
  pages: { path: string; views: number; clicks: number }[];
  pageHeight: number;
  points: { x: number; y: number; rage: boolean }[];
  scrollSessions: number;
  scrollReach: { depth: number; share: number }[];
  elements: { kind: ClickKind; label: string; href: string; clicks: number }[];
};

export type PeriodKey = '1' | '7' | '30' | '90';
