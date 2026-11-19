# impl SLT-103 «Diálogos del módulo de cierres y trato tú» — rebanada 1 (frontend_dev)

Rama `feature/SLT-103-dialogos-trato-tu`, worktree `.worktrees/SLT-103-dialogos-trato-tu`, base
3d6b736f. Spec: `specs/SLT-103-dialogos-trato-tu/`. Sin `lib/`, `db/` ni Server Actions; sin
dependencias nuevas. Grafo: no se usó (el índice de este worktree no existe, como anota el design);
todo con Grep/Read.

## Entorno

- `node_modules`: junction al del checkout principal (`mklink /J`, sin `MSYS_NO_PATHCONV`).
- `.env` presente (comprobado solo con booleanos). `DATABASE_URL` exportada sin comillas y con solo
  el nombre de la base cambiado: `slt103_t0` (vitest y gate), `slt103_e2e_dinero` y
  `slt103_e2e_humo` (E2E, una por corrida). Cada una con `prisma migrate deploy` + `db:seed`.
- `origin/dev` va 2 commits por delante de la base (solo docs: cierres de SLT-99 y SLT-126); no se
  mezclaron (no tocan nada de esta rebanada).

## T0 — Línea base

`./init.sh` con `slt103_t0`: **INIT_EXIT=1**, pero el único rojo fue mío: el gate corría mientras
creaba `components/private/cierres/dialogos/*` y `liquidacion-money-safe.test.ts` (censo de
`components/private/cierres/**`) los vio fuera del censo. Todo lo demás verde (typecheck, lint,
guardias, validador, perfil; 1455 passed). Se añadieron al censo y el gate de T6 lo cubre.

Tests que había de los archivos citados en T0:
- `CierreEvidenciasVarias486.test.tsx`: 4 casos de `BotonesEvidencia` (R12-R15, un botón por foto)
  + S1 (2), S2 (1), S3 (3) con «Ver evidencia 1..N».
- `FilaGestion.test.tsx`: l.336 (`onVerEvidencia` con la URL) y l.372-378 («un botón por foto»).
- `CierreDetalleIncidente.test.tsx`: `montar` con `(url: string) => void` y el caso de la URL firmada.
- `CierreBodegaDetalleGestiones.test.tsx`: R12 l.509 (img con la URL firmada).
- `CierreDiaModule.test.tsx`: «Solicitar cierre» OK/conflict, sin caso de resumen.
- `CierresAdminPagoMensajero.test.tsx`: R17 (red, `excede`, `forbidden`), sin caso `sin_saldo`.

## Archivos

Producción (12):
- `components/private/cierres/dialogos/dialogos-labels.ts` (nuevo)
- `components/private/cierres/dialogos/VisorEvidencia.tsx` (nuevo)
- `app/(app)/cierres-admin/_components/botones-evidencia.tsx` (un botón con contador)
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (se borra el `VisorEvidencia` viejo y su import de `Modal`)
- `app/(app)/cierres-admin/_components/cierre-factura.tsx` (tipo `EvidenciaAbierta`, `contexto`)
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (visor nuevo)
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` (visor nuevo)
- `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts` (`sinSaldo`)
- `app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx` (`mensajeSinSaldo`)
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` (visor nuevo, `columnaEvidencia` con contexto, resumen)
- `components/private/cierres/fila/FilaGestion.tsx` (contexto)
- `components/private/cierres/fila/GestionesCierre.tsx` (tipo)

Tests (10; 8 previstos + 2 que el cambio obligó):
- `tests/components/VisorEvidencia.test.tsx` (nuevo)
- `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (nuevo)
- `tests/components/CierreEvidenciasVarias486.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/CierreDetalleIncidente.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/unit/guards/liquidacion-money-safe.test.ts` (no previsto: su censo cubre `components/private/cierres/**`; entran los 2 archivos nuevos)
- `tests/components/descarga/CierresDescarga.test.tsx` (no previsto: su anti-vacuidad buscaba «Ver evidencia 3»; ahora «Ver evidencia (3)». Lo destapó `vitest related`)

## Desviación del design (anotada)

- `VisorEvidencia`: el design pedía `useState(0)` + `useEffect` que resetea a 0 al cambiar
  `evidencia`. El lint del proyecto lo rechaza (`react-hooks/set-state-in-effect`). Se guarda el
  índice junto al objeto abierto (`{ de, indice }`) y se usa 0 si el objeto cambió: misma conducta
  (R139 «al volver a abrir, foto 1»), probada por «cerrar y reabrir con otro objeto».

## Mapa R → test

| R | Test |
|---|---|
| R53 | `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` («R53: ningún archivo del censo importa ui/dialog…», «la excepción sigue existiendo…») |
| R54 | `CierreEvidenciasVarias486.test.tsx` («R54/R138: tres evidencias → UN botón…», «R14/R54: … TODAS las URL…», S1-S3); `VisorEvidencia.test.tsx` (Anterior/Siguiente, «foto i de n») |
| R55 | `CierreDiaModule.test.tsx` («SLT-103 R55/R140: … resume Gestiones, Recaudado y Tu ganancia…») |
| R57 | `CierresAdminPagoMensajero.test.tsx` («SLT-103 R57/R141 — `sin_saldo` habla del mensajero…») |
| R137 | guardia («R137: «Evidencia de la gestión» solo vive…», «R137: `function VisorEvidencia` solo…»); `VisorEvidencia.test.tsx` (título, alt, Cerrar, Escape); `CierreBodegaDetalleGestiones.test.tsx` (R12 + descripción «Orden REM-N1 · Nora Novedad»); `CierreEvidenciasVarias486.test.tsx` (descripción en /cierre-dia); `FilaGestion.test.tsx` y `CierreDetalleIncidente.test.tsx` (contexto entregado) |
| R138 | `CierreEvidenciasVarias486.test.tsx` (1, n y 0 fotos); `FilaGestion.test.tsx` («Ver evidencia (2) …»); `VisorEvidencia.test.tsx` («R138: con una foto no hay…») |
| R139 | `VisorEvidencia.test.tsx` (foto 1, Siguiente ×2, Anterior, reabrir, sin contexto) |
| R140 | `CierreDiaModule.test.tsx` (orden y valores: «Gestiones» «4», «Recaudado» «₡285.275», «Tu ganancia» «₡45.000,55») |
| R141 | `CierresAdminPagoMensajero.test.tsx` (primera frase; la segunda va en SLT-133) |

Nota R140: `money("285275.00")` da «₡285.275» (sin «,00»: el formato del proyecto omite los
decimales cero, como «₡1.500» en el mismo archivo). El literal del test es ese.

## Mutaciones (script con copia y restauración; árbol comprobado igual después)

| # | Mutación | Test | Resultado |
|---|---|---|---|
| M1 | «Siguiente» sin `disabled` | `VisorEvidencia` | ROJO: `expect(element).toBeDisabled()` en «Siguiente ×2…» |
| M2 | visor con 1 foto muestra «Anterior» (`n > 1` → `n >= 1`) | `VisorEvidencia` | ROJO: «R138: con una foto…», `expected <button> to be null` |
| M3 | `RegistrarPagoMensajeroDialog` sin `mensajeSinSaldo` | `CierresAdminPagoMensajero` | ROJO: `toHaveTextContent` (sale «Esta tienda…») |
| M4 | Recaudado con `totales.efectivo` | `CierreDiaModule` | ROJO: `toEqual` de los pares del `<dl>` |
| M5 | `title="Evidencia de la gestión"` en `CierreDiaModule.tsx` (contraprueba real de la guardia) | guardia | ROJO: «R137: … solo vive en dialogos-labels.ts», `expected [Array(1)] to deeply equal []` |
| M6 | el botón entrega solo la 1.ª URL | `CierreEvidenciasVarias486` | ROJO: 7 casos (R14/R54, S1, S2, S3) |
| M7 | contexto sin destinatario en `FilaGestion` privada | `FilaGestion` | ROJO: `toHaveBeenCalledWith` del objeto |

**7 ROJO / 7**, todos por aserción. Revertidas.

## Salidas

Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC_EXIT=0`.
Lint de los archivos tocados: 0 problemas (tras el cambio del visor descrito arriba).

`vitest related --run` de los 23 archivos tocados (base `slt103_t0`): 90 archivos, 1608 tests,
1 rojo: `tests/components/descarga/CierresDescarga.test.tsx` (buscaba «Ver evidencia 3»). Se
corrigió el literal a «Ver evidencia (3)» y el archivo quedó en 35/35 verdes.

Gate `./init.sh` (T6, base `slt103_t0`), log con `INIT_EXIT` escrito dentro:

```
✓ typecheck paso
✓ lint paso
Test Files  100 passed (100) · Tests 1526 passed
Test Files  100 passed (100) · Tests 1326 passed
Test Files  100 passed (100) · Tests 1640 passed
Test Files  100 passed (100) · Tests 1328 passed | 1 skipped
Test Files  28 passed (28)   · Tests 530 passed
! SLT-103: el PR se acerca al tamano maximo (22/40 archivos, 901/1000 lineas)
INIT_EXIT=0
```

Tamaño: 90 % de las líneas (el script suma altas y bajas: unas 461 del diff, de ellas 220 borradas
—la 486 reescrita y el visor viejo— y unas 436 de los 4 archivos nuevos). T6 pedía < 80 %: **no se
cumple**. Es aviso, no error; lo decide el leader.

E2E (`next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000` + Playwright con `next start`,
una base nueva por corrida, `E2E_EXIT` escrito dentro del log):

```
== base dinero       MIG=0
== next build        BUILD_EXIT=0
== playwright dinero 95 passed (4.6m)      E2E_EXIT_DINERO=0
   (incluye cierres-admin 3, cierre-bodega-satelite 4, cierre-dia 2: todos ok)
== base humo         MIG=0
== dos-empresas-humo --project=aislamiento  18 passed (1.4m)   E2E_EXIT_HUMO=0
```

Pendiente del leader: Preview con Carlos (texto de sin saldo, botones bajo la foto).

**Veredicto:** rebanada 1 hecha; gate y E2E verdes, 7/7 mutaciones en rojo; tamaño al 90 %.
