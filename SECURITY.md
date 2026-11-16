# Security policy

## Reporting a vulnerability

Please do not publish exploitable issues. Use GitHub's **private vulnerability reporting** for this repository, or contact the maintainers privately.

## Design notes

| Area | Behavior |
| --- | --- |
| Data | The app is static and sends nothing to a server. Drafts, saved layouts and imported files stay in the browser. |
| Untrusted input | Imported layouts and class-link JSON are validated, size-limited and sanitised before use. |
| Dependencies | Third-party libraries load from pinned versions on public CDNs. |
| Configuration | `src/assets/js/config.js` is public and must never contain tokens, passwords or credentials. |

## Keeping the repository clean

- Keep `.env*`, keys, local configuration and personal paths out of Git (see `.gitignore`).
- `npm run check` scans sources for credential-like strings, personal paths and local addresses.
