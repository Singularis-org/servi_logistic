# impl SLT-171 — «Wallet de satélites: la nota del saldo dice que el dinero entró al aprobar, y entra al conciliar»

Ruta directa (sin spec). Frontend: solo texto de la nota y su JSDoc.

## Archivos
- `app/(app)/wallet/satelites/_components/satelites-labels.ts` — `SALDO_NO_ES_CAJA_NOTA_A` y el JSDoc.
- `tests/integration/wallet-satelites.test.tsx` — test «⭑ LA NOTA…» (jsdom con Server Actions dobladas; no toca Postgres).

## Causa (evidencia SLT-73)
- `specs/SLT-73-dinero-satelite-al-conciliar/requirements.md:86` (R1): aprobar un `cierre_dia` con destino
  `bodega_satelite` NO escribe en los libros; `:124` (R10): se escriben al marcar recibida (conciliar) la consolidación.
- `lib/repositories/CierresAdminRepository.ts:2681-2696`: al aprobar, `asentarCierreDia` solo si `destinoTipo === "bodega_central"`.
- `lib/repositories/CierresBodegaAdminRepository.ts:801-812` (`marcarConciliado`): asienta los cierres `bodega_satelite` aprobados de la consolidación.

## Texto nuevo
«El saldo no es un movimiento de caja. Ese dinero entra a la caja de la empresa cuando se concilia la
consolidación de la bodega, no antes. Lo que esta pantalla dice es **dónde está físicamente**: cuánto
queda en manos de cada bodega esperando llegar a la central.»

## R → test
- Nota corregida → `tests/integration/wallet-satelites.test.tsx` «⭑ LA NOTA que impide contar dos veces…»
  (literal esperado + negativa `not.toHaveTextContent(/cuando se aprobó el cierre/)`).

## Salida
- Rojo (antes del arreglo): `Tests 1 failed | 38 skipped` — Expected «Ese dinero entra a la caja de la empresa
  cuando se concilia…», Received «…ya entró a la caja de la empresa cuando se aprobó el cierre de cada mensajero…».
- Verde: `vitest run tests/integration/wallet-satelites.test.tsx tests/components/SaldosSatelitesTable.test.tsx`
  → `Test Files 2 passed (2) · Tests 43 passed (43)`.
- Lint de los 2 archivos: exit 0.
- Typecheck: ver informe (primer intento abortó por memoria de V8, exit 134; reintento con heap 8 GB).

## Otros textos con la afirmación vieja (no tocados)
- `app/(app)/wallet/satelites/_components/SaldosSatelitesTable.tsx:398-399` — comentario JSX sobre esta misma nota:
  «Ese dinero YA entró a la caja cuando se aprobó el cierre de cada mensajero». No se renderiza.
- Sin hallazgos en `docs/` ni en textos de UI renderizados.

Veredicto: nota corregida y cubierta con literal + negativa; rojo→verde confirmado.
