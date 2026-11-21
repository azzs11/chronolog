import { FlaskConical, GraduationCap, History, House, Inbox, Radio, Target, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** A shorter name for the phone tab bar, where long labels wrap. */
  shortLabel?: string;
  /** Left out of the phone tab bar, which only has room for five. */
  hideOnPhone?: boolean;
}

/** The views of the app. Each has its own URL, so any view can be linked to. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/incidents', label: 'Incidents', icon: Inbox },
  { path: '/town', label: 'Town', icon: House },
  { path: '/live', label: 'Live', icon: Radio },
  { path: '/root-cause', label: 'Root cause', icon: Target, hideOnPhone: true },
  { path: '/playground', label: 'Playground', icon: FlaskConical },
  { path: '/report', label: 'Report card', shortLabel: 'Report', icon: GraduationCap },
  { path: '/legacy', label: 'Previous UI', icon: History, hideOnPhone: true },
];
