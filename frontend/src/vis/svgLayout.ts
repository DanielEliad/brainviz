// Geometry for composed SVG figure exports, kept DOM-free so it can be unit tested.

export type Rect = { x: number; y: number; width: number; height: number };

export type StripLayout = {
  width: number;
  height: number;
  panels: Rect[];
  /** Baseline y for the caption under each panel, null when captions are off. */
  captionBaselineY: number | null;
  captionFontSize: number;
  /** Leading between stacked caption lines, in the same units as the layout. */
  captionLineHeight: number;
  /** Horizontal time arrow under the whole strip, null when off. */
  arrow: { y: number; x1: number; x2: number; fontSize: number } | null;
};

export type StripLayoutOptions = {
  count: number;
  panelWidth: number;
  /** Fixed panel height. Omit to derive it from targetAspect. */
  panelHeight?: number;
  gap: number;
  margin: number;
  captions: boolean;
  /** Caption lines per panel. */
  captionLines?: number;
  arrow: boolean;
  /** Overall width:height the figure must end up at. */
  targetAspect?: number;
};

const MIN_PANEL_HEIGHT = 40;
const CAPTION_BAND_RATIO = 0.075;
const ARROW_BAND_RATIO = 0.09;

/** Evenly spaced frame indices across a sequence, always including first and last. */
export function pickFrameIndices(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return [];
  if (count === 1) return [0];
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: count }, (_, i) =>
    Math.round((i * (total - 1)) / (count - 1)),
  );
}

export function stripLayout(options: StripLayoutOptions): StripLayout {
  const { count, panelWidth, gap, margin, captions, arrow, targetAspect } =
    options;
  const captionLines = Math.max(1, options.captionLines ?? 1);

  const captionBand = captions
    ? Math.round(panelWidth * CAPTION_BAND_RATIO * captionLines)
    : 0;
  const arrowBand = arrow ? Math.round(panelWidth * ARROW_BAND_RATIO) : 0;
  const bands = captionBand + arrowBand;

  const contentWidth = count * panelWidth + Math.max(0, count - 1) * gap;
  let width = contentWidth + 2 * margin;

  let panelHeight: number;
  if (options.panelHeight !== undefined) {
    panelHeight = options.panelHeight;
  } else if (targetAspect && targetAspect > 0) {
    panelHeight = Math.round(width / targetAspect) - 2 * margin - bands;
  } else {
    panelHeight = panelWidth;
  }
  panelHeight = Math.max(MIN_PANEL_HEIGHT, panelHeight);

  let height = panelHeight + bands + 2 * margin;

  // Pad the shorter axis to reach targetAspect.
  let padX = 0;
  let padY = 0;
  if (targetAspect && targetAspect > 0) {
    const wanted = height * targetAspect;
    if (wanted > width) {
      padX = (wanted - width) / 2;
      width = Math.round(wanted);
    } else {
      const wantedHeight = width / targetAspect;
      if (wantedHeight > height) {
        padY = (wantedHeight - height) / 2;
        height = Math.round(wantedHeight);
      }
    }
  }

  const left = margin + padX;
  const top = margin + padY;
  const panels: Rect[] = Array.from({ length: count }, (_, i) => ({
    x: left + i * (panelWidth + gap),
    y: top,
    width: panelWidth,
    height: panelHeight,
  }));

  const captionFontSize = Math.round(panelWidth * 0.05);
  const captionLineHeight = Math.round(captionFontSize * 1.25);
  // Baseline of the FIRST line; the band is sized for all of them.
  const captionBaselineY = captions
    ? top + panelHeight + Math.round((captionBand / captionLines) * 0.75)
    : null;

  const arrowFontSize = Math.round(panelWidth * 0.045);
  const arrowLayout = arrow
    ? {
        y: top + panelHeight + captionBand + Math.round(arrowBand * 0.45),
        x1: left,
        x2: left + contentWidth,
        fontSize: arrowFontSize,
      }
    : null;

  return {
    width,
    height,
    panels,
    captionBaselineY,
    captionFontSize,
    captionLineHeight,
    arrow: arrowLayout,
  };
}

export function formatAspect(width: number, height: number): string {
  if (height <= 0) return "–";
  return `${(width / height).toFixed(2)}:1`;
}

/** Slug for a downloaded file: lowercase, non-alphanumerics collapsed to "-". */
export function exportFileName(
  base: string,
  parts: Array<string | number | null | undefined>,
  extension = "svg",
): string {
  const slug = [base, ...parts]
    .filter((p) => p !== null && p !== undefined && p !== "")
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.${extension}`;
}
