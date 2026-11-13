import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// Sin `matchMedia` (jsdom, navegadores muy viejos) no se puede saber el ancho: se asume
// desktop y no se escucha nada, en lugar de lanzar (SLT-130, R4).
function hayMatchMedia() {
  return typeof window.matchMedia === "function"
}

function subscribe(onChange: () => void) {
  if (!hayMatchMedia()) return () => {}
  const mql = window.matchMedia(MEDIA_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  if (!hayMatchMedia()) return false
  return window.matchMedia(MEDIA_QUERY).matches
}

// En el servidor no hay viewport: se asume desktop (false).
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
}
