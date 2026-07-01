#!/usr/bin/env python3
"""Generate TikZ figures for the VCBM 2026 abstract from real ABIDE data.

Outputs vector TikZ (no image libraries needed):
  conference/figures/graph-view.tex  - circular RSN graph for one subject/window
  conference/figures/overview.tex     - grid of correlation-matrix heatmaps (HC vs ASD)
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.abide_processing import (
    compute_correlation_matrices,
    filter_rsn_columns,
    get_rsn_labels,
    list_subject_files,
    parse_dr_file,
    windowed_correlation,
)
from app.rsn_constants import CorrelationMethod, CorrelationParams

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "ABIDE"
FIG_DIR = Path(__file__).parent.parent.parent / "conference" / "figures"

LABELS = get_rsn_labels(short=True)
N = len(LABELS)

# Diverging colormap endpoints matching the frontend (drawFrame.ts)
NEG = np.array([67, 56, 202])   # deep blue-purple  (r = -1)
MID = np.array([238, 238, 240])  # near-white         (r =  0)
POS = np.array([220, 38, 38])   # bright red         (r = +1)


def diverging_rgb(value: float, vmax: float = 1.0) -> tuple[int, int, int]:
    t = max(-1.0, min(1.0, value / vmax))
    if t >= 0:
        c = MID + (POS - MID) * t
    else:
        c = MID + (NEG - MID) * (-t)
    return tuple(int(round(x)) for x in c)


def pick_site_with_both():
    files = list_subject_files(DATA_DIR)
    by_site: dict[str, dict[str, list]] = {}
    for f in files:
        key = f"{f['version']}/{f['site']}"
        by_site.setdefault(key, {"HC": [], "ASD": []})[f["diagnosis"]].append(f)
    # Choose a site with a healthy number of both
    best = max(
        by_site.items(),
        key=lambda kv: min(len(kv[1]["HC"]), len(kv[1]["ASD"])),
    )
    return files, best[0], best[1]


def graph_view_tikz(matrix: np.ndarray, threshold: float = 0.35) -> str:
    R = 3.0
    pos = []
    for k in range(N):
        ang = 2 * np.pi * k / N - np.pi / 2
        pos.append((R * np.cos(ang), R * np.sin(ang)))

    lines = [r"\begin{tikzpicture}[scale=1]"]
    # edges first (under nodes)
    vmax = float(np.max(np.abs(matrix)))
    for i in range(N):
        for j in range(i + 1, N):
            w = matrix[i, j]
            if abs(w) < threshold:
                continue
            r, g, b = diverging_rgb(w, vmax)
            lw = 0.3 + 2.4 * (abs(w) / vmax)
            xi, yi = pos[i]
            xj, yj = pos[j]
            lines.append(
                f"  \\draw[line width={lw:.2f}pt, "
                f"color={{rgb,255:red,{r};green,{g};blue,{b}}}, opacity=0.85] "
                f"({xi:.3f},{yi:.3f}) -- ({xj:.3f},{yj:.3f});"
            )
    # nodes + labels
    for k in range(N):
        x, y = pos[k]
        lines.append(
            f"  \\filldraw[fill=black!78, draw=white, line width=0.6pt] "
            f"({x:.3f},{y:.3f}) circle (0.30);"
        )
        lx, ly = x * 1.42, y * 1.42
        lines.append(
            f"  \\node[font=\\scriptsize\\bfseries] at ({lx:.3f},{ly:.3f}) "
            f"{{{LABELS[k]}}};"
        )
    lines.append(r"\end{tikzpicture}")
    return "\n".join(lines)


def heatmap_tikz(matrix: np.ndarray, x0: float, y0: float, cell: float, vmax: float) -> list[str]:
    out = []
    for i in range(N):
        for j in range(N):
            r, g, b = diverging_rgb(matrix[i, j], vmax)
            x = x0 + j * cell
            y = y0 - i * cell
            out.append(
                f"  \\fill[fill={{rgb,255:red,{r};green,{g};blue,{b}}}] "
                f"({x:.3f},{y:.3f}) rectangle ({x + cell:.3f},{y - cell:.3f});"
            )
    out.append(
        f"  \\draw[black!40, line width=0.3pt] ({x0:.3f},{y0:.3f}) rectangle "
        f"({x0 + N * cell:.3f},{y0 - N * cell:.3f});"
    )
    return out


def main():
    files, site_key, groups = pick_site_with_both()
    print(f"Using site: {site_key} (HC={len(groups['HC'])}, ASD={len(groups['ASD'])})", file=sys.stderr)
    params = CorrelationParams(method=CorrelationMethod.PEARSON)

    # --- Graph view: one HC subject, one windowed frame ---
    hc0 = groups["HC"][0]
    data = filter_rsn_columns(parse_dr_file(DATA_DIR / hc0["path"]))
    win = min(30, data.shape[0] // 2)
    frames = windowed_correlation(data, CorrelationMethod.PEARSON, win, step=1)
    mid = frames[len(frames) // 2]
    np.fill_diagonal(mid, 0.0)
    (FIG_DIR / "graph-view.tex").write_text(graph_view_tikz(mid) + "\n")
    print(f"  graph-view.tex: subject {hc0['subject_id']} ({hc0['diagnosis']}), window {win}, frame {len(frames)//2}", file=sys.stderr)

    # --- Overview: full-length matrices, HC vs ASD, plus class means ---
    def full_matrix(f):
        m = compute_correlation_matrices(DATA_DIR / f["path"], params)[0]
        m = m.copy()
        np.fill_diagonal(m, 0.0)
        return m

    n_each = 3
    hc_subj = [full_matrix(f) for f in groups["HC"][:n_each]]
    asd_subj = [full_matrix(f) for f in groups["ASD"][:n_each]]

    # Class means over a capped sample (fast)
    cap = 25
    hc_mean = np.mean([full_matrix(f) for f in groups["HC"][:cap]], axis=0)
    asd_mean = np.mean([full_matrix(f) for f in groups["ASD"][:cap]], axis=0)

    cell = 0.12
    grid = N * cell
    gap = 0.55
    col_gap = 0.9
    vmax = 1.0

    lines = [r"\begin{tikzpicture}[scale=1]"]
    col_x = {"HC": 0.0, "ASD": grid + col_gap}
    # column headers
    lines.append(
        f"  \\node[font=\\footnotesize\\bfseries] at ({col_x['HC'] + grid/2:.3f},{0.55:.3f}) {{HC}};"
    )
    lines.append(
        f"  \\node[font=\\footnotesize\\bfseries] at ({col_x['ASD'] + grid/2:.3f},{0.55:.3f}) {{ASD}};"
    )

    rows = [("class mean", hc_mean, asd_mean)] + [
        (f"subj {i+1}", hc_subj[i], asd_subj[i]) for i in range(n_each)
    ]
    top = 0.0
    for ri, (label, hm, am) in enumerate(rows):
        y0 = top - ri * (grid + gap)
        lines += heatmap_tikz(hm, col_x["HC"], y0, cell, vmax)
        lines += heatmap_tikz(am, col_x["ASD"], y0, cell, vmax)
        # row label on the far left
        lines.append(
            f"  \\node[font=\\tiny, anchor=east, rotate=90] at "
            f"({-0.18:.3f},{y0 - grid/2:.3f}) {{{label}}};"
        )
    lines.append(r"\end{tikzpicture}")
    (FIG_DIR / "overview.tex").write_text("\n".join(lines) + "\n")
    print(f"  overview.tex: {n_each} HC + {n_each} ASD subjects + class means (cap {cap})", file=sys.stderr)


if __name__ == "__main__":
    main()
