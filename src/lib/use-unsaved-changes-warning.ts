import { useEffect } from 'react'

export const UNSAVED_LEAVE_MESSAGE =
  'You have unsaved lyrics changes. Leave this page and discard them?'

/**
 * Warns before the current page is torn down while `when` is true, so unsaved
 * edits aren't silently discarded. The app uses a declarative `<BrowserRouter>`
 * (not a data router), so React Router's `useBlocker` isn't available; this
 * covers the two vectors it would otherwise handle:
 *
 *  - **Browser-level unload** (refresh, tab close, typing a new URL) via the
 *    native `beforeunload` prompt.
 *  - **In-app SPA navigation** by clicking a React Router `<Link>`/`<NavLink>`
 *    (rendered as an `<a href>`) — e.g. the "← Songs" back link or a sidebar
 *    menu item. A capture-phase document click listener confirms first and, on
 *    decline, cancels the click before React Router's handler runs, so the
 *    navigation never happens.
 *
 * Same-page controls the caller owns (switching arrangement tabs) aren't
 * anchors, so the caller guards those directly.
 */
export function useUnsavedChangesWarning(
  when: boolean,
  message: string = UNSAVED_LEAVE_MESSAGE,
) {
  useEffect(() => {
    if (!when) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Legacy assignment still required by some browsers to trigger the prompt.
      event.returnValue = ''
    }

    const onClickCapture = (event: MouseEvent) => {
      // Ignore non-navigating clicks: already handled, non-primary button, or a
      // modifier combo that opens a new tab/window (which doesn't destroy this
      // page).
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      const href = anchor?.getAttribute('href')
      if (
        !anchor ||
        !href ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        href.startsWith('#') ||
        /^[a-z]+:/i.test(href) // external scheme: http:, mailto:, tel:, …
      ) {
        return
      }
      // A link back to the very page we're on wouldn't tear down the editor.
      if (href === window.location.pathname + window.location.search) return

      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    // Capture phase so we run before React Router's bubble-phase click handler.
    document.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [when, message])
}
