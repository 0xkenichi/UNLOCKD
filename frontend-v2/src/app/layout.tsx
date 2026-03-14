import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Web3Provider } from "@/components/providers/web3-provider";

export const metadata: Metadata = {
  title: "Vestra Protocol | Premium Vesting-Credit Protocol",
  description: "Advanced credit infrastructure from vested tokens — premium DeFi aesthetics for 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground selection:bg-accent-teal/30">
        <Web3Provider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 lg:ml-64 p-4 lg:p-8">
              <div className="max-w-7xl mx-auto space-y-8">
                {children}
              </div>
            </main>
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}
