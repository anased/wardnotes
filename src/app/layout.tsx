import './globals.css'

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WardNotes - Clinical Learning for Medical Students & Residents',
  description: 'Capture and organize clinical learning points during your rotations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}