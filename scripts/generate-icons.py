"""Regenerate the PNG app icons from src/assets/icons/icon.svg.

Usage:   npm run icons
Needs:   pip install playwright && playwright install chromium
Writes:  icon-192.png, icon-512.png (transparent corners), icon-maskable-512.png and apple-touch-icon.png
         (full-bleed black background with the artwork inside the safe zone).
"""
import base64
import pathlib

from playwright.sync_api import sync_playwright

ICONS = pathlib.Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"
SVG = (ICONS / "icon.svg").read_bytes()
DATA_URI = "data:image/svg+xml;base64," + base64.b64encode(SVG).decode()
BACKGROUND = "#000000"


def page_for(size: int, artwork: float, background: str) -> str:
    inner = round(size * artwork)
    return (
        f"<html><body style='margin:0;background:{background}'>"
        f"<div style='width:{size}px;height:{size}px;display:grid;place-items:center'>"
        f"<img src='{DATA_URI}' width='{inner}' height='{inner}'></div></body></html>"
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    jobs = [
        ("icon-192.png", 192, 1.0, "transparent"),
        ("icon-512.png", 512, 1.0, "transparent"),
        ("icon-maskable-512.png", 512, 0.8, BACKGROUND),
        ("apple-touch-icon.png", 180, 0.86, BACKGROUND),
    ]
    for name, size, artwork, background in jobs:
        page = browser.new_page(viewport={"width": size, "height": size})
        page.set_content(page_for(size, artwork, background))
        page.screenshot(path=str(ICONS / name), omit_background=(background == "transparent"))
        page.close()
    browser.close()

print(f"Wrote {len(jobs)} icons to {ICONS}")
