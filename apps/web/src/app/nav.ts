import { FlaskConical, History, Target, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/** The views of the app. Each has its own URL, so any view can be linked to. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/root-cause', label: 'Root cause', icon: Target },
  { path: '/playground', label: 'Playground', icon: FlaskConical },
  { path: '/legacy', label: 'Previous UI', icon: History },
];
