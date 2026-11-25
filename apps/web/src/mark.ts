/**
 * The app's mark, a tally of five on the app's blue: the one source the header draws it from and
 * `scripts/icons.mjs` draws every icon from, the favicon, the apple touch icon and the install
 * icons. A new mark is drawn by changing this alone and running `npm run icons`.
 */
export const MARK = {
    /** The width and height the drawing is laid out in. */
    box: 64,
    /** The corners of the mark where it stands on its own, as in the header and a browser tab. */
    corners: 14,
    /** The five strokes of the tally. */
    strokes: 'M20 16v32M28 16v32M36 16v32M44 16v32M12 40l42-14',
    strokeWidth: 5,
    /** The ground and the strokes, as the icons draw them, which the header takes from the kit. */
    ground: '#234cc7',
    ink: '#ffffff',
} as const;

/** How an icon draws the mark. */
export interface MarkShape {
    /** Whether the ground keeps its corners, or fills the square for a phone to round itself. */
    readonly corners: boolean;
    /** How much of the ground the strokes span, where a maskable icon leaves room around them. */
    readonly scale: number;
}

/** The mark as an SVG file, drawn as an icon draws it. */
export const markSvg = ({ corners, scale }: MarkShape): string => {
    const { box, strokes, strokeWidth, ground, ink } = MARK;
    const middle = box / 2;
    const placed =
        scale === 1
            ? ''
            : ` transform="translate(${String(middle)} ${String(middle)}) scale(${String(scale)}) translate(-${String(middle)} -${String(middle)})"`;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(box)} ${String(box)}">`,
        `<rect width="${String(box)}" height="${String(box)}" rx="${String(corners ? MARK.corners : 0)}" fill="${ground}"/>`,
        `<path d="${strokes}" fill="none" stroke="${ink}" stroke-width="${String(strokeWidth)}" stroke-linecap="round"${placed}/>`,
        '</svg>',
        '',
    ].join('\n');
};

/** Each icon the app serves, by its path in the build, its size and how it draws the mark. */
export const ICONS = [
    { file: 'favicon.svg', size: null, corners: true, scale: 1 },
    { file: 'icons/apple-touch-icon.png', size: 180, corners: false, scale: 1 },
    { file: 'icons/icon-192.png', size: 192, corners: false, scale: 1 },
    { file: 'icons/icon-512.png', size: 512, corners: false, scale: 1 },
    { file: 'icons/icon-maskable-512.png', size: 512, corners: false, scale: 0.8 },
] as const;

/** The sizes the favicon's `.ico` holds, for browsers that read no SVG. */
export const ICO_SIZES = [16, 32, 48] as const;
