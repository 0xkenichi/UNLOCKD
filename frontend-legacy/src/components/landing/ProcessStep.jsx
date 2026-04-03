// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export default function ProcessStep({ number, title, description, timeEstimate }) {
  return (
    <div className="process-step">
      <div className="process-step-number" aria-label={`Step ${number}`}>
        <span>{number}</span>
      </div>
      <div className="process-step-content">
        <h3 className="process-step-title">{title}</h3>
        <p className="process-step-description">{description}</p>
        {timeEstimate && (
          <p className="process-step-time" aria-label={`Time estimate: ${timeEstimate}`}>
            <span aria-hidden="true">⏱️</span> ~{timeEstimate}
          </p>
        )}
      </div>
    </div>
  );
}
