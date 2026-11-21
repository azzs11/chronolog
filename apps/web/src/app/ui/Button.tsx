import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'fun';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary', // the one thing to press on a screen
  secondary: 'btn btn-secondary',
  fun: 'btn btn-fun', // playful actions: break something, inject a test incident
};

/** A sticker button that presses down into its shadow. Defaults to type="button". */
export default function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`${VARIANT[variant]} ${className}`.trim()} {...props} />;
}
