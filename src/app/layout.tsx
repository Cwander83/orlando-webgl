import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orlando in Ink & Light — Interactive 3D Diorama',
  description:
    'An atmospheric WebGL diorama of Lake Eola and Downtown Orlando across four scroll-driven chapters and live Orlando weather.',
  openGraph: {
    title: 'Orlando in Ink & Light',
    description:
      'Interactive 3D WebGL architectural diorama of Lake Eola and Downtown Orlando.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b1437',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/league-spartan-latin-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/open-sans-latin-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-navy-900 text-cream-50 antialiased">
        {children}
      </body>
    </html>
  );
}
