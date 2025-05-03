import './globals.css'
import { Inter } from 'next/font/google'
import { Metadata } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google'
import { WebVitals } from '@/components/WebVitals'

// Initialize the Inter font
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    template: '%s | WardNotes',
    default: 'WardNotes - Clinical Learning for Medical Students & Residents',
  },
  description: 'Capture and organize clinical learning points during your medical rotations',
  keywords: ['medical notes', 'clinical learning', 'medical education', 'ward rounds', 'medical students', 'residents'],
  authors: [{ name: 'WardNotes Team' }],
  creator: 'WardNotes',
  publisher: 'WardNotes',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
    other: [
      {
        rel: 'mask-icon',
        url: '/icons/safari-pinned-tab.svg',
        color: '#0ea5e9',
      },
    ],
  },
  manifest: '/manifest.json',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  appleWebApp: {
    title: 'WardNotes',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  applicationName: 'WardNotes',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://wardnotes.app',
    title: 'WardNotes - Clinical Learning for Medical Students & Residents',
    description: 'Capture and organize clinical learning points during your medical rotations',
    siteName: 'WardNotes',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'WardNotes - Clinical Learning Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WardNotes - Clinical Learning for Medical Students & Residents',
    description: 'Capture and organize clinical learning points during your medical rotations',
    images: ['/og-image.jpg'],
    creator: '@wardnotes',
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <WebVitals />
        {children}
      </body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}