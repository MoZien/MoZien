"""Packs the extension into a zip (what users download, and what the Chrome Web Store takes).

    python extension/pack.py frontend/dist/autohalle-helfer.zip
"""

import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
FILES = ["manifest.json", "background.js", "bridge.js", "button.js", "icon-16.png", "icon-48.png", "icon-128.png"]


def pack(target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(HERE / name, f"autohalle-helfer/{name}")
    return target


if __name__ == "__main__":
    print(pack(Path(sys.argv[1] if len(sys.argv) > 1 else "autohalle-helfer.zip")))
