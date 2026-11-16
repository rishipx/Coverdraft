# Accessibility and mobile behavior

Coverdraft handles dialogs from the keyboard, remembers a light/dark theme, shows clear focus rings, sizes controls for touch, respects safe areas and honors reduced motion.

## Implemented behavior

| Area | Behavior |
| --- | --- |
| Dialog semantics | Open modals get `role="dialog"`, `aria-modal="true"` and a name from their visible heading. |
| Focus | Tab and Shift+Tab stay inside the topmost dialog. Closing returns focus to the opener when it still exists; nested dialogs keep focus in the remaining top one. |
| Dismissal | Escape closes the topmost dialog. Backdrop clicks close supported non-destructive dialogs. |
| Theme | The More menu's theme action is a checked menu item. `light` or `dark` persists in local storage and updates `color-scheme` and the browser theme color. |
| Names | Static controls are named by labels, `aria-label` or `aria-labelledby`. `npm run check` rejects unnamed controls and broken references. |
| Focus ring | `:focus-visible` shows a high-contrast 3 px outline with offset. |
| Touch | Coarse pointers get roughly 44 px minimum targets and safe-area-aware dialog heights. |
| Motion | `prefers-reduced-motion: reduce` shortens animation and transitions, removes repeats and disables smooth scrolling across the whole stylesheet. |

## Automated checks

**`npm run check`** validates control naming and `aria-labelledby` references, focus styling, touch-target rules, theme-token contrast, reduced-motion rules, source syntax, local assets and repository hygiene.

**Chromium tests** (optional, need Python Playwright and Chromium; set `CHROMIUM_PATH` for a nonstandard install):

| Command | Covers |
| --- | --- |
| `python tests/browser-smoke.py` | Full local app modules, control naming, Quick Start dismissal and focus restore, theme changes, mobile Advanced mode and Index navigation, sidebar dismissal, horizontal overflow at six viewport widths |
| `python tests/accessibility.py` | Keyboard, dialog, reduced-motion, theme and touch-target checks |

The smoke harness inlines local resources and excludes the CDN PDF libraries. Neither test replaces deployment testing of the real Content Security Policy, live CDN loading, service-worker updates, screen-reader output or actual PDF generation.

## Contrast policy

`npm run check` computes relative luminance and tests selected primary, muted, dim and accent text tokens against their surface tokens at WCAG AA **4.5:1**. A key control boundary is checked at **3:1**, and the light-theme primary button label is checked separately. These are regression checks for representative tokens, not an audit of every state, image, canvas or third-party library.

## Manual release checklist

Test the deployed site at desktop and mobile widths, with a keyboard and at least one screen reader.

- [ ] Open and close each dialog with its trigger, Escape and backdrop. Focus returns to the trigger and never leaves the topmost dialog.
- [ ] Test stacked dialogs, validation messages, long content and very short landscape viewports.
- [ ] Check focus indicators, text, icons, controls, disabled and hover states and overlays in both themes at 200% zoom.
- [ ] On a physical phone, check touch targets, virtual-keyboard scrolling, safe-area insets and rotation.
- [ ] Turn on the OS reduced-motion setting and confirm no distracting decorative movement.
- [ ] With NVDA or VoiceOver, check dialog announcements and reading order. Automated DOM checks cannot validate speech quality.
