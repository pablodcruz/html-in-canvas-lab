const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const capabilities = {
  drawElementImage:
    "CanvasRenderingContext2D" in window &&
    "drawElementImage" in CanvasRenderingContext2D.prototype,
  texElementImage2D:
    "WebGLRenderingContext" in window &&
    "texElementImage2D" in WebGLRenderingContext.prototype,
  copyElementImageToTexture:
    "gpu" in navigator &&
    "GPUQueue" in window &&
    "copyElementImageToTexture" in GPUQueue.prototype,
  captureElementImage:
    "HTMLCanvasElement" in window &&
    "captureElementImage" in HTMLCanvasElement.prototype &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype,
  requestPaint:
    "HTMLCanvasElement" in window &&
    "requestPaint" in HTMLCanvasElement.prototype,
};

function updateCapabilityUI() {
  const entries = Object.entries(capabilities);
  const nativeCount = entries.filter(([, value]) => value).length;
  document.querySelector("#nativeCount").textContent = `${nativeCount} / ${entries.length}`;
  document.querySelector("#runtimeMode").textContent =
    nativeCount > 0 ? "Experimental APIs detected" : "Compatibility runtime";
  document.querySelector("#runtimeLight").classList.toggle("is-fallback", nativeCount === 0);

  document.querySelectorAll("[data-capability]").forEach((badge) => {
    const available = capabilities[badge.dataset.capability];
    badge.textContent = available
      ? badge.dataset.nativeLabel || "Native path"
      : badge.dataset.fallbackLabel || "Fallback active";
    badge.classList.toggle("status-native", available);
    badge.classList.toggle("status-fallback", !available);
  });
}

function setupFilters() {
  const buttons = document.querySelectorAll(".filter-button");
  const cards = document.querySelectorAll(".lab-card");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      cards.forEach((card) => {
        const show = button.dataset.filter === "all" || card.dataset.category === button.dataset.filter;
        card.classList.toggle("is-hidden", !show);
      });
    });
  });
}

function setupNative2D() {
  const canvas = document.querySelector("#atlas2dCanvas");
  const source = document.querySelector("#atlas2dSource");
  const fallback = document.querySelector("#atlas2dFallback");
  const path = document.querySelector("#atlas2dPath");
  const inputs = [document.querySelector("#atlas2dRange"), document.querySelector("#atlas2dFallbackRange")];

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      inputs.forEach((peer) => {
        peer.value = input.value;
        peer.style.setProperty("--range", `${input.value}%`);
        peer.nextElementSibling.value = `${input.value}%`;
      });
      canvas.requestPaint?.();
    });
  });

  if (!capabilities.drawElementImage) return;
  fallback.hidden = true;
  canvas.style.display = "block";
  path.textContent = "Native drawElementImage path";
  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.requestPaint?.();
  }

  canvas.onpaint = () => {
    ctx.reset();
    const dpr = canvas.width / Math.max(canvas.clientWidth, 1);
    ctx.scale(dpr, dpr);
    try {
      const transform = ctx.drawElementImage(source, 32, 24);
      if (transform) source.style.transform = transform.toString();
    } catch (error) {
      path.textContent = `Native snapshot pending · ${error.name}`;
    }
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
  }
  return shader;
}

function setupWebGL() {
  const canvas = document.querySelector("#webglCanvas");
  const source = document.querySelector("#webglSource");
  const overlay = canvas.nextElementSibling;
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
  if (!gl) {
    overlay.querySelector("small").textContent = "WebGL unavailable · static DOM";
    return;
  }

  const vertexSource = `
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    uniform float time;
    void main() {
      vUv = uv;
      float wave = sin(position.y * 3.0 + time) * 0.09;
      gl_Position = vec4(position.x * 0.82 + wave, position.y * 0.72, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D tex;
    void main() {
      vec4 color = texture2D(tex, vUv);
      float edge = smoothstep(0.0, .08, vUv.x) * smoothstep(1.0, .92, vUv.x);
      gl_FragColor = vec4(color.rgb * (0.78 + edge * .22), 1.0);
    }
  `;

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    overlay.querySelector("small").textContent = "Shader setup failed";
    return;
  }

  const vertices = new Float32Array([
    -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0,
    -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0,
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "position");
  const uv = gl.getAttribLocation(program, "uv");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fallbackTexture = document.createElement("canvas");
  fallbackTexture.width = 512;
  fallbackTexture.height = 280;
  const textureContext = fallbackTexture.getContext("2d");
  textureContext.fillStyle = "#c8ff3d";
  textureContext.fillRect(0, 0, 512, 280);
  textureContext.fillStyle = "#090a0f";
  textureContext.font = "700 66px system-ui";
  textureContext.fillText("WEB / GL", 52, 150);
  textureContext.font = "16px monospace";
  textureContext.fillText("GENERATED FALLBACK TEXTURE", 55, 190);

  function uploadTexture() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (capabilities.texElementImage2D) {
      try {
        gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA, source, {});
        overlay.hidden = true;
        const matrix = canvas.getElementTransform?.(source, new DOMMatrix());
        if (matrix) source.style.transform = matrix.toString();
        return;
      } catch {
        // The API is experimental; fall through to the stable texture source.
      }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackTexture);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(time = 0) {
    uploadTexture();
    gl.clearColor(0.04, 0.045, 0.065, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(gl.getUniformLocation(program, "time"), time * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!prefersReducedMotion) requestAnimationFrame(render);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  render();
}

async function setupWebGPU() {
  const canvas = document.querySelector("#webgpuCanvas");
  const source = document.querySelector("#webgpuSource");
  const overlay = canvas.nextElementSibling;
  const path = document.querySelector("#webgpuPath");

  if (!capabilities.copyElementImageToTexture) {
    drawWebGPUFallback(canvas);
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPU adapter");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    context.configure({ device, format, alphaMode: "opaque" });

    const texture = device.createTexture({
      size: [260, 140],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var tex: texture_2d<f32>;
        @group(0) @binding(1) var samp: sampler;
        struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
        @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
          var positions = array<vec2f, 6>(
            vec2f(-.82,-.7), vec2f(.82,-.7), vec2f(-.82,.7),
            vec2f(-.82,.7), vec2f(.82,-.7), vec2f(.82,.7)
          );
          var uvs = array<vec2f, 6>(
            vec2f(0,1), vec2f(1,1), vec2f(0,0),
            vec2f(0,0), vec2f(1,1), vec2f(1,0)
          );
          var out: Out;
          out.position = vec4f(positions[i], 0, 1);
          out.uv = uvs[i];
          return out;
        }
        @fragment fn fs(in: Out) -> @location(0) vec4f {
          return textureSample(tex, samp, in.uv);
        }
      `,
    });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
    });

    canvas.onpaint = () => {
      device.queue.copyElementImageToTexture(
        { source },
        { destination: { texture }, width: 260, height: 140 },
      );
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.04, g: 0.045, b: 0.065, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
      device.queue.submit([encoder.finish()]);
    };
    overlay.hidden = true;
    path.textContent = "Native WebGPU DOM texture";
    canvas.requestPaint?.();
  } catch (error) {
    path.textContent = `WebGPU fallback · ${error.message}`;
    drawWebGPUFallback(canvas);
  }
}

function drawWebGPUFallback(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let frame;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw(time = 0) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.fillStyle = "#0d0f15";
    ctx.fillRect(0, 0, width, height);
    for (let x = -height; x < width + height; x += 28) {
      ctx.fillStyle = x % 56 === 0 ? "rgba(140,124,255,.25)" : "rgba(200,255,61,.1)";
      ctx.save();
      ctx.translate(x + (time * 0.02) % 56, 0);
      ctx.rotate(-0.35);
      ctx.fillRect(0, -80, 12, height + 160);
      ctx.restore();
    }
    if (!prefersReducedMotion) frame = requestAnimationFrame(draw);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  draw();
  return () => cancelAnimationFrame(frame);
}

function workerSignalValue(x, frame) {
  return Math.sin(x * 19 + frame * 0.13) * 0.31 + Math.sin(x * 6.4) * 0.13;
}

function drawWorkerSignal(ctx, frame) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#0b111d";
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    ctx.strokeStyle = i === 6 ? "#4a5e7d" : "#233149";
    const x = width * i / 12;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    ctx.strokeStyle = i === 2 ? "#4a5e7d" : "#233149";
    const y = height * i / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#a9e1ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 4) {
    const y = height * (0.5 - workerSignalValue(x / width, frame) * 0.5);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function createWorkerSignalRunner(draw, report, initialFrame = 0) {
  let timer = null;
  let frame = initialFrame;
  function redraw() {
    draw(frame);
    report(frame);
  }
  function setPlaying(playing) {
    if (!playing) {
      clearInterval(timer);
      timer = null;
      redraw();
    } else if (timer === null) {
      timer = setInterval(() => {
        draw(++frame);
        if (frame % 4 === 0) report(frame);
      }, 32);
    }
  }
  return {
    redraw,
    setPlaying,
    step() {
      if (timer !== null) return;
      frame++;
      redraw();
    },
  };
}

function setupWorker() {
  let canvas = document.querySelector("#workerCanvas");
  const frameOutput = document.querySelector("#workerFrames");
  const sampleOutput = document.querySelector("#workerSample");
  const path = document.querySelector("#workerPath");
  const motion = document.querySelector("#workerMotion");
  const play = document.querySelector("#workerPlay");
  const step = document.querySelector("#workerStep");
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let playing = !preference.matches;
  let frame = 0;
  let renderer;
  let worker;

  function report(nextFrame) {
    frame = nextFrame;
    frameOutput.value = `Frame ${String(frame).padStart(3, "0")}`;
    sampleOutput.value = `Center sample ${workerSignalValue(0.5, frame).toFixed(2)}`;
  }

  function updateMotion() {
    play.textContent = playing ? "Pause animation" : "Play animation";
    step.disabled = playing;
    motion.textContent = playing ? "Running" : preference.matches ? "Paused · reduced motion" : "Paused";
  }

  function changePlaying(next) {
    playing = next;
    renderer.setPlaying(playing);
    updateMotion();
  }

  function fallback(transferred) {
    if (worker) worker.terminate();
    if (transferred) {
      const replacement = canvas.cloneNode(true);
      canvas.replaceWith(replacement);
      canvas = replacement;
    }
    canvas.onpaint = null;
    const ctx = canvas.getContext("2d");
    canvas.dataset.workerPath = ctx ? "main-thread-fallback" : "text-fallback";
    path.textContent = ctx ? "Main thread · generated signal" : "Text-only signal";
    if (!ctx) canvas.hidden = true;
    renderer = createWorkerSignalRunner((index) => {
      if (ctx) drawWorkerSignal(ctx, index);
    }, report, frame);
    renderer.redraw();
    renderer.setPlaying(playing);
  }

  if (typeof canvas.transferControlToOffscreen !== "function" || typeof Worker !== "function") {
    fallback(false);
  } else {
    let transferred = false;
    const workerCode = `
      ${workerSignalValue.toString()}
      ${drawWorkerSignal.toString()}
      ${createWorkerSignalRunner.toString()}
      let runner, ctx, snapshot;
      self.onmessage = ({data}) => {
        if (data.canvas) {
          ctx = data.canvas.getContext("2d");
          if (!ctx) throw new Error("No worker 2D canvas context");
          runner = createWorkerSignalRunner((frame) => {
            drawWorkerSignal(ctx, frame);
            if (snapshot) {
              try {
                ctx.drawElementImage(snapshot, 18, 15);
              } catch {
                snapshot.close?.();
                snapshot = null;
                self.postMessage({ captured: false });
              }
            }
          }, (frame) => self.postMessage({ frame }));
          runner.redraw();
          runner.setPlaying(data.playing);
        } else if (data.elementImage) {
          snapshot?.close?.();
          snapshot = typeof ctx?.drawElementImage === "function" ? data.elementImage : null;
          if (!snapshot) data.elementImage.close?.();
          runner.redraw();
          self.postMessage({ captured: !!snapshot });
        } else if (data.step) {
          runner.step();
        } else if ("playing" in data) {
          runner.setPlaying(data.playing);
        }
      };
    `;

    try {
      const url = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
      try {
        worker = new Worker(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const offscreen = canvas.transferControlToOffscreen();
      transferred = true;
      canvas.dataset.workerPath = "offscreen";
      path.textContent = "Worker · generated signal";
      renderer = {
        setPlaying: (value) => worker.postMessage({ playing: value }),
        step: () => worker.postMessage({ step: true }),
      };
      worker.addEventListener("error", () => fallback(transferred), { once: true });
      worker.addEventListener("message", ({ data }) => {
        if (canvas.dataset.workerPath !== "offscreen") return;
        if ("frame" in data) report(data.frame);
        if ("captured" in data) {
          path.textContent = data.captured ? "Worker · DOM snapshot" : "Worker · generated signal";
        }
      });
      worker.postMessage({ canvas: offscreen, playing }, [offscreen]);

      if (capabilities.captureElementImage) {
        const source = document.querySelector("#workerSource");
        canvas.onpaint = () => {
          let image;
          try {
            image = canvas.captureElementImage(source);
            worker.postMessage({ elementImage: image }, [image]);
          } catch {
            image?.close?.();
            // The generated waveform stays usable when capture is unavailable.
          }
        };
        canvas.requestPaint?.();
      }
    } catch {
      fallback(transferred);
    }
  }

  play.addEventListener("click", () => changePlaying(!playing));
  step.addEventListener("click", () => renderer.step());
  preference.addEventListener("change", () => {
    if (preference.matches) changePlaying(false);
    else updateMotion();
  });
  updateMotion();
}

function setupPaintLifecycle() {
  const canvas = document.querySelector("#paintCanvas");
  const source = document.querySelector("#paintSource");
  const count = document.querySelector("#paintCount");
  const changed = document.querySelector("#changedElements");
  let paints = 0;
  let mutations = 0;

  if (capabilities.requestPaint) {
    canvas.onpaint = (event) => {
      paints++;
      count.textContent = paints;
      const ids = [...(event.changedElements || [])].map((element) => `#${element.id || element.tagName.toLowerCase()}`);
      changed.value = ids.length ? `changedElements: ${ids.join(", ")}` : "Explicit requestPaint()";
    };
  }

  document.querySelector("#requestPaintButton").addEventListener("click", () => {
    mutations++;
    source.textContent = `seed-${mutations}`;
    if (capabilities.requestPaint) {
      canvas.requestPaint();
    } else {
      paints++;
      count.textContent = paints;
      changed.value = `Fallback invalidation: #paintSource → seed-${mutations}`;
    }
  });
}

function setupTransformDemo() {
  const card = document.querySelector("#transformCard");
  const control = document.querySelector("#rotationControl");
  const hitCount = document.querySelector("#hitCount");
  let hits = 0;

  function render() {
    const rotation = Number(control.value);
    card.style.transform = `rotateY(${rotation}deg) rotateX(${-rotation * 0.45}deg) translateZ(16px)`;
  }

  control.addEventListener("input", render);
  document.querySelector("#hitTarget").addEventListener("click", () => {
    hits++;
    hitCount.textContent = hits;
  });
  render();
}

function setupHiDPI() {
  const wrap = document.querySelector("#hidpiWrap");
  const canvas = document.querySelector("#hidpiCanvas");
  const control = document.querySelector("#hidpiSize");
  const output = document.querySelector("#hidpiReadout");
  const ctx = canvas.getContext("2d");

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "rgba(200,255,61,.36)";
    ctx.lineWidth = 1;
    for (let x = 0.5; x < rect.width; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
    }
    for (let y = 0.5; y < rect.height; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
    }
    ctx.fillStyle = "#f1f0e9";
    ctx.font = "10px monospace";
    ctx.fillText("CSS PX → DEVICE PX", 14, 23);
    output.value = `${Math.round(rect.width)}×${Math.round(rect.height)} CSS · ${canvas.width}×${canvas.height} grid · DPR ${dpr}`;
  }

  control.addEventListener("input", () => {
    wrap.style.width = `${control.value}%`;
  });
  new ResizeObserver(draw).observe(wrap);
  draw();
}

function setupFallbackToggle() {
  const preview = document.querySelector("#fallbackPreview");
  document.querySelectorAll("[data-fallback-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-fallback-mode]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      preview.classList.toggle("is-plain", button.dataset.fallbackMode === "plain");
    });
  });
}

const languageContent = {
  en: {
    label: "LAYOUT ENGINE / EN",
    html: "Interfaces keep their <em>language</em>, rhythm, and meaning.",
    direction: "ltr",
  },
  ar: {
    label: "محرك التخطيط / AR",
    html: "تحتفظ الواجهات <em>بلغتها</em> وإيقاعها ومعناها.",
    direction: "rtl",
  },
  ja: {
    label: "レイアウト / JA",
    html: "インターフェースは<em>言語</em>と意味を保ちます。",
    direction: "ltr",
  },
};

function setupLanguageDemo() {
  const surface = document.querySelector("#languageSurface");
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => {
      const language = button.dataset.language;
      const content = languageContent[language];
      document.querySelectorAll("[data-language]").forEach((item) => item.classList.toggle("is-active", item === button));
      surface.lang = language;
      surface.dir = content.direction;
      surface.classList.toggle("is-vertical", language === "ja");
      surface.querySelector("small").textContent = content.label;
      surface.querySelector("p").innerHTML = content.html;
      surface.closest("canvas")?.requestPaint?.();
    });
  });
}

function setupForm() {
  document.querySelector("#nativeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = document.querySelector("#formResult");
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    result.value = `${data.get("pilot")} cleared as ${data.get("role")}`;
  });
}

function setupClipboard() {
  const phrase = document.querySelector("#selectablePhrase");
  const result = document.querySelector("#clipboardResult");
  let contexts = 0;

  document.querySelector("#copyPhrase").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(phrase.textContent);
      result.value = "Copied to the native clipboard";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(phrase);
      selection.removeAllRanges();
      selection.addRange(range);
      result.value = "Phrase selected · press Ctrl/Cmd+C";
    }
  });

  phrase.addEventListener("contextmenu", () => {
    contexts++;
    document.querySelector("#contextCount").textContent = `${contexts} context menu${contexts === 1 ? "" : "s"}`;
  });

  document.querySelector("#pasteTarget").addEventListener("input", (event) => {
    if (event.currentTarget.value.includes("Pixels are temporary")) result.value = "Copy/paste loop complete";
  });
}

function setupAccessibility() {
  const button = document.querySelector("#a11yToggle");
  button.addEventListener("click", () => {
    const active = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(active));
    document.querySelector("#pressedState").textContent = `pressed: ${active}`;
    document.querySelector("#a11yLive").textContent = `Telemetry ${active ? "enabled" : "disabled"}`;
  });
}

function setupFind() {
  document.querySelector("#copyBeacon").addEventListener("click", async () => {
    const beacon = document.querySelector("#findBeacon").textContent;
    try {
      await navigator.clipboard.writeText(beacon);
      document.querySelector("#findResult").value = "Copied · press Ctrl/Cmd+F and paste";
    } catch {
      document.querySelector("#findResult").value = `Search manually for ${beacon}`;
    }
  });
}

function setupIndexing() {
  document.querySelector("#inspectSemantics").addEventListener("click", () => {
    const target = document.querySelector("#crawlTarget");
    const structured = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    const payload = {
      heading: target.querySelector("h4").textContent,
      description: target.querySelector("p").textContent,
      link: target.querySelector("a").getAttribute("href"),
      structuredType: structured["@type"],
    };
    document.querySelector("#crawlerOutput").textContent = JSON.stringify(payload, null, 2);
  });
}

function setupExtensionMutation() {
  const target = document.querySelector("#extensionTarget");
  const output = document.querySelector("#mutationCount");
  let mutations = 0;
  let translated = false;
  const observer = new MutationObserver(() => {
    mutations++;
    output.value = `${mutations} mutation${mutations === 1 ? "" : "s"} observed · texture invalidated`;
    target.closest("canvas")?.requestPaint?.();
  });
  observer.observe(target, { subtree: true, characterData: true, childList: true });

  document.querySelector("#extensionMutation").addEventListener("click", () => {
    translated = !translated;
    target.querySelector("strong").textContent = translated ? "Hola, interfaz." : "Hello, interface.";
  });
}

function setupDevTools() {
  const target = document.querySelector("#devtoolsTarget");
  const colors = ["#c8ff3d", "#8c7cff", "#ff6f5e"];
  let index = 0;

  document.querySelector("#cycleDevtoolsStyle").addEventListener("click", () => {
    index = (index + 1) % colors.length;
    target.style.setProperty("--inspect-accent", colors[index]);
    const computed = getComputedStyle(target).getPropertyValue("--inspect-accent").trim();
    document.querySelector("#computedStyle").value = `--inspect-accent: ${computed}`;
    target.closest("canvas")?.requestPaint?.();
  });
}

function enhanceBrowserLabsWithNativeCanvas() {
  if (!capabilities.drawElementImage) return;
  document.querySelectorAll('.lab-card[data-category="browser"] .lab-demo').forEach((demo) => {
    const rect = demo.getBoundingClientRect();
    const source = document.createElement("div");
    source.className = `browser-native-source ${[...demo.classList].filter((name) => name !== "lab-demo").join(" ")}`;
    while (demo.firstChild) source.appendChild(demo.firstChild);

    const canvas = document.createElement("canvas");
    canvas.className = "native-browser-canvas";
    canvas.setAttribute("layoutsubtree", "");
    canvas.appendChild(source);
    demo.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    function resize() {
      const nextRect = demo.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(nextRect.width * dpr);
      canvas.height = Math.round(nextRect.height * dpr);
      source.style.width = `${nextRect.width}px`;
      source.style.height = `${nextRect.height}px`;
      canvas.requestPaint?.();
    }

    canvas.onpaint = () => {
      ctx.reset();
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1);
      ctx.scale(dpr, dpr);
      try {
        const matrix = ctx.drawElementImage(source, 0, 0);
        if (matrix) source.style.transform = matrix.toString();
      } catch {
        // Initial snapshots can lag one rendering update.
      }
    };
    new ResizeObserver(resize).observe(demo);
    resize();
    demo.dataset.nativeCanvas = "true";
  });
}

updateCapabilityUI();
setupFilters();
setupNative2D();
setupWebGL();
setupWebGPU();
setupWorker();
setupPaintLifecycle();
setupTransformDemo();
setupHiDPI();
setupFallbackToggle();
setupLanguageDemo();
setupForm();
setupClipboard();
setupAccessibility();
setupFind();
setupIndexing();
setupExtensionMutation();
setupDevTools();
enhanceBrowserLabsWithNativeCanvas();

async function runSmokeTests() {
  const results = [];
  const assert = (name, condition) => {
    results.push({ name, passed: Boolean(condition) });
  };
  const fireInput = (element) => element.dispatchEvent(new Event("input", { bubbles: true }));

  assert("sixteen labs", document.querySelectorAll(".lab-card").length === 16);

  document.querySelector('[data-filter="rendering"]').click();
  assert(
    "rendering filter",
    document.querySelectorAll('.lab-card[data-category="rendering"]:not(.is-hidden)').length === 5,
  );
  document.querySelector('[data-filter="all"]').click();

  document.querySelector("#requestPaintButton").click();
  assert("paint lifecycle", Number(document.querySelector("#paintCount").textContent) >= 1);

  const rotation = document.querySelector("#rotationControl");
  rotation.value = "-10";
  fireInput(rotation);
  assert("transform control", document.querySelector("#transformCard").style.transform.includes("-10deg"));

  assert("high DPI readout", document.querySelector("#hidpiReadout").value.includes("DPR"));

  document.querySelector('[data-fallback-mode="plain"]').click();
  assert("forced fallback", document.querySelector("#fallbackPreview").classList.contains("is-plain"));
  document.querySelector('[data-fallback-mode="enhanced"]').click();

  document.querySelector('[data-language="ar"]').click();
  assert("RTL text", document.querySelector("#languageSurface").dir === "rtl");
  document.querySelector('[data-language="en"]').click();

  document.querySelector("#pilotName").value = "Nova";
  document.querySelector("#nativeForm").requestSubmit();
  assert("native form", document.querySelector("#formResult").value.includes("Nova"));

  const paste = document.querySelector("#pasteTarget");
  paste.value = "Pixels are temporary. Meaning survives.";
  fireInput(paste);
  assert("copy paste loop", document.querySelector("#clipboardResult").value.includes("complete"));

  document.querySelector("#a11yToggle").click();
  assert("accessible state", document.querySelector("#a11yToggle").getAttribute("aria-pressed") === "true");

  document.querySelector("#inspectSemantics").click();
  assert("crawler extraction", document.querySelector("#crawlerOutput").textContent.includes("TechArticle"));

  document.querySelector("#extensionMutation").click();
  assert("extension mutation", document.querySelector("#extensionTarget strong").textContent.includes("Hola"));

  document.querySelector("#cycleDevtoolsStyle").click();
  assert("DevTools custom property", document.querySelector("#computedStyle").value.includes("#8c7cff"));

  assert("WebGL initialized", document.querySelector("#webglCanvas").width > 0);
  assert("WebGPU or fallback initialized", document.querySelector("#webgpuCanvas").width > 0);

  await new Promise((resolve) => window.setTimeout(resolve, 800));
  assert("worker initialized", Boolean(document.querySelector("#workerCanvas").dataset.workerPath));

  const failures = results.filter((result) => !result.passed);
  document.documentElement.dataset.smoke = failures.length ? "failed" : "passed";
  document.documentElement.dataset.smokeResults = `${results.length - failures.length}/${results.length}`;
  document.documentElement.dataset.smokeFailures = failures.map((failure) => failure.name).join(",");
}

if (new URLSearchParams(window.location.search).has("smoke")) {
  runSmokeTests();
}
