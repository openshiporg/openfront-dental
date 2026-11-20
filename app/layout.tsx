import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Page titles carry the practice's name ("Book a visit | Bayview Family Dental"). */
export async function generateMetadata(): Promise<Metadata> {
  let name = "Openfront Dental";
  try {
    const { keystoneContext } = await import("@/features/keystone/context");
    const row = await keystoneContext.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } });
    if (row?.displayName) name = row.displayName;
  } catch {}
  return { title: { default: name, template: `%s | ${name}` }, description: `${name}: book a visit online.` };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="/favicon.svg" rel="icon" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
