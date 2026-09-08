# OverlayManager

`@jankincheloe/overlay-manager` is product-neutral infrastructure for dialogs,
drawers, popovers, menus, toasts, and other layered overlays. The core is a
React-free immutable store. The optional React adapter adds a portal host,
Escape dismissal, focus return, a modal focus trap, and reference-counted body
scroll locking. It supplies no visible copy, colors, layout, or finished dialog
design.

## Installation

```bash
npm install @jankincheloe/overlay-manager
```

React applications should also have compatible `react` and `react-dom`
installations. They are optional peer dependencies; the core entry point does
not import either package.

## Core

Define the payload shape once and retain type checking for every overlay type.
`getSnapshot()` returns a frozen state object and each update creates a new
state/array; callers can safely use it with `useSyncExternalStore` or another
state system.

```ts
import { createOverlayManager } from "@jankincheloe/overlay-manager/core";

type Overlays = {
  confirm: { action: string };
  details: { recordId: string };
};

const overlays = createOverlayManager<Overlays>();
const id = overlays.open("confirm", { action: "delete" }, {
  modal: true,
  dismissible: true,
});

overlays.getTop();
overlays.closeTop(); // only closes the top entry when it is dismissible
overlays.replace(id, { type: "details", payload: { recordId: "42" } });
overlays.clear();
```

`open` also accepts one request object. IDs are generated uniquely, or may be
provided explicitly. Duplicate explicit IDs throw. Entries are sorted by
ascending `layer`, with insertion order retained for equal layers. `close` is
programmatic and can close any ID; `closeTop` is deliberately dismissal-safe:
an undismissible top entry prevents Escape or `closeTop` from reaching lower
entries.

## React adapter

The adapter is imported separately so server-side core consumers never load
React or DOM code. The renderer owns all product markup and text:

```tsx
import { OverlayProvider, useOverlay } from "@jankincheloe/overlay-manager/react";

type Overlays = { dialog: { titleId: string } };

function App() {
  return (
    <OverlayProvider<Overlays> render={(entry, { close }) => (
      <section data-kind={entry.type}>
        {/* Render your labelled, styled dialog here. */}
        <button onClick={close}>Close</button>
      </section>
    )}>
      <Page />
    </OverlayProvider>
  );
}

function Page() {
  const { open } = useOverlay<Overlays>();
  return <button onClick={() => open("dialog", { titleId: "title" }, { modal: true })}>Open</button>;
}
```

`OverlayProvider` renders a neutral host into `document.body` after mount. A
custom `portalTarget` can be supplied. `OverlayPortalHost` is exported for
applications that need to position it themselves. `useOverlayManager()` gives
direct access to a provider's manager, while `useOverlayStack` aliases
`useOverlay`.

## Accessibility responsibility

The adapter handles the mechanics of returning focus to the element active
before an overlay opened, trapping Tab focus within the top modal overlay, and
closing only a top dismissible overlay on Escape. It does not know whether an
overlay is a dialog, menu, or toast and therefore does not invent ARIA roles,
labels, descriptions, announcements, inertness, or visual focus indicators.
The renderer must provide an appropriate semantic structure, accessible name,
description where needed, and a visible keyboard focus treatment. Non-modal
overlays should not be marked modal merely to obtain scroll locking.

The DOM helpers in `@jankincheloe/overlay-manager/dom` are intentionally small
and independently testable. Body scroll locking is reference-counted per
document and restores the exact inline styles when the last modal releases its
lock; all browser work is guarded for SSR.

For an application-level integration example, see the
[integration guide](../docs/integration.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
git diff --check
```

## License

[MIT](../LICENSE)
