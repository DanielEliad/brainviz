import { GraphFrame } from "./types";
import {
  DrawOptions,
  EXPORT_FONT_FAMILY,
  drawFrame,
  filterHiddenNodes,
} from "./drawFrame";
import { PanelDraw, composeStripSvg } from "./svgExport";
import {
  StripLayout,
  exportFileName,
  pickFrameIndices,
  stripLayout,
} from "./svgLayout";

// Panels are rendered at drawFrame's reference width so every element lands at
// its nominal size; SVG scales the result to whatever the poster needs.
export const PANEL_WIDTH = 1920;
export const PANEL_GAP = 60;
export const PANEL_MARGIN = 40;

export type SvgExportMode = "frame" | "filmstrip";

export type SvgExportSettings = {
  mode: SvgExportMode;
  frameCount: number;
  aspect: number;
  captions: boolean;
  timeArrow: boolean;
  infoBox: boolean;
  shortLabels: boolean;
  labelScale: number;
};

export const DEFAULT_SVG_EXPORT_SETTINGS: SvgExportSettings = {
  mode: "filmstrip",
  frameCount: 5,
  aspect: 9,
  captions: true,
  timeArrow: true,
  infoBox: false,
  shortLabels: true,
  labelScale: 1.6,
};

export type GraphSvgExportInput = {
  frames: GraphFrame[];
  currentIndex: number;
  hiddenNodes: Set<string>;
  drawOptions: DrawOptions;
  /** Slug parts appended to the download filename. */
  fileParts: Array<string | number | null | undefined>;
};

export type SvgFigure = {
  svg: string;
  fileName: string;
  width: number;
  height: number;
  frameIndices: number[];
};

function graphLayout(count: number, settings: SvgExportSettings): StripLayout {
  const captions = settings.mode === "filmstrip" && settings.captions;
  const arrow = settings.mode === "filmstrip" && settings.timeArrow;
  return stripLayout({
    count,
    panelWidth: PANEL_WIDTH,
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
    captions,
    arrow,
    targetAspect: settings.aspect,
  });
}

export function buildGraphSvg(
  input: GraphSvgExportInput,
  settings: SvgExportSettings,
): SvgFigure | null {
  const { frames, currentIndex, hiddenNodes, drawOptions, fileParts } = input;
  if (frames.length === 0) return null;

  const frameIndices =
    settings.mode === "frame"
      ? [Math.min(Math.max(currentIndex, 0), frames.length - 1)]
      : pickFrameIndices(frames.length, settings.frameCount);
  const selected = frameIndices.map((i) => filterHiddenNodes(frames[i], hiddenNodes));

  const layout = graphLayout(selected.length, settings);

  const panels: PanelDraw[] = selected.map((frame, i) => (ctx, width, height) => {
    drawFrame(ctx, frame, width, height, {
      ...drawOptions,
      fontFamily: EXPORT_FONT_FAMILY,
      shortLabels: settings.shortLabels,
      labelScale: settings.labelScale,
      // Info box on the first panel only.
      infoBox: settings.infoBox && i === 0 ? drawOptions.infoBox : undefined,
    });
  });

  const svg = composeStripSvg({
    layout,
    panels,
    captions: settings.captions
      ? selected.map((f) => `t = ${f.timestamp}`)
      : undefined,
    arrowLabel: settings.timeArrow ? "time" : undefined,
  });

  const base = settings.mode === "frame" ? "brainviz-graph" : "brainviz-filmstrip";
  const suffix =
    settings.mode === "frame"
      ? [`t${selected[0].timestamp}`]
      : [`${selected.length}frames`];

  return {
    svg,
    fileName: exportFileName(base, [...fileParts, ...suffix]),
    width: layout.width,
    height: layout.height,
    frameIndices,
  };
}
