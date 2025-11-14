import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Motion Signal Sprint',
  description: 'Sprint timing with motion detection',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
