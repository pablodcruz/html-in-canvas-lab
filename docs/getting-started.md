# Getting started

## 1. Start with semantic HTML

Place the content you want to render inside a canvas with the experimental
`layoutsubtree` attribute:

```html
<canvas id="scene" layoutsubtree>
  <form id="controls">
    <label for="intensity">Intensity</label>
    <input id="intensity" type="range" min="0" max="100" />
  </form>
</canvas>
```

The nested form remains DOM content. That is the important part: the browser can
still understand its labels, control states, and text.

## 2. Size the canvas for the display

Match the canvas backing grid to the physical pixel density. Otherwise, the
result can look blurry on high-density screens.

```js
const observer = new ResizeObserver(([entry]) => {
  const physicalSize = entry.devicePixelContentBoxSize;
  const scale = window.devicePixelRatio || 1;

  scene.width = physicalSize
    ? physicalSize[0].inlineSize
    : Math.round(entry.contentRect.width * scale);
  scene.height = physicalSize
    ? physicalSize[0].blockSize
    : Math.round(entry.contentRect.height * scale);
});

observer.observe(scene);
```

## 3. Draw and synchronize

Canvas 2D uses `drawElementImage()`. Run it inside the canvas `paint` event and
apply the returned transform to the source element:

```js
const ctx = scene.getContext("2d");

scene.onpaint = () => {
  ctx.reset();
  const transform = ctx.drawElementImage(controls, 0, 0);
  controls.style.transform = transform.toString();
};
```

That final assignment keeps the interactive DOM surface aligned with the pixels
the user sees.

## 4. Add a first-class fallback

This is an early experimental feature. Detect the method, not the browser:

```js
const supportsHTMLInCanvas =
  "CanvasRenderingContext2D" in window &&
  "drawElementImage" in CanvasRenderingContext2D.prototype;
```

If the result is false, render the same semantic control surface normally. In a
production codebase, make the shared form a reusable component so native and
fallback paths do not drift apart.

## 5. Test the whole interaction model

Do not stop at visual parity. Test:

- keyboard focus and tab order;
- pointer hit targets after transforms;
- text selection and copy;
- find-in-page;
- browser zoom and high-density displays;
- screen-reader labels and state announcements;
- reduced-motion behavior;
- cleanup when a component unmounts.

Continue with [How the API works](./how-it-works.md) or the
[browser support strategy](./browser-support.md).
