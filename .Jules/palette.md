## 2025-05-14 - [Accessibility & Focus Management]
**Learning:** In single-page applications (SPAs) like this dashboard, managing focus during view transitions and ensuring clear visual focus indicators is crucial for keyboard users. The app was missing `aria-current` for navigation and had weak focus indicators.
**Action:** Always implement `:focus-visible` for consistent keyboard navigation and use `aria-current="page"` to indicate the active section to screen readers.
