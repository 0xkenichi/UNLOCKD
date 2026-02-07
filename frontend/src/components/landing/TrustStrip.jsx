export default function TrustStrip() {
  return (
    <div className="trust-strip" role="complementary" aria-label="Trust indicators">
      <div className="trust-strip-content">
        <span className="trust-strip-label">SECURED BY</span>
        <div className="trust-strip-logos">
          <span className="trust-logo" aria-label="Chainlink">Chainlink</span>
          <span className="trust-logo" aria-label="OpenZeppelin">OpenZeppelin</span>
        </div>
        <span className="trust-strip-divider" aria-hidden="true">•</span>
        <span className="trust-strip-metric" aria-label="Total borrowed: 6.8 million dollars">
          $6.8M+ Borrowed
        </span>
        <span className="trust-strip-divider" aria-hidden="true">•</span>
        <span className="trust-strip-metric" aria-label="12 active vaults">
          12 Active Vaults
        </span>
      </div>
    </div>
  );
}
