from __future__ import annotations

import argparse
import csv
from fractions import Fraction
from pathlib import Path

from matplotlib.patches import Patch
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator


def parse_number(value: str) -> float:
    text = value.strip()
    if not text:
        raise ValueError("Empty numeric value")
    return float(Fraction(text))


def load_points(csv_path: Path) -> tuple[list[float], list[float], list[bool]]:
    xs: list[float] = []
    ys: list[float] = []
    feasible: list[bool] = []

    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"freqHz", "wcetMs", "feasible"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            xs.append(parse_number(row["freqHz"]))
            ys.append(parse_number(row["wcetMs"]))
            feasible.append(row["feasible"].strip().lower() == "yes")

    return xs, ys, feasible


def compute_frontier(
    xs: list[float],
    ys: list[float],
    feasible: list[bool],
) -> tuple[list[float], list[float]]:
    by_freq: dict[float, float] = {}
    for freq, wcet, ok in zip(xs, ys, feasible):
        if not ok:
            continue
        current = by_freq.get(freq)
        if current is None or wcet > current:
            by_freq[freq] = wcet

    frontier_x = sorted(by_freq)
    frontier_y = [by_freq[freq] for freq in frontier_x]
    return frontier_x, frontier_y


def compute_local_minima(xs: list[float], ys: list[float]) -> list[tuple[float, float]]:
    minima: list[tuple[float, float]] = []
    for i in range(1, len(xs) - 1):
        if ys[i] < ys[i - 1] and ys[i] < ys[i + 1]:
            minima.append((xs[i], ys[i]))
    return minima


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Plot a 2D feasibility graph from cnn-only-grid.csv."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="analysis/cnn-only-grid.csv",
        help="Input CSV file. Default: analysis/cnn-only-grid.csv",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="analysis/cnn-only-grid-plot.png",
        help="Output image path. Default: analysis/cnn-only-grid-plot.png",
    )
    parser.add_argument(
        "--title",
        default="Feasibility boundary - raw (maximum feasible WCET per frequency)",
        help="Plot title.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    xs, ys, feasible = load_points(input_path)
    frontier_x, frontier_y = compute_frontier(xs, ys, feasible)
    minima = compute_local_minima(frontier_x, frontier_y)

    if not frontier_x:
        raise ValueError("No feasible points found in CSV; cannot draw boundary.")

    fig, ax = plt.subplots(figsize=(16, 7.8))
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")

    max_y = max(ys)
    top_y = max_y + 1.5

    ax.fill_between(
        frontier_x,
        0,
        frontier_y,
        color="#8fda91",
        alpha=0.38,
        zorder=1,
    )
    ax.fill_between(
        frontier_x,
        frontier_y,
        top_y,
        color="#f4a6a6",
        alpha=0.26,
        zorder=1,
    )

    line_handle = ax.plot(
        frontier_x,
        frontier_y,
        color="#4f8fc2",
        linewidth=2.1,
        marker="o",
        markersize=4.8,
        markerfacecolor="#4f8fc2",
        markeredgecolor="#4f8fc2",
        label="Raw boundary",
        zorder=3,
    )[0]

    for freq, wcet in minima:
        ax.scatter([freq], [wcet], color="#4f8fc2", s=28, zorder=4)
        ax.annotate(
            f"{int(freq)} Hz",
            xy=(freq, wcet),
            xytext=(0, -18),
            textcoords="offset points",
            ha="center",
            va="top",
            fontsize=9,
            color="#ff4d4f",
            arrowprops={
                "arrowstyle": "-",
                "color": "#ff4d4f",
                "lw": 0.8,
                "shrinkA": 0,
                "shrinkB": 0,
            },
            zorder=5,
        )

    ax.set_title(args.title)
    ax.set_xlabel("Frequency (Hz)")
    ax.set_ylabel("WCET (ms)")
    ax.set_xlim(min(frontier_x), max(frontier_x))
    ax.set_ylim(-0.1, top_y)

    ax.set_xticks(frontier_x)
    ax.set_xticklabels([str(int(x)) for x in frontier_x], rotation=55, ha="right")
    ax.xaxis.set_minor_locator(MultipleLocator(5))
    ax.yaxis.set_major_locator(MultipleLocator(0.2))
    ax.yaxis.set_minor_locator(MultipleLocator(0.05))

    ax.grid(True, which="major", linestyle="--", linewidth=0.7, alpha=0.28)
    ax.grid(True, which="minor", linestyle=":", linewidth=0.35, alpha=0.22)

    ax.legend(
        handles=[
            line_handle,
            Patch(color="#8fda91", alpha=0.55, label="Feasible region"),
            Patch(color="#f4a6a6", alpha=0.45, label="Infeasible region"),
        ],
        loc="upper left",
        frameon=True,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=180)
    plt.close(fig)

    print(f"Saved plot to: {output_path}")


if __name__ == "__main__":
    main()
