// Browser mock for @scribe.js/canvas to prevent Rollup from bundling Node C++ binaries
export const Canvas = typeof window !== 'undefined' ? (window as any).OffscreenCanvas || (window as any).HTMLCanvasElement : class {};
export const ImageData = typeof window !== 'undefined' ? (window as any).ImageData : class {};
export const DOMMatrix = typeof window !== 'undefined' ? (window as any).DOMMatrix : class {};
export const loadImage = () => Promise.resolve({});
export const GlobalFonts = { registerFromPath: () => {} };
export default {};
