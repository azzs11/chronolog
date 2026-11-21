import type { FaultKind, SimService } from '@chronolog/engine';

/** Where each lesson lives in the real product, so a stage can end with "see it in ChronoLog". */
export type AppPlace = 'town' | 'incidents' | 'report';
export const APP_PLACES: Record<AppPlace, { path: string; label: string }> = {
  town: { path: '/town', label: 'SEE IT IN THE TOWN VIEW' },
  incidents: { path: '/incidents', label: 'SEE IT IN A CASE FILE' },
  report: { path: '/report', label: 'SEE THE REPORT CARD' },
};

export interface Stage {
  id: string;
  title: string;
  service: SimService;
  fault: FaultKind;
  seed: number;
  intro: string;
  lesson: string;
  place: AppPlace;
}

/**
 * Training Town: three short cases that teach how to read ChronoLog, easiest first. Every sentence is
 * true of the simulated incident it is attached to; training.test.ts checks those facts, so a change
 * to the simulator cannot quietly turn a lesson into a lie.
 */
export const STAGES: readonly Stage[] = [
  {
    id: '1-1',
    title: 'The first face',
    service: 'db',
    fault: 'memory',
    seed: 2,
    intro: 'Something is wrong in the shop. Press PLAY TAPE and watch the faces. The first one to turn unwell is a good place to start.',
    lesson:
      'Faces show what each service’s logs look like. Here db turned unwell first and alone, and its new message was a long garbage-collection pause. ChronoLog’s Town view shows the same faces for your real services.',
    place: 'town',
  },
  {
    id: '1-2',
    title: 'Two at once',
    service: 'catalog',
    fault: 'disk',
    seed: 3,
    intro: 'This time two services fall ill at the same moment. A tie! Use a clue to read what each one said.',
    lesson:
      'When faces tie, read the messages. gateway’s new messages were about catalog (“catalog returned…”), while catalog’s was about itself: “no space left on device”. A case file in ChronoLog shows those exact lines, with their log ids.',
    place: 'incidents',
  },
  {
    id: '1-3',
    title: 'The quiet culprit',
    service: 'cart',
    fault: 'delay',
    seed: 7,
    intro: 'gateway is yelling. But is it the cause, or just the loudest? Watch the tape, and check who everyone keeps talking about.',
    lesson:
      'Faces show symptoms. cart looked fine the whole time while gateway, which calls it, got sick; the giveaway was everyone naming cart. I fell for gateway here too, which is why ChronoLog shows its evidence and its report card.',
    place: 'report',
  },
];
