export const mockPositions = [
  {
    id: 'BIO-2026-01',
    token: 'BIO',
    quantity: '50,000',
    pv: '$20,350',
    ltv: '35%',
    unlock: 'Jan 2027'
  },
  {
    id: 'CRDT-2026-05',
    token: 'CRDT',
    quantity: '120,000',
    pv: '$58,200',
    ltv: '30%',
    unlock: 'May 2027'
  }
];

export const mockSimPaths = Array.from({ length: 80 }).map((_, idx) => {
  const base = idx < 10 ? 0.6 : 1.1;
  return Array.from({ length: 20 }).map((__, i) => [
    i * 0.4 - 3.5,
    Math.sin(i / 2 + idx) * 0.3 + base,
    0
  ]);
});
