# Bundled application fonts

These are the unchanged WOFF2 subsets already used by TillFlow: Plus Jakarta Sans (display weights 400–800) and DM Sans (body weights 300–500). They were copied from the existing local Next.js font build output. `app/fonts.css` preserves its original per-weight declarations, Unicode coverage and Arial fallback metrics. Latin subsets are preloaded by `app/layout.tsx`; other subsets load only when needed, including the Ghana cedi glyph in Latin Extended.

Bundling avoids a build-time dependency on the Google Fonts CSS response, which exposed a URL format the Next.js 14 Google font loader could not parse during the conversion release. Font binaries are unmodified; their OFL licenses are included here.

Upstream licenses:
- https://github.com/google/fonts/blob/main/ofl/plusjakartasans/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt
