---
name: web-design-analysis
description: Analyze reference websites section by section, teach reusable frontend design principles, and produce an implementation-ready prompt for a coding agent. Use when reviewing, recreating, or improving a web page from a URL, screenshot, or written brief.
---

# Web Design Analysis & Build Brief

Use this skill to turn a reference page into an evidence-based design review and a practical build specification. Keep analysis, recommendation, and implementation clearly separated.

## 1. Establish scope

- Identify the page type, audience, primary user task, conversion goal, device targets, known stack, and constraints.
- Confirm the exact URL and whether it is accessible. Inspect the supplied page, not a similarly named brand or search result.
- If access is unavailable, say so. Continue with user-supplied screenshots/notes or provide an explicitly labeled hypothesis; never claim to have observed inaccessible content.
- Do not bypass authentication, paywalls, robots controls, or access restrictions.

## 2. Inspect the complete page

Review desktop and mobile when available. Scroll through the entire page and inventory every actual section from header to footer. For each section record:

1. Observed content and user purpose.
2. Layout: container width, grid, alignment, spacing, density, and transitions between sections.
3. Visual system: typography roles, hierarchy, color usage, borders, radii, imagery, crop, and art direction. Mark color measurements as estimates unless sampled directly.
4. Components and information priority.
5. Observable interactions: trigger, response, duration/sequence when measurable, focus/selected/loading/empty/error/success state, and touch/keyboard behavior.
6. Responsive changes and any differences in content order or interaction.
7. Professional evaluation: what works, user friction or accessibility risk, reusable principle, and actionable improvement.

Label claims as **Observed**, **Inferred**, or **Recommendation**. Do not invent hidden sections, animation timings, business metrics, testimonials, or responsive behavior. Use “not verified” where appropriate.

## 3. Teach through the analysis

Explain at least one useful design principle per meaningful section in plain language. Connect the principle to evidence from the section. Examples include visual hierarchy, information architecture, proximity and similarity, progressive disclosure, feedback, affordance, responsive reflow, and accessible focus. Avoid jargon without an explanation and avoid unrelated lectures.

## 4. Produce a usable design system and interaction spec

Summarize page purpose, user journey, complete section order, reusable components, estimated typography/color/spacing/image rules, interaction matrix, responsive behavior, accessibility/performance risks, and asset/licensing considerations. Distinguish measured values from estimates. Rank issues by impact and point each recommendation to a section and observation.

For every interactive component specify:

- Input method and trigger (pointer, touch, keyboard, submit, scroll).
- Visible result and reversible/close behavior.
- Default, focus, hover, active/selected, disabled, loading, empty, error, and success states as relevant.
- Keyboard semantics, focus visibility/management, reduced-motion alternative, and mobile equivalent.

## 5. Write the build prompt

The prompt must be portable across coding agents and include:

- Goal, audience, page type, primary action, URL, and constraints.
- An instruction to inspect the reference directly and to disclose access limitations.
- Every observed page section, with purpose, visual treatment, hierarchy, components, interaction and states, responsive behavior, professional note, and editability requirements.
- A maintainable implementation plan: reusable components, centralized editable content/theme configuration, section ordering and visibility controls, and real asset paths.
- Requirements for semantic HTML, accessible controls, keyboard use, reduced motion, responsive layouts, image alternatives, performance, and no dead buttons.
- A no-fabrication rule for identity, product facts, testimonials, metrics, and outcomes.
- Verification tasks and a final report listing files changed, how to edit modules, checks run, and unresolved assumptions.

If reference details have not yet been inspected, describe a structured checklist/template for the implementing agent to complete before coding rather than pretending the analysis is finished.

## 6. Review implementation quality

Before handoff, check the page at narrow and wide viewports; exercise visible controls, navigation, forms, and error/success states; check keyboard focus and reduced motion; look for overflow, missing image fallbacks, contrast issues, console errors, and inaccessible labels. Report checks actually run, not checks merely recommended.

## Public upstream practices

This skill is an original, portable synthesis informed by these public repositories; it does not bundle their source files:

- Anthropic `frontend-design`: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Vercel Labs `web-interface-guidelines`: https://github.com/vercel-labs/web-interface-guidelines
- Microsoft `frontend-design-review`: https://github.com/microsoft/skills/tree/main/.github/skills/frontend-design-review

Consult each repository's current license and instructions before copying or redistributing its files. This synthesis is not a substitute for the upstream projects' own skills.
