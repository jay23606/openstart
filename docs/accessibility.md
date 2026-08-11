# Accessibility baseline

OpenStart targets WCAG 2.2 Level AA for public, runner, and organizer workflows.
Automated Axe checks cover discovery, demo, help, architecture, authenticated
dashboards, roster management, and registration-management dialogs.

The browser suite also verifies:

- a first-focus skip link to the main content;
- keyboard activation, modal focus containment, Escape closing, and focus return;
- visible focus indicators;
- 320-pixel mobile reflow with text enlarged to 200%;
- reduced-motion behavior; and
- forced-colors compatibility.

Current support targets the latest two releases of Chrome, Edge, Firefox, and
Safari. Automated checks cannot prove full conformance. Before a public beta,
complete manual testing with NVDA plus Firefox or Chrome, VoiceOver plus Safari,
keyboard-only navigation, browser zoom at 200% and 400%, and representative
mobile screen readers. Report accessibility problems through the Help page with
the affected page, browser, assistive technology, and expected behavior; never
include account or payment secrets.
