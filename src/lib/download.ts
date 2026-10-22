/**
 * Save a file from a URL the server sends as an attachment — a signed Storage
 * URL made with the `download` option answers `Content-Disposition:
 * attachment`. Navigating to it saves the file and leaves the page as it is.
 *
 * Not `window.open`: by the time the signed URL comes back from its request
 * the tap is over, and iOS Safari blocks a window opened outside a tap without
 * a word (`noopener` hides even that, by always returning null).
 */
export function startDownload(url: string): void {
  window.location.assign(url)
}
