"""Render e-Aadhaar PDF pages as PNG previews (front + back)."""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)


def render_pdf_front_back(pdf_path: Path, *, dpi: int = 150) -> tuple[bytes, bytes] | None:
    """Return (front_png, back_png) bytes from an unlocked PDF, or None on failure."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        log.warning("PyMuPDF not installed — PDF preview skipped")
        return None

    path = Path(pdf_path)
    if not path.is_file():
        return None

    try:
        doc = fitz.open(str(path))
        if doc.page_count < 1:
            doc.close()
            return None

        zoom = max(72, dpi) / 72.0
        mat = fitz.Matrix(zoom, zoom)

        front_page = doc.load_page(0)
        front_png = front_page.get_pixmap(matrix=mat, alpha=False).tobytes("png")

        if doc.page_count >= 2:
            back_page = doc.load_page(1)
            back_png = back_page.get_pixmap(matrix=mat, alpha=False).tobytes("png")
        else:
            back_png = front_png

        doc.close()
        return front_png, back_png
    except Exception as exc:
        log.warning("PDF preview render failed: %s", exc)
        return None
