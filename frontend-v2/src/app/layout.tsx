import type { Metadata } from "next";
import { Inter, Montserrat, JetBrains_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Web3Provider } from "@/components/providers/web3-provider";
import AIBubble from "@/components/common/AIBubble";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Vestra Protocol | Premium Vesting-Credit Protocol",
  description: "Advanced credit infrastructure from vested tokens — premium DeFi aesthetics for 2026.",
  other: {
    "base:app_id": "69c8015f480a9d8cb993adef",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground selection:bg-accent-teal/30">
        <Web3Provider>
          {children}
          <AIBubble />
        </Web3Provider>
      </body>
    </html>
  );
}
