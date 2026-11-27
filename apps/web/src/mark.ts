/**
 * The app's mark, a tally of five on the app's blue: the one source the header draws it from and
 * `scripts/icons.mjs` draws every icon from, the favicon, the apple touch icon, the install icons
 * and the README's marks. A new mark is drawn by changing this alone and running `npm run icons`.
 */
export const MARK = {
    /** The width and height the drawing is laid out in. */
    box: 64,
    /** The corners of the mark where it stands on its own, as in the header and a browser tab. */
    corners: 14,
    /** The five strokes of the tally. */
    strokes: 'M20 16v32M28 16v32M36 16v32M44 16v32M12 40l42-14',
    strokeWidth: 5,
    /**
     * The strokes at a favicon's sizes, 16, 32 and 48 pixels, narrower and moved a little left so
     * each upright lands on whole pixels with a clear gap beside it, where the full strokes would
     * fill the gaps in.
     */
    small: { strokeWidth: 4, shift: -2 },
    /**
     * The ground and the strokes, as the icons draw them. The ground is the kit's accent in its light
     * theme, which the header takes from the kit and the manifest names as the app's color.
     */
    ground: '#1f4fd8',
    ink: '#ffffff',
    /**
     * The ground and the strokes in the kit's dark theme, its accent and the text on it there, as the
     * header draws the mark. The repository's README shows a file for each of GitHub's themes, since
     * the light ground stands too dark on GitHub's dark page.
     */
    dark: { ground: '#8fb0ff', ink: '#121212' },
} as const;

/** How an icon draws the mark. */
export interface MarkShape {
    /** Whether the ground keeps its corners, or fills the square for a phone to round itself. */
    readonly corners: boolean;
    /** How much of the ground the strokes span, where a maskable icon leaves room around them. */
    readonly scale: number;
    /** Whether it is drawn at a favicon's sizes, with the strokes for small sizes. */
    readonly small: boolean;
}

/** The colors the mark is drawn in. */
export interface MarkColors {
    readonly ground: string;
    readonly ink: string;
}

/** The mark as an SVG file, drawn as an icon draws it, in the light theme's colors unless given others. */
export const markSvg = (
    { corners, scale, small }: MarkShape,
    { ground, ink }: MarkColors = MARK
): string => {
    const { box, strokes } = MARK;
    const middle = box / 2;
    const strokeWidth = small ? MARK.small.strokeWidth : MARK.strokeWidth;
    const moves = [
        ...(small ? [`translate(${String(MARK.small.shift)} 0)`] : []),
        ...(scale === 1
            ? []
            : [
                  `translate(${String(middle)} ${String(middle)}) scale(${String(scale)}) translate(-${String(middle)} -${String(middle)})`,
              ]),
    ];
    const placed = moves.length === 0 ? '' : ` transform="${moves.join(' ')}"`;
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
    // A browser tab, and the `.ico` beside it, drawn the same way.
    { file: 'favicon.svg', size: null, corners: true, scale: 1, small: true },
    // A phone rounds these itself, and iOS fills clear corners with black.
    { file: 'icons/apple-touch-icon.png', size: 180, corners: false, scale: 1, small: false },
    { file: 'icons/icon-maskable-512.png', size: 512, corners: false, scale: 0.8, small: false },
    // Shown as drawn where nothing rounds them, as on a computer's taskbar or dock.
    { file: 'icons/icon-192.png', size: 192, corners: true, scale: 1, small: false },
    { file: 'icons/icon-512.png', size: 512, corners: true, scale: 1, small: false },
] as const;

/** The favicon, which the `.ico` is drawn from too. */
export const FAVICON = ICONS[0];

/**
 * The marks the repository's README shows, by their file in `.github/readme`, one for each of
 * GitHub's themes, drawn as the header draws the mark.
 */
export const README_MARKS = [
    { file: 'mark-light.svg', colors: MARK },
    { file: 'mark-dark.svg', colors: MARK.dark },
] as const;

/** How the README's marks are drawn: whole, with their corners, at the full strokes. */
export const README_SHAPE: MarkShape = { corners: true, scale: 1, small: false };

/** The sizes the favicon's `.ico` holds, for browsers that read no SVG. */
export const ICO_SIZES = [16, 32, 48] as const;
