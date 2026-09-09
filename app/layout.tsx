import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en-GB">
      <body className="min-h-dvh bg-white text-brand-text antialiased">
        {children}
      </body>
    </html>
  );
}
