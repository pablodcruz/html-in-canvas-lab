# How HTML-in-Canvas works

HTML-in-Canvas connects two models that historically lived apart:

- the DOM provides semantic layout, inputs, selection, accessibility, and
  browser integrations;
- Canvas 2D, WebGL, and WebGPU provide programmable pixels and spatial effects.

## Canvas 2D

`CanvasRenderingContext2D.drawElementImage(element, x, y)` paints a laid-out DOM
element into a 2D context. The returned transform describes where the browser
should consider that element to be for interaction.

The canvas `paint` event is the synchronization point. It runs when the element
needs to be redrawn, including after user input or selection changes.

## WebGL

WebGL uses `texElementImage2D()` to upload a DOM element as a texture source.
Because shader code determines where a texture finally appears, the browser
cannot infer the interaction transform automatically.

For a conventional model-view-projection pipeline, the transform is conceptually:

```text
viewport × model-view-projection × CSS normalization
```

Pass that screen-space matrix to `canvas.getElementTransform()` and apply the
result to the source element.

## WebGPU

WebGPU follows the same idea through
`device.queue.copyElementImageToTexture()`. The application owns texture
placement, so it also owns the matrix required to synchronize the DOM surface.

## What the bridge preserves

Because HTML remains HTML, the browser can retain:

- layout and bidirectional text;
- form-control behavior;
- selection, copy/paste, and context menus;
- accessibility-tree exposure;
- find-in-page;
- indexability;
- extension and DevTools integration.

## Important limitations

- Cross-origin iframe content cannot be used as a source.
- Canvas updates rely on JavaScript and the main thread.
- Complex scrolling surfaces require careful performance testing.
- The implementation is experimental and can change during the trial.

See the
[Chrome for Developers origin-trial announcement](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
for the authoritative current API notes.
