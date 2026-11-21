import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import Onboarding, { markIntroSeen, shouldShowIntro } from './Onboarding';

describe('Onboarding', () => {
  beforeEach(() => localStorage.clear());

  it('shows once per browser', () => {
    expect(shouldShowIntro()).toBe(true);
    markIntroSeen();
    expect(shouldShowIntro()).toBe(false);
  });

  it('walks three steps and ends by offering today’s case', () => {
    const onFinish = vi.fn();
    render(<Onboarding onFinish={onFinish} />);
    expect(screen.getByRole('dialog', { name: 'Hi, I am Tock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play today’s case' }));
    expect(onFinish).toHaveBeenCalledWith(true);
    expect(shouldShowIntro()).toBe(false);
  });

  it('can be skipped, by button or Escape', () => {
    const onFinish = vi.fn();
    render(<Onboarding onFinish={onFinish} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledWith(false);
  });
});
