import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parking Appeals Group — Challenge Your Parking Charge",
  description:
    "Self-service parking appeal documents in minutes. Expert help available for court claims, CCJs and enforcement action.",
  metadataBase: new URL("http://localhost:3000"),
};

export const viewport = {
  themeColor: "#0F0F1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={`${manrope.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh bg-white font-sans text-brand-text antialiased">
        {children}
      </body>
    </html>
  );
}
