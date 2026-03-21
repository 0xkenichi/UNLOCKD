"use client";

import { PortfolioView } from "@/components/portfolio/PortfolioView";

/**
 * Portfolio Page
 * Entry point for the Sovereign Asset Control dashboard.
 * Refactored to use the centralized PortfolioView for cleaner multi-chain discovery.
 */
export default function PortfolioPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PortfolioView />
    </div>
  );
}
