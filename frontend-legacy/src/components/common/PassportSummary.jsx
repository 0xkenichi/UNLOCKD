// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export default function PassportSummary({
  score = null,
  stamps = null,
  loading = false,
  label = 'Passport',
  showLabel = true,
  as = 'span',
  className = '',
  style
}) {
  const Component = as;
  const content = loading ? 'Loading...' : `Score: ${score ?? '—'} · Stamps: ${stamps ?? 0}`;
  const prefix = showLabel ? `${label}: ` : '';
  return (
    <Component className={className} style={style}>
      {prefix}
      {content}
    </Component>
  );
}
