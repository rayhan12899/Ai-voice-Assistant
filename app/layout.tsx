import type {Metadata} from 'next';
import { Inter, Hind_Siliguri } from 'next/font/google';
import './globals.css'; // Global styles
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const hindSiliguri = Hind_Siliguri({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['bengali', 'latin'],
  variable: '--font-bangla',
});

export const metadata: Metadata = {
  title: 'Voice Assistant',
  description: 'Complete Bangla and English voice-to-text, translation, and AI prompt web app.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${hindSiliguri.variable} font-sans antialiased bg-gray-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 min-h-screen`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
