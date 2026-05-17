# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "playwright>=1.40.0",
# ]
# ///
"""
Screenshot an HTML file to PNG using Playwright.

Usage:
    uv run --script scripts/screenshot.py <html_file> <output_png> [--width 1080] [--height 1440] [--scale 2]

First run prompts to install the Chromium browser:
    uv run --script scripts/screenshot.py --install
"""

import argparse
import asyncio
import subprocess
import sys
from pathlib import Path


async def screenshot(html_path: str, output_path: str, width: int, height: int, scale: int):
    from playwright.async_api import async_playwright

    html_abs = Path(html_path).resolve()
    if not html_abs.exists():
        raise FileNotFoundError(f"HTML file not found: {html_abs}")

    output_abs = Path(output_path).resolve()
    output_abs.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch()
        except Exception as e:
            print(
                "Chromium not installed. Run: uv run --script scripts/screenshot.py --install",
                file=sys.stderr,
            )
            raise
        page = await browser.new_page(
            viewport={"width": width, "height": height},
            device_scale_factor=scale,
        )
        await page.goto(f"file://{html_abs}")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_function("document.fonts.ready.then(() => true)")
        await page.screenshot(path=str(output_abs), full_page=False)
        await browser.close()

    print(f"Done → {output_abs} ({width}x{height} @{scale}x)")


def install_browser():
    print("Installing Chromium for Playwright...")
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        capture_output=False,
    )
    sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="Screenshot HTML to PNG")
    parser.add_argument("html_file", nargs="?", help="Path to HTML file")
    parser.add_argument("output_png", nargs="?", help="Output PNG path")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1440)
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--install", action="store_true", help="Install the Chromium browser")
    args = parser.parse_args()

    if args.install:
        install_browser()
        return

    if not args.html_file or not args.output_png:
        parser.error("html_file and output_png are required (or pass --install)")

    asyncio.run(screenshot(args.html_file, args.output_png, args.width, args.height, args.scale))


if __name__ == "__main__":
    main()
