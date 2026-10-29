# SL-20 — decisión 16: vocabulario «Desactivar» / «Inactivo» en /plataforma/geografia

Rama `feature/SL-20-pais-geografia-configurable`, base HEAD `4ebf495` (review 2 aprobada, menor n2).
Solo texto visible: no se renombran identificadores (`confirmarRetirada`, `onRetirar`, valor de filtro
`"retirados"`) ni columnas. Sin base de datos. `./init.sh` no se corre (lo pide el leader).

## Archivos (frontend_dev)
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx`
- `tests/unit/components/geografia-plataforma-page.test.tsx`

## Textos cambiados (GeografiaAdminModule.tsx)
| Línea | Antes | Después |
|---|---|---|
| 75 | filtro «Retirados» (valor `retirados`) | «Inactivos» |
| 319 | toast «Se devolvió «X» al catálogo.» | «Se activó «X».» |
| 333 | toast «Se retiró «X» del catálogo.» | «Se desactivó «X».» |
| 375 | motivo «Primero hay que devolver al catálogo su <nivel>.» | «Primero hay que activar su <nivel>.» |
| 389-390 | ayuda «Retirar un nodo no lo borra: … se puede devolver cuando haga falta.» | «Desactivar un nodo no lo borra: … se puede volver a activar cuando haga falta.» |
| 467 | renombre «… no lo retira …» | «… no lo desactiva …» |
| 598 | título del modal «Retirar del catálogo» | «Desactivar» |
| 599 | botón de confirmación «Retirar» | «Desactivar» |
| 609 | «Vas a retirar «X» (nivel).» | «Vas a desactivar «X» (nivel).» |
| 741 | «… Puedes retirarlo igual.» | «… Puedes desactivarlo igual.» |

Sin cambio, a propósito:
- 756 «Ese nodo ya no está en el catálogo.»: es un error de nodo no encontrado, no la acción.
- `app/(app)/configuracion/_shared/geografia-estado-label.ts` (`MOTIVO_ACTIVAR_APAGADO`): lo usa Tarifas.
  /plataforma/geografia no lo pinta, porque arma su propio motivo en la línea 375.
- E2E: ningún spec busca estos textos.

## Tests ajustados
`geografia-plataforma-page.test.tsx` (R31): el caso «si el conteo falla, lo dice y deja desactivar» busca
«Puedes desactivarlo igual.» y el botón `{ name: "Desactivar" }` dentro del diálogo (`within(dialogo)`).
Con eso no se confunde con el botón de la fila, que se llama «Desactivar <nombre>». Mapa R<n> → test sin cambios.

## Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → 0 errores, 230 warnings (preexistentes), exit 0.
- `pnpm exec vitest run tests/unit/components/geografia-plataforma-page.test.tsx tests/components/GeografiaPlataformaAltaPais.test.tsx`:
  ```
  Test Files  2 passed (2)
       Tests  30 passed (30)
  ```
