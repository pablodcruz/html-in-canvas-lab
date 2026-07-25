# Feature coverage matrix

The [Capability Atlas](../features.html) maps the current WICG explainer and
Chrome origin-trial documentation to a concrete test surface. Native experimental
paths are feature-detected. A runnable compatibility path remains active when a
primitive is unavailable.

## Rendering primitives

| Capability | Native API | Runnable lab | Compatibility path |
| --- | --- | --- | --- |
| Canvas 2D | `drawElementImage()` | Interactive range control rendered from HTML | Identical semantic form |
| WebGL | `texElementImage2D()` | Animated HTML texture on a GPU quad | Canvas-generated WebGL texture |
| WebGPU | `copyElementImageToTexture()` | Semantic panel copied to a GPU texture | Animated Canvas 2D surface |
| Worker rendering | `captureElementImage()` + `OffscreenCanvas` | Live worker-rendered signal | Worker-generated pixels |
| Paint lifecycle | `paint`, `changedElements`, `requestPaint()` | Mutation and invalidation counter | Simulated invalidation log |

## Layout and synchronization

| Capability | Native API or behavior | Runnable lab |
| --- | --- | --- |
| Transform synchronization | Returned `DOMMatrix` and `getElementTransform()` | Rotated surface with a clickable hit target |
| Responsive physical sizing | `ResizeObserver` and device pixel ratio | Resizable grid with CSS/grid/DPR readout |
| Progressive enhancement | Feature detection | Forced enhanced/plain modes using one semantic source |

The Canvas 2D and native browser-integration labs apply the transform returned by
`drawElementImage()` to the direct canvas child. The WebGL path calls
`getElementTransform()` when that helper is available.

## Preserved browser integrations

| Browser feature | Runnable proof |
| --- | --- |
| Text layout and formatting | English, Arabic RTL, and vertical Japanese switcher |
| Native form controls | Required text input, autocomplete, select, constraint validation, and output |
| Selection, copy/paste, and context menus | Selectable phrase, Clipboard API action, paste target, context-menu counter |
| Accessibility | Keyboard-operable toggle, accessible description, pressed state, and live announcement |
| Find-in-page | Unique searchable DOM beacon with a copy-search-term action |
| Indexability and agent interface | Semantic article, structured data, and live crawler-view extraction |
| Extension integration | MutationObserver-backed text-replacement simulation |
| DevTools integration | Inspectable component with a live CSS custom property and computed-style readout |

In browsers with `drawElementImage()`, each browser-integration surface is moved
into a direct `layoutsubtree` canvas child, painted into Canvas 2D, and spatially
synchronized. In other browsers it remains ordinary, fully functional DOM.

## Additional proposal constraints represented

- Direct-child and generated-box requirements are respected by every native
  source.
- Canvas backing stores track the display's physical pixel density.
- Fallbacks do not depend on user-agent detection.
- Reduced-motion preferences stop nonessential animation loops.
- The project does not attempt to render cross-origin iframe content.
- The worker lab keeps useful behavior without `captureElementImage()` by
  generating its chart inside `OffscreenCanvas`.

## Authoritative references

- [WICG HTML-in-Canvas living explainer](https://github.com/WICG/html-in-canvas)
- [Chrome for Developers origin-trial announcement](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
