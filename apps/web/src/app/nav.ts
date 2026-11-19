import { FlaskConical, History, Inbox, Radio, Target, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Left out of the phone tab bar, which only has room for four. */
  hideOnPhone?: boolean;
}

/** The views of the app. Each has its own URL, so any view can be linked to. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/incidents', label: 'Incidents', icon: Inbox },
  { path: '/live', label: 'Live', icon: Radio },
  { path: '/root-cause', label: 'Root cause', icon: Target },
  { path: '/playground', label: 'Playground', icon: FlaskConical },
  { path: '/legacy', label: 'Previous UI', icon: History, hideOnPhone: true },
];
