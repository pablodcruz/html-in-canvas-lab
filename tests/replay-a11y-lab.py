"""Replay the accessibility card in real Chromium, on both rendering paths."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread
from playwright.sync_api import expect, sync_playwright

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

root = Path(__file__).resolve().parents[1]
with ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=root)) as server, sync_playwright() as p:
    Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    failures = []
    for native in (False, True):
        flag = "enable" if native else "disable"
        browser = p.chromium.launch(
            executable_path=os.getenv("LAB_CHROMIUM") or None,
            args=[f"--{flag}-blink-features=CanvasDrawElement"],
        )
        for width in (1440, 390, 320):
            page = browser.new_page(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(url+"/") else route.abort())
            page.goto(url + "/features.html#lab-a11y")
            lab = page.locator("#lab-a11y")
            button = lab.locator("#a11yToggle")
            try:
                assert page.evaluate("typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function'") == native
                assert lab.locator(".native-browser-canvas").count() == int(native)
                snapshot = button.aria_snapshot()
                print(f"{flag}/{width} accessibility tree: {snapshot.splitlines()[0]}", flush=True)
                expect(button).to_have_accessible_name("Telemetry", timeout=500)
                expect(button).to_have_accessible_description("Toggle live telemetry feed", timeout=500)
                expect(lab.get_by_text("name: “Telemetry”", exact=True)).to_be_visible()
                expect(lab.get_by_text("description: “Toggle live telemetry feed”", exact=True)).to_be_visible()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.locator("#pasteTarget").focus()
                page.keyboard.press("Tab")
                expect(button).to_be_focused()
                assert button.evaluate("(el) => getComputedStyle(el).outlineStyle !== 'none'")
                for key, pressed, message in (("Space", "true", "Telemetry enabled"), ("Enter", "false", "Telemetry disabled")):
                    page.keyboard.press(key)
                    expect(button).to_have_attribute("aria-pressed", pressed)
                    expect(lab.locator("#pressedState")).to_have_text(f"pressed: {pressed}")
                    expect(lab.locator("#a11yLive")).to_have_text(message)
                    expect(button).to_have_accessible_name("Telemetry")
                    expect(button).to_be_focused()
                assert not errors, errors
                print(f"PASS {flag}/{width}: name, description, focus, state, no overflow", flush=True)
            except AssertionError as err:
                failures.append(f"{flag}/{width}: {str(err).splitlines()[0]}")
            finally:
                out = os.getenv("LAB_SCREENSHOTS")
                if out and width != 320:
                    lab.screenshot(path=Path(out) / f"{flag}-{width}.png", animations="disabled")
                page.close()
        browser.close()
    if failures:
        raise SystemExit("\n".join(failures))
