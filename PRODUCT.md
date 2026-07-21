# Product

## Register

product

## Platform

web

## Users
Software engineers, QA developers, and test automation engineers debugging integration/UI tests. They are typically looking at transaction logs during local development or CI failure review, seeking to quickly identify why a test failed, where a wizard state deviated, or what payloads were exchanged.

## Product Purpose
Provide a lightweight, fast, dependency-free developer dashboard to inspect and compare application logs and network transactions. Success means developers can pinpoint errors, trace session states, and compare sequence/payload discrepancies between test runs in seconds rather than minutes of manual file reading.

## Positioning
A zero-friction log analysis console that makes complex transaction flows and payload differences instantly readable.

## Brand Personality
* **Voice**: Precise, technical, and concise. No conversational filler or marketing-style adjectives.
* **Tone**: Expert-focused, reliable, and functional.
* **3-Word Personality**: Technical, Swift, Precise.
* **Emotional Goals**: Gives the engineer confidence, focus, and a sense of control.

## Anti-references
* **Approachable SaaS Templates**: Low-density grids with huge margins, giant headers, slow fade-in animations, and overly rounded panels.
* **Over-decorated UIs**: Glassmorphic card layouts with unnecessary icons, colored drop-shadows, or display serif fonts.

## Design Principles
1. **Data Density Over Decoration**: Maximize horizontal and vertical real estate for code logs, tables, and diff outputs. Avoid unnecessary white space or decorative framing.
2. **Speed to Insight**: Keep page loads and UI transitions under 150ms. Information should be immediate, scroll-synced, and searchable without secondary navigation steps.
3. **Familiar Technical Affordances**: Use conventions developers trust, such as code-editor-style split diff columns, status pill color schemes (green for ok, red for error), and sticky headers.

## Accessibility & Inclusion
* Target WCAG 2.1 AA compliance with a strict focus on contrast (≥ 4.5:1 for code syntax and console text).
* Support user-controlled font scaling.
* Respect `prefers-reduced-motion` settings.
