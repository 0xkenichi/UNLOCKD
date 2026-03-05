// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export default function UseCaseCard({ emoji, title, description }) {
  return (
    <div className="use-case-card">
      <div className="use-case-header">
        <span className="use-case-emoji" role="img" aria-hidden="true">
          {emoji}
        </span>
        <h3 className="use-case-title">{title}</h3>
      </div>
      <p className="use-case-description">{description}</p>
    </div>
  );
}
