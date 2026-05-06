from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from matplotlib.ticker import MultipleLocator


def parse_number(value: str) -> float:
    text = value.strip()
    if not text:
        raise ValueError("Empty numeric value")
    return float(Fraction(text))


@dataclass(frozen=True)
class FrontierPoint:
    freq_hz: float
    max_feasible_ms: float | None
    min_infeasible_ms: float | None
    status: str


def load_frontier(csv_path: Path) -> list[FrontierPoint]:
    points: list[FrontierPoint] = []

    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        required = {"anchorAxis", "anchorValue", "maxFeasibleValue", "minInfeasibleValue", "status"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            if (row["anchorAxis"] or "").strip() != "freqHz":
                continue

            max_feasible = parse_number(row["maxFeasibleValue"]) if row["maxFeasibleValue"].strip() else None
            min_infeasible = (
                parse_number(row["minInfeasibleValue"]) if row["minInfeasibleValue"].strip() else None
            )
            points.append(
                FrontierPoint(
                    freq_hz=parse_number(row["anchorValue"]),
                    max_feasible_ms=max_feasible,
                    min_infeasible_ms=min_infeasible,
                    status=(row["status"] or "").strip(),
                )
            )

    points.sort(key=lambda point: point.freq_hz)
    return points


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Plot a WCET-vs-frequency frontier from cnn-only-frontier.csv."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="analysis/exhaustive-cnn-sweep/cnn-only-frontier.csv",
        help="Input CSV file. Default: analysis/exhaustive-cnn-sweep/cnn-only-frontier.csv",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="analysis/exhaustive-cnn-sweep/cnn-feasibility-frontier.png",
        help="Output image path. Default: analysis/exhaustive-cnn-sweep/cnn-feasibility-frontier.png",
    )
    parser.add_argument(
        "--title",
        default="CNN Feasibility Frontier (Frontier Sweep)",
        help="Plot title.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    points = load_frontier(input_path)
    if not points:
        raise ValueError("No frontier points found in CSV.")

    xs_all = [point.freq_hz for point in points]
    max_values = [point.max_feasible_ms for point in points if point.max_feasible_ms is not None]
    min_values = [point.min_infeasible_ms for point in points if point.min_infeasible_ms is not None]
    top_y = max(max_values + min_values + [5.0]) + 0.35

    frontier_points = [point for point in points if point.status == "frontier-found" and point.max_feasible_ms is not None]
    all_feasible_points = [
        point for point in points if point.status == "all-feasible-up-to-hi" and point.max_feasible_ms is not None
    ]
    all_infeasible_points = [point for point in points if point.status == "all-infeasible"]

    fig, ax = plt.subplots(figsize=(16, 8))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    if frontier_points:
        fx = [point.freq_hz for point in frontier_points]
        fy = [point.max_feasible_ms for point in frontier_points if point.max_feasible_ms is not None]
        gy = [point.min_infeasible_ms for point in frontier_points if point.min_infeasible_ms is not None]

        ax.fill_between(
            fx,
            0,
            fy,
            color="#8fd19e",
            alpha=0.28,
            zorder=1,
        )
        ax.fill_between(
            fx,
            fy,
            gy,
            color="#f6cf8b",
            alpha=0.32,
            zorder=2,
        )
        frontier_handle = ax.plot(
            fx,
            fy,
            color="#2f6db2",
            linewidth=2.2,
            marker="o",
            markersize=4.8,
            markerfacecolor="#2f6db2",
            markeredgecolor="#2f6db2",
            label="Max feasible WCET",
            zorder=4,
        )[0]
        infeasible_handle = ax.plot(
            fx,
            gy,
            color="#c84a4a",
            linewidth=1.6,
            linestyle="--",
            marker="o",
            markersize=3.5,
            markerfacecolor="#c84a4a",
            markeredgecolor="#c84a4a",
            label="First infeasible WCET",
            zorder=4,
        )[0]
    else:
        frontier_handle = Line2D([], [], color="#2f6db2", linewidth=2.2, marker="o")
        infeasible_handle = Line2D([], [], color="#c84a4a", linewidth=1.6, linestyle="--", marker="o")

    if all_feasible_points:
        ax.scatter(
            [point.freq_hz for point in all_feasible_points],
            [point.max_feasible_ms for point in all_feasible_points if point.max_feasible_ms is not None],
            marker="^",
            s=72,
            color="#2e9f61",
            edgecolors="white",
            linewidths=0.8,
            zorder=5,
        )

    if all_infeasible_points:
        ax.scatter(
            [point.freq_hz for point in all_infeasible_points],
            [0.0 for _ in all_infeasible_points],
            marker="x",
            s=78,
            color="#d1495b",
            linewidths=2.0,
            zorder=5,
        )

    for point in frontier_points:
        if point.max_feasible_ms is None:
            continue
        if point.max_feasible_ms <= 0.2:
            ax.annotate(
                f"{int(point.freq_hz)}",
                xy=(point.freq_hz, point.max_feasible_ms),
                xytext=(0, 7),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
                color="#7a2030",
                zorder=6,
            )

    for point in all_feasible_points:
        if point.max_feasible_ms is None:
            continue
        ax.annotate(
            ">= 5 ms",
            xy=(point.freq_hz, point.max_feasible_ms),
            xytext=(0, 9),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=8,
            color="#226b45",
            zorder=6,
        )

    ax.set_title(args.title)
    ax.set_xlabel("Frequency (Hz)")
    ax.set_ylabel("WCET (ms)")
    ax.set_xlim(min(xs_all) - 5, max(xs_all) + 5)
    ax.set_ylim(-0.08, top_y)

    ax.set_xticks(xs_all)
    ax.set_xticklabels([str(int(value)) for value in xs_all], rotation=55, ha="right")
    ax.xaxis.set_minor_locator(MultipleLocator(10))
    ax.yaxis.set_major_locator(MultipleLocator(0.5))
    ax.yaxis.set_minor_locator(MultipleLocator(0.125))

    ax.grid(True, which="major", linestyle="--", linewidth=0.7, alpha=0.28)
    ax.grid(True, which="minor", linestyle=":", linewidth=0.35, alpha=0.2)

    legend_handles = [
        frontier_handle,
        infeasible_handle,
        Patch(color="#8fd19e", alpha=0.45, label="Feasible zone"),
        Patch(color="#f6cf8b", alpha=0.5, label="Frontier gap"),
        Line2D([], [], linestyle="None", marker="^", markersize=8, color="#2e9f61", label="All feasible up to hi"),
        Line2D([], [], linestyle="None", marker="x", markersize=8, color="#d1495b", label="All infeasible"),
    ]
    ax.legend(handles=legend_handles, loc="upper right", frameon=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=180)
    plt.close(fig)

    print(f"Saved plot to: {output_path}")


if __name__ == "__main__":
    main()
