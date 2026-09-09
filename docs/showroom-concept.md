# Showroom concept

This worktree contains a visual product concept, not the production implementation. Open
`/showroom-concept` and use the concept switcher to walk through all seven states.

## Product model

- `Showroom` becomes the fourth project surface beside Board, Wiki, and E2E.
- The repository remains the source of truth. A newly created project gets a tracked
  `showroom/.gitkeep` because Git cannot store an empty directory.
- Direct subdirectories under `showroom/` become categories. Every `.html` file becomes a
  reviewable view. Other files are treated as assets and do not appear as views.
- A view should be identified by repository path plus Git blob hash. This keeps feedback tied
  to the exact version a reviewer saw even when a later iteration changes the file.
- Relative assets are served from the same category tree so generated prototypes can include
  their own CSS, JavaScript, fonts, and images.

Example:

```text
showroom/
├── startseite/
│   ├── story-v3.html
│   ├── minimal-v2.html
│   └── assets/
├── onboarding/
│   ├── willkommen.html
│   └── reise-waehlen.html
└── buchung/
    └── checkout.html
```

## Review flow

1. An internal user opens the Showroom surface and sees repository categories and HTML views.
2. They create a named, revocable share link with category scope, expiry, and feedback rights.
3. The guest opens `/s/:token` and sees only the shared Showroom; no application sidebar or
   other project APIs are reachable through that token.
4. In a view, the guest can comment on the whole page or activate element selection. The
   selected element is outlined and summarized before the comment is sent.
5. Internal feedback is collected in one inbox and can be filtered by state, category, view,
   reviewer, and version.
6. Selected feedback creates a new iteration. The agent receives the current HTML, its assets,
   the selected comments, element context, and an additional instruction. By default it writes
   a new versioned file and links the resulting Kanban task back to the feedback.

## Element feedback contract

The viewer and prototype must run on separate origins. Prototype HTML can contain arbitrary
generated JavaScript, so it should be served from a dedicated sandbox origin with a strict CSP
and no Agent Kanban cookies. A small review bridge is injected into the response and exchanges
only typed `postMessage` events with the parent viewer.

For each element comment, store more than a brittle CSS selector:

- repository path, Git blob hash, and viewport;
- tag name, stable ID and classes when present;
- short accessible-name or text fingerprint;
- normalized bounding rectangle and scroll position;
- selector candidates and nearest semantic ancestor;
- optional small context screenshot.

This allows the next iteration to understand the target even when the DOM changes.

## Share-link security

- Generate at least 256 bits of random token material and store only a cryptographic hash.
- Scope authorization to `showroom:read` and optionally `showroom:comment`; never reuse normal
  project or API-token middleware.
- Revoke immediately, support explicit expiry, rate-limit token lookups and comments, and keep
  an audit trail without logging the raw token.
- Resolve every requested path through a containment check and reject symlink or traversal
  escapes from the project's `showroom/` directory.
- Apply a restrictive sandbox, CSP, download policy, file-size limits, and MIME validation to
  prototype responses.

## Visual states

The screenshots in `artifacts/showroom-concept/` cover:

1. first-run repository setup;
2. populated internal library;
3. share-link management;
4. external Showroom landing page;
5. element-specific feedback and its confirmation;
6. internal feedback inbox;
7. creation of a versioned agent iteration.
