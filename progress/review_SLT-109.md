# review SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página»

> reviewer · 2026-11-12 · vuelta 1 · ruta completa · diff `origin/dev...6bbb9bae` (PR #142).

## Checklist

- [x] **Ruta:** completa (frontend, medium). El diff no toca `lib/` ni `db/` (`git diff --name-only origin/dev...HEAD -- lib db` vacío): R72 y T5.2 comprobados.
- [x] **Spec:** `requirements.md` (EARS R4, R12, R61-R63, R71, R72, R77, R240-R256), `design.md` con `## Lo que ya existe` y alternativas descartadas, `tasks.md`. El diff no re-crea nada de la lista: `CorregirCierre.tsx` es nuevo (la tabla dice «No existe» como página) y sustituye el panel de la 477.
- [x] **Tasks:** T0-T4 `[x]`. T5.1-T5.3 sin marcar: son del leader (T5.2 lo comprobé yo; T5.3 es esta revisión).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 40/40 archivos, 4 428 líneas, con `<!-- tamano-pr-aceptado: 2026-11-12 … -->` en `progress/features/SLT-109.md`.
- [x] **Trazabilidad:** todos los R de la ficha y los del madre que cita tienen test en `tasks.md > Trazabilidad` y `progress/impl_SLT-109.md > R → test`. Leí los de `CierreDiaPagina.test.tsx` (R240-R255): aserciones reales, con literales del contrato (textos de franja, pies, avisos, nombres accesibles). R77 con importes a mano en `e2e/cierre-dia.spec.ts:94-99` y en `cierre-modelo-nuevo-plan-porcentual.spec.ts`; R254 medido con `boundingBox` en 375 × 667 (`e2e/cierre-dia.spec.ts:179-200`); R71 con `CorregirCierre.tsx` censado en `liquidacion-money-safe`.
- [x] **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- [x] **Lint:** `eslint` sobre los archivos añadidos o modificados del diff → exit 0.
- [x] **Tests:** los 21 archivos tocados (componentes, unit, guardias), base `slt109_pagina`: **21/21 archivos, 439/439 tests**.
- [x] **E2E en local:** 7 specs, 50/50 en dos corridas, base desechable `slt109_e2e` (bitácora T4.4). No los repetí: los corre el CI.
- [x] **Checkpoints del proyecto:** sin tablas, queries, migraciones ni dependencias nuevas. Sin literales de país ni moneda en el código nuevo (grep de `SINPE|colon|₡|CRC` en las líneas `+` de producción: nada). Sin `parseFloat`, `Number(`, `toFixed` ni `Math.`. Nada de Ordenex. La lectura del reenviable va por la Server Action existente `verCierrePasado` (sesión + `mensajeroId`), desde el Server Component.
- [x] **Mutaciones reproducidas** en un worktree desechable aparte, para no tocar el árbol que leía el gate del leader. Al acabar quité el junction y borré ese worktree; `git status` de la rama sigue limpio.
  1. `cierreDeLaPagina` ignora `aReenviarPrimero` (`detalle-cierre-vista.ts:916`): **12 rojos** entre `detalle-cierre-vista.test.ts` y `CierreDiaPagina.test.tsx` (R240, R253, R246, R247, R249-R251).
  2. Mutación mía, que no está en la bitácora: `CorregirCierre.tsx` pinta «Órdenes por volver a gestionar» aunque no haya órdenes (`>= 0`): **1 rojo** («R248: sin órdenes en corrección, esa sección no se pinta»).

## Puntos pedidos por el leader

- **Borrado de `CierreDiaMotivoRechazoAutomatico.test.tsx` (ficha 408):** todas sus aserciones leían la celda «Motivo» de las tablas por resultado de `/cierre-dia`. La fila única no pinta el motivo de la gestión: `grep motivo` en `components/private/cierres/fila/` solo encuentra el motivo de ajuste y el de «Devolver a gestión». La pantalla ya no tiene esa superficie, como decidió Carlos. El traductor `motivoGestionLegible` sigue vivo en admin, comprobante y rechazos de tienda, y sigue probado en `tests/unit/components/motivo-rechazo-automatico-legible.test.ts`, `CierreMotivoRechazoAutomatico.test.tsx`, `ComprobanteMensajeroOrigenRechazo.test.tsx` y en la guardia `motivo-automatico-sin-jerga`. No se pierde cobertura.
- **Bloque 237/R41 de `CierreDiaModule.test.tsx` (marca «La tienda»):** la fila única no pinta esa marca, como decidió Carlos. Lo que sí sigue en pantalla de la 237 (D3: «Devolver a gestión» deshabilitado con su motivo) sigue probado: `CierreDiaModule.test.tsx` › 237/D3, `FilaGestion.test.tsx` › R244 ×3 y `fila-gestion-vista.test.ts` › R244.
- **Bloque «Feature 213 — desglose de pago» borrado:** la columna «Método» de las tablas se fue. El desglose por método vive ahora en la fila única (`fila-gestion-vista.ts:266`, `g.pagos` + `METODO_LABEL`), que vigilan `fila-gestion-vista.test.ts` y la guardia `pagos-captura`, reapuntada a ese archivo. No se pierde cobertura.
- **`CierreDiaModule.tsx`, de 1 495 a 708 líneas:**
  - Se retiraron las regiones «Totales del día», «Ganancia», las secciones por resultado, el aviso de bloqueo suelto, «Cierre vencido», «Cierre rechazado», «Corregir el cierre rechazado» y «Solicitar cierre».
  - Las sustituye un solo `DetalleCierre` con `marco="pagina"`, que monta `cierreDeLaPaginaPintado()` (:472-545). R255 lo comprueba en los tres modos.
  - Sin imports muertos (el lint pasa). Hay un solo camino de envío (`confirmarSolicitud`) y uno de deshacer (`confirmarDeshacer`), compartido por la página y el modal.
  - Los textos que se fueron de este archivo están ahora en `detalle-cierre-labels.ts` y `fila-gestion-labels.ts`, sin duplicados en `app/`, `components/` ni `lib/`.
- **Desvío R254 (pie `sticky bottom-0`):** es correcto. Solo se aplica con `marco === "pagina"` (`DetalleCierre.tsx:255`), y en `lg` el marco tiene altura fija con un solo scroll. R254 pide un comportamiento medible, y el E2E (d) lo mide: botón dentro de 0..667 con `scrollY = 0`, y la cola debajo del detalle.
- **Excepción de la guardia `cierre-detalle-superficies`:** es correcta y estrecha.
  - Admite un solo literal (archivo + componente + prop + valor `[]`), y un caso nuevo exige que aparezca exactamente una vez. Un `[]` en el rechazado o en el vencido la pondría en rojo.
  - El literal sale de la PA3 aceptada.
  - El `new Set(...)` del `it.each` solo quita archivos repetidos de la lista.
- **Cuatro tests fuera de la lista esperada** (`paginacion-transversal`, `cobertura-tablas.guardia`, `cierre-detalle-superficies.guardia`, `liquidacion-money-safe`): los cuatro son consecuencia directa de retirar la `<DataTable>` por resultado, de la PA3 o del archivo nuevo `CorregirCierre.tsx`, y van con comentario. Las cuentas del censo bajan una cada una (38→37, 39→38, 22→21, 1→0), con su porqué. `intentos-no-alcance-ui.test.ts` estaba en la lista, pero no hizo falta tocarlo.

## Hallazgos

1. **menor**: el comentario de `components/private/cierres/fila/fila-gestion-labels.ts:91-94` dice que `DESHACER_BLOQUEO_TIENDA` es «el mismo texto» que `MSG_GESTION_DE_LA_TIENDA` del servidor, y no lo es.
   - Servidor (`lib/services/CierreDiaService.ts:117`): «…la tienda; solo ella puede corregirlo. Escríbele…».
   - Cliente (`fila-gestion-labels.ts:97`): «…desde su pantalla de ayuda; … Escribile…».
   - La deriva viene de `dev` y se mudó sin tocar un carácter, como pide R244 («el motivo de hoy»). Pero el comentario sigue afirmando algo falso, y el texto lleva voseo («Escribile») en contra del trato en tú (D6). Propongo una ficha aparte que alinee los dos textos en tú.
2. **menor**: voseo heredado en `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:199-200` y `:380-381` («No podés», «Intentá», «No tenés»). Ya estaba en `dev` y R243 pide «el mensaje de hoy». Conviene incluirlo en la misma ficha que el hallazgo 1.
3. **menor**: un rechazado abierto desde la cola que **es** el `aReenviarPrimero` también dice «Lo envías desde esta página cuando sea el siguiente por enviar.» (`detalle-cierre-vista.ts:417-419`). Cumple R252, que vale para todo «Ver» de un rechazado, y la página ya lo pinta con su botón; aun así, la frase es algo imprecisa en ese caso. Para Preview.
4. **menor**: `devolverDeshabilitado` se calcula también cuando `devolver` es `false` (`fila-gestion-vista.ts:539`). Es inocuo, porque el botón solo se pinta con `ofrecidas.devolver`.
5. **menor**: `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts` conserva las columnas por resultado sin consumidor. Está fuera de alcance por spec (SLT-115 «Retirar los componentes de cierre sustituidos», D13).

## Veredicto

**OK.** Sin bloqueantes. Para cerrar la feature faltan T5.1 (`./init.sh` del leader) y la aprobación de Carlos en Preview.
