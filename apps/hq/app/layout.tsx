import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Darkflow Labs HQ // Protocol Research",
  description:
    "Darkflow Labs HQ is an evidence-first research institution focused on Solana mempool dynamics, autonomous reconnaissance systems, and intent-driven latency experiments.",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} dark antialiased`}
    >
      <body className="min-h-dvh bg-background text-foreground">
        <div className="hq-ambient flex min-h-dvh flex-col">
          <div className="hq-scanlines" aria-hidden="true" />
          {children}
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
