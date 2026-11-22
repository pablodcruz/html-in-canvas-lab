"""Verify the Atlas smoke assertion in native and fallback Chromium modes."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


root = Path(__file__).resolve().parents[1]
chromium = os.environ.get("LAB_CHROMIUM")
failures = []
with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    with sync_playwright() as playwright:
        for native in (False, True):
            feature_mode = "enable" if native else "disable"
            browser = playwright.chromium.launch(
                executable_path=chromium,
                args=[f"--{feature_mode}-blink-features=CanvasDrawElement"],
            )
            for width in (1440, 390, 320):
                for block_click in (False, True):
                    with browser.new_context(
                        viewport={"width": width, "height": 920}, reduced_motion="reduce"
                    ) as context:
                        context.route("**/*", lambda r: (
                            r.continue_() if r.request.url.startswith(url + "/") else r.abort()
                        ))
                        if block_click:
                            context.add_init_script("""
                                document.addEventListener("click", (event) => {
                                  if (event.target.id === "requestPaintButton") {
                                    event.stopImmediatePropagation();
                                  }
                                }, true);
                            """)
                        page = context.new_page()
                        page.goto(url + "/features.html?smoke")
                        page.wait_for_selector("html[data-smoke]")
                        available = page.evaluate("typeof HTMLCanvasElement.prototype.requestPaint === 'function'")
                        html = page.locator("html")
                        passed = html.get_attribute("data-smoke")
                        results = html.get_attribute("data-smoke-results")
                        names = html.get_attribute("data-smoke-failures")
                        expected = ("failed", "15/16", "paint lifecycle") if block_click else ("passed", "16/16", "")
                        ok = available == native and (passed, results, names) == expected
                        label = f"{browser.version} {feature_mode} width={width} blocked={block_click}"
                        print(f"{label}: {results} {names or '-'} {'PASS' if ok else 'FAIL'}", flush=True)
                        if not ok:
                            failures.append(label)
            browser.close()

assert not failures, failures
