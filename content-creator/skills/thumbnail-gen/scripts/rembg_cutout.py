# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "rembg>=2.0.50",
#   "onnxruntime>=1.16.0",
# ]
# ///
"""
Remove background from a photo using rembg.

Usage:
    uv run --script scripts/rembg_cutout.py <input_photo> <output_path>

First run downloads the U^2-Net model (~170MB) to ~/.u2net/.
"""

import sys
from pathlib import Path


def main():
    if len(sys.argv) < 3:
        print("Usage: uv run --script scripts/rembg_cutout.py <input_photo> <output_path>")
        sys.exit(1)

    input_path = Path(sys.argv[1]).resolve()
    if not input_path.exists():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(sys.argv[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    from rembg import remove

    print(f"Removing background from {input_path.name}...", file=sys.stderr)
    output_path.write_bytes(remove(input_path.read_bytes()))
    print(f"Done → {output_path}")


if __name__ == "__main__":
    main()
