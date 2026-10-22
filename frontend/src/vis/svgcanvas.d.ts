declare module "svgcanvas" {
  type ContextOptions = {
    width?: number;
    height?: number;
    enableMirroring?: boolean;
    document?: Document;
    ctx?: CanvasRenderingContext2D;
  };

  /**
   * Mock CanvasRenderingContext2D that records draw calls as SVG elements.
   * Structurally a CanvasRenderingContext2D so it can be passed to drawFrame().
   */
  export class Context {
    constructor(options: ContextOptions);
    constructor(width: number, height: number);
    getSvg(): SVGSVGElement;
    getSerializedSvg(fixNamedEntities?: boolean): string;
  }

  export interface Context extends CanvasRenderingContext2D {}
}
