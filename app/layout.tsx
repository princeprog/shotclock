import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProviders } from "@/components/app-providers";

const fontSans = Inter({subsets:['latin'],variable:'--font-sans'});


export const metadata: Metadata = {
  title: "Shotclock",
  description: "Keep your game moving.",
  referrer: "no-referrer",
  icons: {
    icon: [
      { url: "/shotclock-mark.svg", type: "image/svg+xml" },
      { url: "/shotclock-icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/shotclock-apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={fontSans.variable}>
      <body
        className="antialiased"
      >
        <AppProviders><ThemeProvider>{children}</ThemeProvider></AppProviders>
      </body>
    </html>
  );
}
