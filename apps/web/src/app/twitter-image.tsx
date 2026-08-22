/**
 * The Twitter card is the same image as the Open Graph one.
 *
 * Worth knowing when you change opengraph-image.tsx: Next derives the cache
 * key in the image URL from THIS file's contents, not from the rendered
 * output. Editing only opengraph-image.tsx leaves `twitter:image` on its old
 * URL, so X keeps serving the previously cached card. Touch this file too
 * whenever the card changes.
 *
 * Last bumped: Merge K brand mark replaced the bullet in the card header.
 */
export { default, alt, size, contentType } from "./opengraph-image";
