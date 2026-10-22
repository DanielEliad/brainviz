import { Context } from "svgcanvas";
import { BG_COLOR, EXPORT_FONT_FAMILY } from "./drawFrame";
import { StripLayout } from "./svgLayout";

export type PanelDraw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

export type StripFigure = {
  layout: StripLayout;
  panels: PanelDraw[];
  /** One caption per panel, drawn under it. */
  captions?: string[];
  /** Label for the horizontal arrow under the strip. */
  arrowLabel?: string;
  background?: string;
  fontFamily?: string;
};

function newContext(width: number, height: number): Context {
  return new Context({ width, height });
}

/** Renders one panel into a nested <svg> positioned at (x, y). */
function panelElement(
  draw: PanelDraw,
  x: number,
  y: number,
  width: number,
  height: number,
): SVGSVGElement {
  const ctx = newContext(width, height);
  draw(ctx as unknown as CanvasRenderingContext2D, width, height);
  const svg = ctx.getSvg();
  svg.setAttribute("x", String(x));
  svg.setAttribute("y", String(y));
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return svg;
}

function drawTimeArrow(
  ctx: CanvasRenderingContext2D,
  arrow: NonNullable<StripLayout["arrow"]>,
  label: string,
  fontFamily: string,
): void {
  const { x1, x2, y, fontSize } = arrow;
  const head = fontSize * 0.7;
  const stroke = Math.max(1, fontSize * 0.09);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2 - head, y);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.moveTo(x2, y);
  ctx.lineTo(x2 - head, y - head * 0.5);
  ctx.lineTo(x2 - head, y + head * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.font = `500 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label, (x1 + x2) / 2, y + head);
}

/** Composes N panels plus captions and a time arrow into one standalone SVG string. */
export function composeStripSvg({
  layout,
  panels,
  captions,
  arrowLabel,
  background = BG_COLOR,
  fontFamily = EXPORT_FONT_FAMILY,
}: StripFigure): string {
  const root = newContext(layout.width, layout.height);
  const ctx = root as unknown as CanvasRenderingContext2D;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (captions && layout.captionBaselineY !== null) {
    ctx.font = `500 ${layout.captionFontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "white";
    layout.panels.forEach((panel, i) => {
      const caption = captions[i];
      if (!caption) return;
      // Captions may contain newlines for long site names.
      caption.split("\n").forEach((line, lineIndex) => {
        ctx.fillText(
          line,
          panel.x + panel.width / 2,
          (layout.captionBaselineY as number) +
            lineIndex * layout.captionLineHeight,
        );
      });
    });
  }

  if (layout.arrow && arrowLabel) {
    drawTimeArrow(ctx, layout.arrow, arrowLabel, fontFamily);
  }

  const svgRoot = root.getSvg();
  layout.panels.forEach((panel, i) => {
    const draw = panels[i];
    if (!draw) return;
    svgRoot.appendChild(
      panelElement(draw, panel.x, panel.y, panel.width, panel.height),
    );
  });

  svgRoot.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  // XMLSerializer adds xmlns itself, and a duplicate makes the file invalid.
  svgRoot.removeAttribute("xmlns");

  // getSerializedSvg() corrupts the root xmlns when there are nested <svg> elements.
  const serialized = new XMLSerializer().serializeToString(svgRoot);
  // svgcanvas writes its unset underline flag out verbatim.
  return serialized.replace(/ text-decoration="undefined"/g, "");
}

export function downloadSvg(svg: string, fileName: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
