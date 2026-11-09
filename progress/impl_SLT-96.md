# SLT-96 «Consolidación de ₡0 no se puede marcar recibida» · bitácora de implementación

## T2 · Pantalla (R10-R13) — frontend_dev, 2026-11-09

### Archivos
- `components/shared/monto-cliente.ts`: `esMontoCero` promovido (movido, misma regex `/^-?0(\.0+)?$/`) y
  `montoValidoOCero` nuevo (`/^\d+(\.\d{1,2})?$/`, sin exigir `[1-9]`; money-safe, solo texto).
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`: re-exporta `esMontoCero`. Sus tres
  importadores (`cierre-factura`, `CascadasCierreMensajero`, `SaldosSatelitesTable`) no cambian el import;
  el typecheck lo confirma.
- `components/shared/conciliacion/conciliacion-labels.ts`: `MARCAR_RECIBIDO_ERROR.montoConCero`.
- `components/shared/conciliacion/MarcarRecibidoDialog.tsx`: `declaradoCero = esMontoCero(declarado)`,
  `montoOk = declaradoCero ? montoValidoOCero(monto) : montoValido(monto)` y el aviso del campo según la rama.
  Los comentarios están al día.
- Tests nuevos: `tests/unit/components/monto-cliente-cero.test.ts` (MC) y
  `tests/components/MarcarRecibidoDeclaradoCero.test.tsx` (DLG).

### Desviación del design, y por qué (R13)
Con el código anterior, el aviso del campo no se podía ver nunca. Solo lo ponía `confirmar`, y el `Modal`
no llama a `onConfirm` con `confirmDisabled` (`components/shared/Modal.tsx:197`, el botón está
`disabled`). Por eso R13 no tenía ningún camino visible. Añadí un `onBlur` al campo que pinta el aviso de
la rama que aplica. Esto también cambia la rama de declarado ≠ 0: ahora se ve al salir del campo el aviso
«mayor que cero» de siempre, que antes no se veía. El texto no cambia. Es un cambio de 1 línea dentro del
mismo diálogo y no hay pantalla nueva. Lo dejo anotado para el reviewer.

### Mapa R → test (DLG = `tests/components/MarcarRecibidoDeclaradoCero.test.tsx`, MC = `tests/unit/components/monto-cliente-cero.test.ts`)
| R | Test |
|---|---|
| R10 | DLG «R10 — declarado 5000.00 con el monto en 0: el botón sigue deshabilitado» |
| R11 | DLG «R11 — declarado 0.00: abre con 0.00 precargado, el botón habilitado, y envía montoRecibido 0.00»; «R11 — declarado 0.00 con «0» tecleado…»; «R11 — en modo corrección (montoActual 10.00)…»; MC `esMontoCero` y `montoValidoOCero` (`it.each` con "0", "0.0", "0.00", "-0.00", "0.01", "10", "", "0.000") |
| R12 | DLG «R12 — el validation_error del servidor se pinta bajo el campo, el diálogo sigue abierto y conserva el monto». Usa el literal «Solo se puede registrar 0 cuando lo declarado es 0.» y comprueba la descripción accesible del campo, `aria-invalid`, que no se llama `onOpenChange(false)` y que el valor sigue en "0.00" |
| R13 | DLG «R13 — declarado 0.00 con «abc»: el aviso del campo dice «de cero o más»»; «R13 — declarado 5000.00 con «abc»: sigue el aviso «mayor que cero»» |

### Mutaciones (todas medidas en rojo; el archivo se restaura después de cada una y se comprueba con `cmp`)
Comando: `pnpm exec vitest run tests/unit/components/monto-cliente-cero.test.ts tests/components/MarcarRecibidoDeclaradoCero.test.tsx`

| # | Mutación | Resultado |
|---|---|---|
| M1 (R10) | `montoOk = montoValidoOCero(monto)`: el cero se habilita sin mirar lo declarado | 1 failed: R10 |
| M2 (R11) | `montoOk = montoValido(monto)`: solo la condición de antes | 4 failed: los 3 R11 y R12 |
| M3 (R12) | `onOpenChange(false)` ante `validation_error` | 1 failed: R12 |
| M4 (R13) | el mismo aviso en las dos ramas (`montoConCero` → `monto`) | 1 failed: R13 con declarado 0 |
| M5 (MC) | `esMontoCero` sin `-?` | 1 failed: «"-0.00" es cero» |
| M6 (MC) | `montoValidoOCero` vuelve a exigir `[1-9]` | 4 failed: "0", "0.0", "0.00", " 0.00 " |
| M7 (MC) | `montoValidoOCero` acepta 3 decimales | 1 failed: «"0.000" NO tiene forma válida» |

### Salida de los comandos
Base: `DATABASE_URL` se exportó a una URL desechable e inalcanzable (`127.0.0.1:1`) para que ningún test
tocara la base local. Los tests de T2 no usan base de datos.

- Tests nuevos: `Test Files 2 passed (2) · Tests 34 passed (34)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `TC_EXIT=0`. Hubo que subir la memoria
  porque la primera corrida cayó por falta de memoria (exit 134) mientras T1 corría en paralelo. El
  typecheck incluye el árbol de T1 tal como estaba en ese momento.
- `pnpm exec eslint` sobre los 6 archivos de T2: `LINT_EXIT=0`.
- `pnpm exec vitest related --run` sobre los 6 archivos de T2: `Test Files 1 failed | 157 passed (158) ·
  Tests 2551 passed | 20 skipped`. El único rojo es
  `tests/integration/db/descarga-pago-plataforma-sl45.test.ts`, que falla con «Can't reach database server
  at 127.0.0.1:1»: es la base inalcanzable puesta a propósito, no T2. Lo cubre el gate de T3 con la base
  desechable real.

### Veredicto T2
R10-R13 implementados, con test cada uno y sus mutaciones medidas en rojo. Hay una desviación menor
(`onBlur` para que R13 se vea), anotada arriba para el reviewer.
