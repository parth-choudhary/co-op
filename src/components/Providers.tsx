'use client';
import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import { ToastProvider } from './Toast';
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        {children}
        <ThemeSwitcher />
      </ToastProvider>
    </SessionProvider>
  );
}
