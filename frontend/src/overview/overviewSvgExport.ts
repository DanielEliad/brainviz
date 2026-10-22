import type { GraphFrame } from "../vis/types";
import type { DataRange } from "../vis/drawFrame";
import { PanelDraw, composeStripSvg } from "../vis/svgExport";
import { exportFileName, stripLayout } from "../vis/svgLayout";
import type { SvgFigure } from "../vis/graphSvgExport";
import { drawMatrixPanel, drawMiniGraphPanel } from "./drawPanels";

// Square panels; the on-screen figure mode puts a 4.5rem gap next to a 360 px card.
const PANEL_SIZE = 1200;
const GAP = Math.round(PANEL_SIZE * 0.2);
const MARGIN = Math.round(PANEL_SIZE * 0.05);

export const DEFAULT_OVERVIEW_ASPECT = 2.5;

export type OverviewPanel = {
  frame: GraphFrame;
  caption: string;
  symmetric: boolean;
};

export type OverviewSvgInput = {
  panels: OverviewPanel[];
  viewMode: "matrix" | "graph";
  dataRange: DataRange;
  edgeThreshold: number;
  aspect: number;
  captions: boolean;
  /** Caption lines per panel; captions themselves carry the newlines. */
  captionLines?: number;
  /** Exponent for the diverging colour ramp; higher spreads the levels apart. */
  exponent?: number;
  fileParts: Array<string | number | null | undefined>;
};

export function buildOverviewSvg(input: OverviewSvgInput): SvgFigure | null {
  const { panels, viewMode, dataRange, edgeThreshold, aspect, captions } = input;
  if (panels.length === 0) return null;

  const layout = stripLayout({
    count: panels.length,
    panelWidth: PANEL_SIZE,
    panelHeight: PANEL_SIZE,
    gap: GAP,
    margin: MARGIN,
    captions,
    captionLines: input.captionLines,
    arrow: false,
    targetAspect: aspect,
  });

  const draws: PanelDraw[] = panels.map((panel) => (ctx, width) => {
    if (viewMode === "matrix") {
      drawMatrixPanel(ctx, panel.frame, width, dataRange, edgeThreshold,
        input.exponent);
    } else {
      drawMiniGraphPanel(ctx, panel.frame, width, edgeThreshold, panel.symmetric,
        input.exponent);
    }
  });

  const svg = composeStripSvg({
    layout,
    panels: draws,
    captions: captions ? panels.map((p) => p.caption) : undefined,
  });

  return {
    svg,
    fileName: exportFileName("brainviz-overview", [viewMode, ...input.fileParts]),
    width: layout.width,
    height: layout.height,
    frameIndices: panels.map((_, i) => i),
  };
}
