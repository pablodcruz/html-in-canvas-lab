# Browser support strategy

HTML-in-Canvas is an experimental capability. The showcase treats native
rendering as an enhancement, not a baseline.

## Current experimental path

The Chrome origin-trial announcement documents the API for Chrome 148–150 and
recommends Chrome Canary 149 or newer with
`chrome://flags/#canvas-draw-element` enabled for local testing.

Because this status will change, verify it against the
[official Chrome article](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
before planning a release.

## Capability detection

Use the API surface itself:

```js
export const supportsHTMLInCanvas =
  "CanvasRenderingContext2D" in window &&
  "drawElementImage" in CanvasRenderingContext2D.prototype;
```

Avoid user-agent checks. They become stale and do not prove that a flag or
origin-trial token is active.

## Recommended rendering tiers

### Tier A: Native HTML-in-Canvas

Use `drawElementImage`, `texElementImage2D`, or
`copyElementImageToTexture` when the exact method required by the experience is
present.

### Tier B: DOM plus graphics overlay

Keep the interactive content in ordinary DOM and run visual effects in a
pointer-transparent Canvas/WebGL layer. This preserves semantics and can deliver
many of the same aesthetics in current browsers.

### Tier C: Semantic DOM only

When graphics APIs, motion preferences, device capability, or power constraints
make the enhanced path inappropriate, render the content without the effect.

## Production checklist

- Register and configure an origin-trial token only after reviewing its scope
  and expiration.
- Keep a kill switch for the experimental path.
- Avoid duplicating business state between native and fallback UIs.
- Verify focus order and hit testing after every transform change.
- Test zoom, text scaling, high-density displays, and resize behavior.
- Respect `prefers-reduced-motion`.
- Pause render loops when off-screen.
- Record performance on representative low-power devices.
- Recheck the spec and implementation before each browser milestone.
