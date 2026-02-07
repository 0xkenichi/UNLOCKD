# Reference

## Discovery checklist
- Framework/runtime: React, Next.js, Vue, Svelte, etc.
- Build tool: Vite, Next, Webpack, etc.
- Styling: CSS, Tailwind, CSS Modules, styled-components, etc.
- Router: react-router, Next app/router, etc.
- Testing: Playwright, Cypress, Vitest, Jest.
- Animation: Framer Motion, GSAP, CSS transitions.
- Auth: custom, Auth0, Clerk, etc.

## Route discovery tips
- Scan `src/routes`, `pages`, `app`, `router` files.
- Read route arrays or router config.
- For file-based routing, list top-level route files and folders.

## Review checklist by aspect

### Visual design
- Heading hierarchy is clear and consistent
- Type scale is readable; body text 16px+ on desktop
- Spacing is consistent with a simple scale (4/8/12/16/24/32)
- Color usage is purposeful; primary and secondary actions are distinct
- Brand alignment is consistent across sections

### UX/usability
- Value prop is clear above the fold
- Primary CTA is prominent and repeated at logical points
- Secondary actions are de-emphasized
- Navigation is concise and predictable
- Content density is appropriate for scanning

### Responsive/mobile
- Key content and CTA are visible without deep scrolling
- Touch targets are at least 44px
- Sections stack in a logical order
- Images and cards scale without overflow

### Accessibility
- Color contrast meets WCAG AA
- Focus states are visible on all interactive elements
- Keyboard navigation works for main flows
- Buttons/links have accessible names
- Semantic landmarks exist (header/main/footer)

### Micro-interactions/motion
- Hover and focus states communicate affordance
- Motion supports comprehension and does not distract
- Reduced motion preference is respected if applicable
- Transitions do not trigger layout thrashing

### Consistency
- Reused components match style tokens
- Icon style is consistent (stroke/filled)
- Copy tone is consistent across sections
- Spacing and alignment repeat across sections

### Performance
- Large images are optimized and sized correctly
- Avoid heavy client-only effects by default
- Minimize layout shifts from late-loading content

## Wireframe template (low fidelity)

Use this simple structure. Tag each section with `[reuse]` or `[new]`.

```text
[Hero / value prop] [reuse/new]
 - H1
 - Subhead
 - Primary CTA
 - Secondary CTA

[Trust strip] [reuse/new]
 - Logos / stats

[Problem / Solution] [reuse/new]
 - 3-up cards

[How it works] [reuse/new]
 - Steps / timeline

[Proof] [reuse/new]
 - Testimonials / case studies

[FAQ] [reuse/new]
 - 4-6 items

[Final CTA] [reuse/new]
 - H2
 - Primary CTA
```

## Kombai mimic guidance
- If `.kombai/resources/` contains relevant artifacts, mirror its section headings and ordering.
- Favor concise bullet reviews and a single low-fidelity wireframe artifact (HTML or Markdown).
- Use neutral, product-focused language and avoid decorative flourishes.
