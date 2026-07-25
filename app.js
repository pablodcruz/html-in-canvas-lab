const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const supportsDrawElement =
  "CanvasRenderingContext2D" in window &&
  "drawElementImage" in CanvasRenderingContext2D.prototype;

const capability = {
  result: document.querySelector("#heroCapability"),
  title: document.querySelector("#statusTitle"),
  detail: document.querySelector("#statusDetail"),
  icon: document.querySelector("#statusIcon"),
  nativeButton: document.querySelector("#nativeModeButton"),
};

if (supportsDrawElement) {
  capability.result.textContent = "drawElementImage() is available";
  capability.title.textContent = "Native API available";
  capability.detail.textContent = "You can run the experimental renderer";
  capability.icon.textContent = "✓";
} else {
  capability.result.textContent = "fallback → semantic DOM";
  capability.title.textContent = "Compatibility mode active";
  capability.detail.textContent = "Use Chrome Canary + canvas flag for native mode";
  capability.icon.textContent = "↳";
  capability.nativeButton.disabled = true;
  capability.nativeButton.title = "drawElementImage() is unavailable in this browser";
}

document.querySelector("#year").textContent = new Date().getFullYear();

function setupHeroCanvas() {
  const canvas = document.querySelector("#heroCanvas");
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let animationFrame;
  const pointer = { x: 0.72, y: 0.32 };
  const dots = Array.from({ length: 46 }, (_, index) => ({
    x: ((index * 83) % 101) / 100,
    y: ((index * 47 + 13) % 97) / 100,
    r: 0.6 + (index % 4) * 0.38,
    speed: 0.00008 + (index % 5) * 0.000012,
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function draw(time = 0) {
    ctx.clearRect(0, 0, width, height);
    dots.forEach((dot, index) => {
      const drift = reducedMotion ? 0 : Math.sin(time * dot.speed + index) * 15;
      const x = dot.x * width + drift;
      const y = dot.y * height + Math.cos(time * dot.speed + index) * 8;
      const distance = Math.hypot(x - pointer.x * width, y - pointer.y * height);
      const glow = Math.max(0, 1 - distance / 280);

      ctx.beginPath();
      ctx.arc(x, y, dot.r + glow * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${index % 3 === 0 ? "200,255,61" : "150,145,255"}, ${0.18 + glow * 0.55})`;
      ctx.fill();

      if (glow > 0.2) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(pointer.x * width, pointer.y * height);
        ctx.strokeStyle = `rgba(200,255,61,${glow * 0.08})`;
        ctx.stroke();
      }
    });

    if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
  }

  canvas.closest(".hero").addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width;
    pointer.y = (event.clientY - rect.top) / rect.height;
  });

  window.addEventListener("resize", resize);
  resize();
  draw();
  return () => cancelAnimationFrame(animationFrame);
}

function setupControlSurface() {
  const stage = document.querySelector(".control-stage");
  const fallback = document.querySelector("#fallbackSurface");
  const canvas = document.querySelector("#nativeCanvas");
  const nativeSurface = document.querySelector("#nativeSurface");
  const caption = document.querySelector("#stageCaption");
  let nativeContext;
  let observer;

  function syncControls(source) {
    const value = source.value;
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      input.value = value;
      input.style.setProperty("--range", `${value}%`);
      input.nextElementSibling.value = `${value}%`;
    });
    stage.style.setProperty("--signal", value / 100);
  }

  document.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => syncControls(input));
  });

  document.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color;
      document.documentElement.style.setProperty("--active-accent", color);
      document.querySelectorAll(".swatch").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.color === color);
      });
    });
  });

  function startNativeRenderer() {
    if (!supportsDrawElement) return;
    nativeContext = canvas.getContext("2d");

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      canvas.requestPaint?.();
    }

    canvas.onpaint = () => {
      nativeContext.reset();
      const transform = nativeContext.drawElementImage(nativeSurface, 30, 25);
      if (transform) nativeSurface.style.transform = transform.toString();
    };

    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
  }

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.mode === "native" && !supportsDrawElement) return;
      document.querySelectorAll(".mode-button").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      const nativeMode = button.dataset.mode === "native";
      fallback.style.display = nativeMode ? "none" : "block";
      canvas.style.display = nativeMode ? "block" : "none";
      caption.textContent = nativeMode
        ? "Native HTML-in-Canvas · drawElementImage()"
        : "DOM fallback · available everywhere";
      if (nativeMode && !observer) startNativeRenderer();
    });
  });

  syncControls(document.querySelector("#fallbackIntensity"));
}

function setupLens() {
  const stage = document.querySelector("#lensStage");
  const canvas = document.querySelector("#lensCanvas");
  const ctx = canvas.getContext("2d");
  const cursor = document.querySelector("#lensCursor");
  const pointer = { x: 0.5, y: 0.5 };
  let width = 0;
  let height = 0;
  let frame;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function draw(time = 0) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, width, height);

    const cell = 22;
    for (let y = 0; y < height + cell; y += cell) {
      for (let x = 0; x < width + cell; x += cell) {
        const distance = Math.hypot(x - pointer.x * width, y - pointer.y * height);
        const inside = distance < 78;
        const wave = Math.sin(x * 0.035 + y * 0.018 + time * 0.0012);
        const size = inside ? 8 + wave * 4 : 2 + Math.max(0, wave);
        const hue = inside ? (x / Math.max(width, 1)) * 100 + 76 : 0;
        ctx.fillStyle = inside
          ? `hsl(${hue} 95% 67% / 0.9)`
          : `rgba(145, 148, 160, ${0.13 + Math.max(0, wave) * 0.06})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    if (!reducedMotion) frame = requestAnimationFrame(draw);
  }

  function move(event) {
    const rect = stage.getBoundingClientRect();
    pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    pointer.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    cursor.style.left = `${pointer.x * 100}%`;
    cursor.style.top = `${pointer.y * 100}%`;
    if (reducedMotion) draw();
  }

  stage.addEventListener("pointermove", move);
  window.addEventListener("resize", resize);
  resize();
  draw();
  return () => cancelAnimationFrame(frame);
}

function setupStack() {
  const stage = document.querySelector("#stackStage");
  const cards = stage.querySelectorAll(".stack-card");
  let rotationX = -4;
  let rotationY = 7;

  function render() {
    const offsets = [
      "translate3d(38px,-32px,-36px) rotateZ(-5deg)",
      "translate3d(19px,-16px,-18px) rotateZ(-2.5deg)",
      "translate3d(0,0,0)",
    ];
    cards.forEach((card, index) => {
      card.style.transform = `${offsets[index]} rotateX(${rotationX}deg) rotateY(${rotationY}deg)`;
    });
  }

  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    rotationY = ((event.clientX - rect.left) / rect.width - 0.5) * 20;
    rotationX = -((event.clientY - rect.top) / rect.height - 0.5) * 16;
    render();
  });

  stage.addEventListener("pointerleave", () => {
    rotationX = -4;
    rotationY = 7;
    render();
  });

  stage.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") rotationY -= 2;
    if (event.key === "ArrowRight") rotationY += 2;
    if (event.key === "ArrowUp") rotationX += 2;
    if (event.key === "ArrowDown") rotationX -= 2;
    render();
  });

  render();
}

const codeSteps = {
  1: {
    filename: "index.html",
    code: `<span class="line-number">1</span><span class="code-tag">&lt;canvas</span> <span class="code-attr">id</span>=<span class="code-string">"scene"</span> <mark>layoutsubtree</mark><span class="code-tag">&gt;</span>
<span class="line-number">2</span>  <span class="code-tag">&lt;form</span> <span class="code-attr">id</span>=<span class="code-string">"controls"</span><span class="code-tag">&gt;</span>
<span class="line-number">3</span>    <span class="code-tag">&lt;label&gt;</span>Intensity<span class="code-tag">&lt;/label&gt;</span>
<span class="line-number">4</span>    <span class="code-tag">&lt;input</span> <span class="code-attr">type</span>=<span class="code-string">"range"</span> <span class="code-tag">/&gt;</span>
<span class="line-number">5</span>  <span class="code-tag">&lt;/form&gt;</span>
<span class="line-number">6</span><span class="code-tag">&lt;/canvas&gt;</span>`,
    title: "The attribute is the handshake.",
    text: "<code>layoutsubtree</code> tells the browser to lay out descendants of the canvas and expose them to accessibility systems.",
  },
  2: {
    filename: "renderer.js",
    code: `<span class="line-number">1</span><span class="code-keyword">const</span> ctx = scene.<span class="code-method">getContext</span>(<span class="code-string">"2d"</span>);
<span class="line-number">2</span>
<span class="line-number">3</span>scene.<span class="code-attr">onpaint</span> = () =&gt; {
<span class="line-number">4</span>  ctx.<span class="code-method">reset</span>();
<span class="line-number">5</span>  <span class="code-keyword">const</span> transform =
<span class="line-number">6</span>    ctx.<mark>drawElementImage</mark>(controls, 0, 0);
<span class="line-number">7</span>};`,
    title: "Painting follows DOM updates.",
    text: "The <code>paint</code> event runs when content needs redrawing. Canvas 2D returns the transform needed for spatial synchronization.",
  },
  3: {
    filename: "renderer.js",
    code: `<span class="line-number">1</span>scene.<span class="code-attr">onpaint</span> = () =&gt; {
<span class="line-number">2</span>  ctx.<span class="code-method">reset</span>();
<span class="line-number">3</span>  <span class="code-keyword">const</span> transform =
<span class="line-number">4</span>    ctx.<span class="code-method">drawElementImage</span>(controls, 0, 0);
<span class="line-number">5</span>
<span class="line-number">6</span>  controls.style.transform =
<span class="line-number">7</span>    <mark>transform.toString()</mark>;
<span class="line-number">8</span>};`,
    title: "Pixels and hit targets agree.",
    text: "Applying the returned transform lets the browser map focus, clicks, selection, and other interactions to the element’s rendered location.",
  },
};

function setupWalkthrough() {
  const code = document.querySelector("#activeCode code");
  const filename = document.querySelector("#codeFilename");
  const explanation = document.querySelector("#codeExplanation");

  document.querySelectorAll(".step-list li").forEach((item) => {
    item.querySelector("button").addEventListener("click", () => {
      document.querySelectorAll(".step-list li").forEach((step) => {
        step.classList.toggle("is-active", step === item);
      });
      const selected = codeSteps[item.dataset.step];
      filename.textContent = selected.filename;
      code.innerHTML = selected.code;
      explanation.innerHTML = `<strong>${selected.title}</strong><p>${selected.text}</p>`;
    });
  });

  document.querySelector(".copy-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select code";
    }
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1500);
  });
}

setupHeroCanvas();
setupControlSurface();
setupLens();
setupStack();
setupWalkthrough();
