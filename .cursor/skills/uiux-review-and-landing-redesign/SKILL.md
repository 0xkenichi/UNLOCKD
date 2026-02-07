---
name: uiux-review-and-landing-redesign
description: End-to-end UI/UX design review and redesign workflow for frontend apps. Use when a user asks to review UI/UX, check design issues, enforce best practices, redesign or rebuild pages, critique landing pages, run a design audit, or mentions kombai. Includes stack discovery, route selection, review scoping, design review across visual/UX/responsive/a11y/motion/consistency/perf, wireframe generation, and implementation in the repo.
---

# UI/UX Review + Landing Redesign

## Quick start

Follow this workflow to review and redesign a target route. Keep changes within the existing stack and patterns. Avoid adding dependencies unless required.

## Workflow

### 1) Discover tech stack
- Inspect the repo to infer framework, build tool, styling approach, router, testing, animation library, auth, and runtime.
- Summarize the inferred stack briefly and proceed without asking for confirmation unless the user explicitly wants to override.

### 2) Identify routes
- Enumerate available routes/pages from the codebase.
- Ask which route to review.

### 3) Confirm scope
Ask the user:
- Review type: current implementation, reimagine (new wireframe), or both.
- Aspects to review: visual design, UX/usability, responsive/mobile, accessibility, micro-interactions/motion, consistency, performance, or all.

### 4) Run the app
- Start the dev server.
- Open the target route in the browser tool and capture the current UI state.

### 5) Perform design review (all aspects)
For the chosen route:
- **Visual design**: hierarchy, typography, spacing, color usage, and brand alignment.
- **UX/usability**: clarity of value prop, flow, navigation, CTA placement, and cognitive load.
- **Responsive/mobile**: layout, touch targets, mobile readability, key content ordering.
- **Accessibility**: contrast, focus states, keyboard nav, ARIA labels, semantic structure.
- **Micro-interactions/motion**: hover/focus behavior, motion clarity, performance impact.
- **Consistency**: component patterns, spacing scale, tone, icon usage.
- **Performance**: heavy visuals, unnecessary reflows, large assets.

Output:
- A prioritized list of issues (critical/high/medium/low).
- A short roadmap for fixes.

### 6) Generate a wireframe
- Create a low-fidelity wireframe for the target route.
- Emphasize information hierarchy, conversion flow, and trust building.
- Tag sections with reuse vs. new components.
- If `.kombai/` resources exist, mimic the kombai style and structure in the wireframe artifact.

### 7) Implement redesign
- Add or update components.
- Update the page layout.
- Ensure accessibility fixes (contrast, labels, focus states).
- Avoid adding dependencies unless necessary. If needed, install carefully.

### 8) Validate
- Check for lint errors on touched files.
- Note any known performance risks (for example, heavy 3D scenes).

## Output format
- Provide the wireframe artifact path.
- Provide the design review summary with counts by severity.
- Provide what changed in code and where.

## Notes
- Keep modifications within the existing stack and patterns.
- Prefer existing component styles; create new ones only when required.
- Use ASCII in comments and identifiers unless the repo already uses Unicode.

## Additional resources
- For detailed checklists, see [reference.md](reference.md)
- For output examples, see [examples.md](examples.md)
