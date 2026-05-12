import type { Metadata } from "next";
import { Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spotikDisplay = Bebas_Neue({
  weight: "400",
  variable: "--font-spotik-display",
  subsets: ["latin"],
});

const spotikMono = JetBrains_Mono({
  variable: "--font-spotik-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SPOTIK — street workout",
  description:
    "Carte et liste des spots street workout. Spotik — France, Mongo, Mapbox.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${spotikDisplay.variable} ${spotikMono.variable} min-h-dvh bg-spotik-black antialiased text-white`}
      >
        {children}
      </body>
    </html>
  );
}
