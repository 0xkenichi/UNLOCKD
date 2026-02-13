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
