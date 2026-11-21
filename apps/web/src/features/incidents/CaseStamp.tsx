import type { ReviewStatus } from './api';

/** A rubber stamp on a reviewed case. Unreviewed cases have none: they are still open. */
export default function CaseStamp({ status, correctService }: { status: ReviewStatus; correctService: string | null }) {
  if (status === 'unreviewed') return null;
  const text = status === 'confirmed' ? 'Case closed' : `Solved: ${correctService ?? 'another service'}`;
  return (
    <span
      role="note"
      aria-label={status === 'confirmed' ? 'Case closed: you confirmed the best guess' : `Case solved by you: the cause was ${correctService ?? 'another service'}`}
      className="inline-block -rotate-6 rounded-lg border-[3px] border-accent px-3 py-0.5 font-display text-base text-accent motion-safe:animate-[stamp_200ms_ease-out]"
    >
      {text}
    </span>
  );
}
