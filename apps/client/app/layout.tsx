import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@darkflow/ui/tooltip";
import { DeskProviders } from "@/components/providers/DeskProviders";
import "./globals.css";

const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Darkflow",
  description: "Conversational crypto trading console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} dark h-dvh antialiased`}
    >
      <body className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
        <div className="darkflow-ambient flex min-h-0 flex-1 flex-col overflow-hidden">
          <TooltipProvider>
            <DeskProviders>
              <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
            </DeskProviders>
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
