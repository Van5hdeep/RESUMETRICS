// URLs that reach an href or an <img src> are checked here first. React escapes text, but it does not stop a
// `javascript:` link from running when clicked, so only known-safe schemes get through.

const LINK_PATTERN = /^https?:\/\/[^\s]+$/i
// Images may also be this site's own files ("/assets/…"), blob: previews and raster data URLs (uploads, crops,
// cleaned-up signatures). SVG data URLs are refused: an <img> won't run their scripts, but nothing here needs them.
const IMAGE_PATTERN = /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*|blob:[^\s]+|data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+)$/i

/** An http(s) link, or undefined for anything else (javascript:, data:, relative or malformed values). */
export function safeLinkUrl(value) {
  return typeof value === 'string' && LINK_PATTERN.test(value.trim()) ? value.trim() : undefined
}

/** An image source that can only show an image, or undefined. */
export function safeImageSrc(value) {
  return typeof value === 'string' && IMAGE_PATTERN.test(value) ? value : undefined
}
