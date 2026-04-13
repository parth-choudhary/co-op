import type { Metadata } from 'next';
import '@/styles/globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Co-Op — Build Companies with AI',
  description: 'A cooperative company-running platform where humans and AI agents work together.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
