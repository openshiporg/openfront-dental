import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  let name = "Openfront Dental";
  try {
    const { keystoneContext } = await import("@/features/keystone/context");
    const row = await keystoneContext.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true } });
    if (row?.displayName) name = row.displayName;
  } catch {}
  return { title: `${name} staff`, description: `${name} staff dashboard` };
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
