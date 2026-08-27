"""Progression pondérée multi-étapes pour les imports OSM."""
from __future__ import annotations

from pathlib import Path

STAGE_RANGE: dict[str, tuple[float, float]] = {
    'download': (0, 15),
    'filter': (15, 70),
    'import': (70, 88),
    'clean': (88, 90),
    'validate': (90, 96),
    'publish': (96, 100),
}

PIPELINE_FILES_TOTAL = 6


PBF_OBJECTS_PER_MB = 135_000


def stage_progress(stage: str, local_pct: float) -> float:
    low, high = STAGE_RANGE.get(stage, (0, 100))
    local_pct = max(0.0, min(100.0, local_pct))
    return round(low + (high - low) * (local_pct / 100.0), 1)


def display_progress_pct(progress_pct: float, status: str) -> float:
    """Jamais 100 % tant que le job n'est pas terminé."""
    pct = progress_pct or 0
    if status in ('queued', 'running', 'paused') and pct >= 100:
        return 99.0
    return round(pct, 1)


def estimate_pbf_objects(pbf_path: Path) -> int:
    size_mb = pbf_path.stat().st_size / (1024 * 1024)
    return max(int(size_mb * PBF_OBJECTS_PER_MB), 2_000_000)


def progress_display(stage: str, *, bytes_done: int, bytes_total: int, items_done: int, items_total: int) -> dict:
    if stage == 'download' and bytes_total > 0:
        done_mb = round(bytes_done / (1024 * 1024), 1)
        total_mb = round(bytes_total / (1024 * 1024), 1)
        return {
            'unit': 'bytes',
            'done_label': str(done_mb),
            'total_label': str(total_mb),
            'quantity_label': 'Téléchargement',
        }
    if stage in ('filter', 'import', 'clean') and items_total > 0:
        return {
            'unit': 'entities',
            'done_label': f'{items_done:,}'.replace(',', ' '),
            'total_label': f'{items_total:,}'.replace(',', ' '),
            'quantity_label': 'Entités' if stage == 'filter' else 'Traitement',
        }
    if stage in ('validate', 'publish'):
        return {
            'unit': 'step',
            'done_label': '—',
            'total_label': '—',
            'quantity_label': 'Finalisation',
        }
    return {
        'unit': 'none',
        'done_label': '—',
        'total_label': '—',
        'quantity_label': 'En cours',
    }
