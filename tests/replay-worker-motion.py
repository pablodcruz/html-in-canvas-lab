"""Replay the Atlas worker chart with motion changed in either direction."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread
from time import monotonic

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


MOTION = "(prefers-reduced-motion: reduce)"
STATIC = "Static · reduced motion"
TIMEOUT = 5_000
OFFSCREEN = "'transferControlToOffscreen' in HTMLCanvasElement.prototype"


def await_static(page):
    page.wait_for_function(
        "([query, label]) => matchMedia(query).matches && "
        "document.querySelector('#workerFrames').value === label",
        arg=[MOTION, STATIC],
        timeout=TIMEOUT,
    )


def screenshot(chart):
    return chart.screenshot(animations="disabled", timeout=TIMEOUT)


def await_pixels(chart, baseline, *, different):
    end = monotonic() + TIMEOUT / 1000
    while monotonic() < end:
        if (screenshot(chart) != baseline) == different:
            return
    expected = "differ from the static frame" if different else "return to the static frame"
    raise AssertionError(f"Chart pixels did not {expected}")


root = Path(__file__).resolve().parents[1]
with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get("LAB_CHROMIUM"),
            args=["--disable-blink-features=CanvasDrawElement"],
        )
        for fallback in (False, True):
            for width in (1440, 320):
                errors = []
                with browser.new_context(
                    viewport={"width": width, "height": 850},
                    locale="en-US",
                    reduced_motion="reduce",
                    service_workers="block",
                ) as context:
                    context.route(
                        "**/*",
                        lambda r: r.continue_() if r.request.url.startswith(origin + "/") else r.abort(),
                    )
                    if fallback:
                        context.add_init_script(
                            "delete HTMLCanvasElement.prototype.transferControlToOffscreen"
                        )
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(origin + "/features.html", wait_until="load")
                    path = "main-thread-fallback" if fallback else "offscreen"
                    chart = page.locator(f'#workerCanvas[data-worker-path="{path}"]')
                    assert page.evaluate(OFFSCREEN) is (not fallback), "Incorrect capability setup"
                    chart.wait_for(timeout=TIMEOUT)

                    await_static(page)
                    static = screenshot(chart)
                    # Cover many 32ms worker ticks, not just the immediate transition.
                    page.wait_for_timeout(350)
                    assert screenshot(chart) == static, "Static chart moved"

                    page.emulate_media(reduced_motion="no-preference")
                    page.wait_for_function(
                        """query => !matchMedia(query).matches &&
                            /^[0-9]+ frames$/.test(document.querySelector("#workerFrames").value) &&
                            parseInt(document.querySelector("#workerFrames").value, 10) >= 4""",
                        arg=MOTION,
                        timeout=TIMEOUT,
                    )
                    await_pixels(chart, static, different=True)

                    page.emulate_media(reduced_motion="reduce")
                    await_static(page)
                    await_pixels(chart, static, different=False)
                    page.wait_for_timeout(350)
                    assert screenshot(chart) == static, "Restored frame moved"
                    assert not errors, errors
                    print(f"{browser.version} {path} {width}px: static, animated, static PASS", flush=True)
        browser.close()
