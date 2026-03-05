// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export default function TestimonialCard({ quote, name, role, company }) {
  return (
    <div className="testimonial-card">
      <blockquote className="testimonial-quote">
        <p>{quote}</p>
      </blockquote>
      <div className="testimonial-author">
        <div className="testimonial-avatar" aria-hidden="true">
          <span>{name.charAt(0)}</span>
        </div>
        <div className="testimonial-info">
          <cite className="testimonial-name">{name}</cite>
          <p className="testimonial-role">
            {role}
            {company && (
              <>
                , <span className="testimonial-company">{company}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
