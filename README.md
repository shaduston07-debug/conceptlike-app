# Draftwell

An infinite-canvas vector sketching app for iPad and Apple Pencil, built for designers, architects and illustrators.

## Features

- **Infinite vector canvas.** Pan, pinch-zoom (2%–64,000%) and rotate with two fingers. Rotation snaps level. Optional artboards with presets for paper, screen and social sizes.
- **Pressure- and tilt-aware brushes.** Pen, Fine Liner, Pencil (grain, tilt shading), Marker (multiply), Brush (tapered), Calligraphy, Airbrush, Watercolor and Soft Eraser. Customizable tool presets have their own size, opacity, smoothing and color.
- **Live shapes.** Pause at the end of a stroke to turn it into a clean line, arc, circle, ellipse, rectangle or polygon, then adjust it with handles.
- **Precision.** Guides (line, circle, ellipse, rectangle, polygon, arc, bezier curve, protractor) that strokes snap to. 1-, 2- and 3-point perspective grids with draggable vanishing points. Grid and angle snapping. Dot, grid, graph, lined and isometric paper.
- **Measurement.** Real-world units (mm, cm, m, in, ft, pt, px) with drawing scales (1:1 … 1:500) and live dimension labels.
- **Editing.** Lasso/box/tap selection, move/scale/rotate handles, two-finger transform, flip, duplicate, copy/paste, arrange, restyle, recolor and numeric transform. Nudge (pull strokes), Slice (trim to intersections or cut), partial and whole-stroke eraser, fill (flood or lasso), text and eyedropper.
- **Layers.** Unlimited, with opacity, 16 blend modes, lock, hide, rename, duplicate, merge and drag reorder.
- **History.** Unlimited undo/redo (two- and three-finger taps), plus a history scrubber with replay.
- **Color.** HSV wheel, RGB/HSL sliders, hex, curated and custom palettes, recent colors, and touch-and-hold color picking.
- **Object library.** Built-in symbols, plus your own saved objects.
- **Import and export.** Import images and `.draftwell` files. Export PNG, JPG, SVG, vector or raster PDF, layered PSD, a ZIP of per-layer PNGs, and `.draftwell`.
- **Gallery.** Projects, thumbnails, rename, duplicate, delete and autosave.
- **Apple Pencil.** Pencil-only mode, palm rejection, hover preview, double-tap (eraser/last tool/color) and squeeze (Pencil Pro).
- **Interface.** Dark mode, left-handed layout, a tool bar or a radial tool wheel, and hardware keyboard shortcuts.

## Getting the app on your iPad

Every push builds an unsigned `Draftwell.ipa` with GitHub Actions (`.github/workflows/build-ipa.yml`). Download it from the latest **Release**, or from the workflow run's artifacts.

Unsigned IPAs must be signed with your Apple ID when you install them:

1. Install **Sideloadly** (Windows/macOS) or **AltStore** on your computer.
2. Connect the iPad, drag `Draftwell.ipa` in, and sign in with your Apple ID.
3. On the iPad, enable **Settings → Privacy & Security → Developer Mode**. Then trust the profile under **Settings → General → VPN & Device Management**.

With a free Apple ID the app must be re-signed every 7 days. Your drawings are kept when you do.

## Development

```bash
npm install
npm run dev        # open http://localhost:5173 (mouse: drag to draw, wheel to pan, ⌘/ctrl+wheel to zoom)
npm run build      # type-check + production bundle into dist/
```

The iOS shell lives in `ios/` (XcodeGen project). It serves the bundled web app from a private `app://` origin and bridges storage, share sheet, Photos, haptics and Pencil interactions.

```bash
npm run build && rm -rf ios/web && cp -R dist ios/web
cd ios && xcodegen generate && open Draftwell.xcodeproj
```
