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
  title: "Darkflow — Infrastructure-powered trading edge",
  description:
    "Waitlist for Darkflow's infrastructure-powered trading console: real-time context, reliable stream delivery, and one decisive workspace for active traders.",
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
        <div className="homebase-ambient flex min-h-dvh flex-col">
          <div className="hb-scanlines" aria-hidden="true" />
          {children}
        </div>
      </body>
    </html>
  );
};

export default RootLayout;
