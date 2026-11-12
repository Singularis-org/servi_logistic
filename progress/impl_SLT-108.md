# impl SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» — S10a (frontend_dev)

Rama `feature/SLT-108-cierre-dia-cola-unica`, worktree `.worktrees/SLT-108-cierre-dia-cola-unica`.
Spec: `specs/SLT-108-cierre-dia-cola-unica/` (v3). Sin `lib/`, `db/` ni Server Actions; sin
dependencias nuevas. Nada de lo de `## Fuera de alcance → SLT-137` (cola, filtros, pendiente de pago).
Grafo: no se usó (el índice de este worktree no existe); todo con Grep/Read.

## Entorno

- `node_modules`: junction al del checkout principal (`mklink /J`, sin `MSYS_NO_PATHCONV`).
- `.env` presente, comprobado solo con booleanos (`has`, `pg`, `local`: true). `DATABASE_URL`
  exportada sin comillas y con solo el nombre de la base cambiado: `slt108_t0` (vitest, mutaciones y
  gate), `slt108_e1`, `slt108_e2`, `slt108_e3` (una por corrida E2E). Cada una con
  `prisma migrate deploy` + `db:seed`. Sin `migrate reset`, sin `prisma generate`, sin dev server.
- E2E con el candado `scratchpad/e2e.lock` (mkdir/rmdir en `trap EXIT`).

## T0

- **T0.1** `git fetch` + `git merge origin/dev` (sin rebase): `origin/dev` = `7bedada3` (trae el #131
  de SLT-103 «Diálogos del módulo de cierres y trato tú»), merge `f8870761`, merge-base = `7bedada3`.
  API de evidencia tras #131: `GestionesCierre.onVerEvidencia?: (evidencia: EvidenciaAbierta) => void`,
  `EvidenciaAbierta = { urls: readonly string[]; contexto?: string }`; `/cierre-dia` pasa su
  `setEvidencia` (visor único `VisorEvidencia`). Anotado en `progress/features/SLT-108.md`.
- **T0.2** Censo (`grep -rl` en `tests/` y `e2e/`): coincide con `## Archivos esperados`. De más, sin
  cambio necesario (verdes en `vitest related`):
  - `CierreDiaModule477Correccion.test.tsx` (solo mockea `verCierrePasado`);
  - `tests/unit/services/cierre-dia-service.test.ts` (servicio, no se toca);
  - `tests/components/descarga/CierresDescargaColumnas.test.tsx` (importa
    `COLUMNAS_DESCARGA_DIA_INCIDENTES`, no afirma su lista);
  - los 18 tests que montan `<CierreFacturaDetalle` SUELTO (el componente sigue existiendo: lo borra
    SLT-115 «Retirar los componentes de cierre sustituidos»).
- **T0.3** Medido en `slt108_e1` con el E2E (c) de `cierre-dia.spec.ts` (tarifa 1.700 / 300, incidente
  «perdido»): la celda «Ganancia» = `"₡0"`. Derivación: `pagoPorResultado` del modelo viejo solo paga
  `entregado`; el incidente da `"0.00"` y `money("0.00")` = «₡0». Escrito a mano en la cabecera del E2E.
- **T0.4** `pnpm run test:guardias` (corrido ya con T1/T2 hechos, no en limpio): 343/344 archivos
  verdes; el único rojo, `dependencias-declaradas-presentes.guardia.test.ts` (4 casos), está en
  `tests/baseline-rojos.json` (init.sh del arnés v2 sin el paso 2 de la ficha 420). No es de esta rama.

## Archivos

Producción:
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` — `DetalleCierre` (mensajero, audiencia
  mensajero, solo lectura, modal) en vez del `Modal` + `CierreFacturaDetalle`; `GestionesCierre` con
  `onVerEvidencia={setEvidencia}` y «Descargar» del mensajero; `SeccionSinGestion`;
  `RechazosDeTiendaCierre`; errores por `toast.error`; «Ver» `disabled` + `aria-busy` mientras lee.
  Incidente: `columnaPago` entre evidencia y acciones; comentario de la 158 reescrito.
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts` — «Ganancia» al final de Incidentes.
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `vistaMensajeroDesdeCierreDia`.
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts` —
  `COLUMNAS_DESCARGA_DETALLE_MENSAJERO`, `filaDescargaDetalleMensajero`.

Tests: `tests/components/CierreDiaDetalleUnico.test.tsx` (nuevo); adaptados `CierreDiaModule.test.tsx`,
`CierreDiaModuleIncidente.test.tsx`, `CierreDiaComprobanteMarcasDeOrigen.test.tsx` (mitad «cierre
pasado»: detalle único; por S3-PA6 la fila ya no lleva la marca ni el motivo),
`CierreEvidenciasVarias486.test.tsx`, `tests/unit/utils/detalle-cierre-vista.test.ts`,
`tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`,
`tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`,
`tests/unit/guards/cierre-detalle-superficies.guardia.test.ts`,
`tests/unit/guards/impresion-flujo.guardia.test.ts`. E2E: `e2e/cierre-dia.spec.ts`,
`e2e/cierres-rediseno.spec.ts`.

Decisión menor: el título del archivo de «Descargar» reutiliza `tituloDescargaGestiones` (el del admin:
«Gestiones del cierre <folio>»).

## Mapa R → test

| R | Test |
|---|---|
| R58 | `CierreDiaModuleIncidente.test.tsx` («Ganancia» tras la evidencia, ₡300); `cierre-dia-descarga-columnas.test.ts`; `e2e/cierre-dia.spec.ts` (c) |
| R59 | `CierreDiaDetalleUnico.test.tsx` (R59, R150, R161); `CierreDiaModule.test.tsx`; `e2e/cierres-rediseno.spec.ts` (mensajero A) |
| R71 | `liquidacion-money-safe.test.ts` (guardias verdes); `detalle-cierre-vista.test.ts` (strings del servidor tal cual) |
| R72 | el diff no toca `lib/`, `db/` ni Server Actions; guardias de dinero verdes |
| R77 | `e2e/cierres-rediseno.spec.ts` (mensajero A y mensajero B) |
| R150 | `CierreDiaDetalleUnico.test.tsx`; `detalle-cierre-vista.test.ts` (SLT-108) |
| R151 | `CierreDiaDetalleUnico.test.tsx` (R151, R152); `cierre-detalle-superficies.guardia.test.ts` |
| R152 | `detalle-cierre-descarga-columnas.test.ts` (SLT-108); `CierreDiaDetalleUnico.test.tsx` |
| R153 | `CierreDiaDetalleUnico.test.tsx` (R153, dos casos); `CierreDiaModule.test.tsx` |
| R154 | `CierreDiaDetalleUnico.test.tsx` (R154); `CierreEvidenciasVarias486.test.tsx` (S3) |
| R161 | `impresion-flujo.guardia.test.ts` (caso del mensajero); `cierre-detalle-superficies.guardia.test.ts` |
| R162 | `CierreDiaModuleIncidente.test.tsx` (`null` → «—»); `cierre-dia-descarga-columnas.test.ts` (`null` → `null`) |

## Mutaciones (todas ROJAS por aserción, revertidas con `git checkout -- <archivo>`)

| # | Mutación | Test | Resultado |
|---|---|---|---|
| 1 | `audiencia="central"` en el detalle | `CierreDiaDetalleUnico` | 7/9 rojos: no hay `dialog` «Detalle del cierre · Tu cierre del día» |
| 2 | `SeccionSinGestion` sin montar | `CierreDiaDetalleUnico` | 1 rojo: falta la región «Pasaron a Novedad interna» |
| 3 | toast de `no_encontrada` → el genérico | `CierreDiaDetalleUnico` | 1 rojo: `errorMock` sin «Este cierre ya no está disponible.» |
| 4 | sin `onVerEvidencia` en `GestionesCierre` | `CierreDiaDetalleUnico` + `486` | rojos: no hay botón «Ver evidencia …» |
| 5 | Incidente sin `columnaPago` | `CierreDiaModuleIncidente` | 2 rojos: cabeceras sin «Ganancia»; celda `undefined` ≠ «—» |
| 6 | `<CierreFacturaDetalle />` de vuelta en `CierreDiaModule.tsx` | las dos guardias | 2 rojos (superficies y impresión) |
| 7 | el adaptador lleva `empresa` con el ingreso de bodega | `detalle-cierre-vista.test.ts` | 2 rojos (objeto literal y «3503.00») |

## Comandos

- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 0, 0 errores.
- lint (eslint de los archivos tocados): `ESLint: No issues found`.
- `vitest run` de los 5 tests de T1/T2.4: 5 archivos, 182 passed. `CierreDiaDetalleUnico`: 9 passed.
  `486` + `MarcasDeOrigen`: 15 passed. `vitest related` de los 4 de producción: 46 archivos, 923 passed.
- `pnpm run test:guardias`: 343/344 archivos; 4 rojos solo en
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`.
- `next build` (`NEXT_PUBLIC_APP_URL=http://localhost:3000`): BUILD_EXIT=0.
- E2E (`next start`, base nueva cada corrida, con candado):
  - `slt108_e1`: `cierre-dia.spec.ts` → 3 passed, E2E_EXIT=0 (medición de T0.3);
  - `slt108_e2`: `--project=dinero` entero (incluye `cierre-dia` y `cierres-rediseno`) → **98 passed**,
    E2E_EXIT=0, sin reintentos;
  - `slt108_e3`: `mis-asignaciones.spec.ts` (el otro que da `grep -rl "cierre-dia" e2e/`) → 4 passed,
    E2E_EXIT=0;
  - `slt108_e4`: `dos-empresas-humo.spec.ts --project=aislamiento` → 18 passed, E2E_EXIT=0.
- `./init.sh` con `slt108_t0`: **INIT_EXIT=0**. typecheck y lint pasan; test:rapido: 388 archivos
  seleccionados (48 por imports + 344 guardias, ninguno fuera del presupuesto), 1278 passed | 1 skipped.
  Aviso de tamaño: **16/40 archivos, 946/1000 líneas** (95 %). Sin rojos fuera del baseline.

## Tamaño

16 archivos y 946 líneas (añadidas + borradas, sin `specs/` ni `progress/`). Por encima de lo estimado
(650-760): sobre todo los tests adaptados y las guardias (el primer `describe` de superficies borró
~60 líneas de casos que ya no tenían a quién mirar). `CierreDiaDetalleUnico.test.tsx` se compactó de
359 a 212 líneas para no pasar el tope, con las mismas aserciones y las mismas mutaciones en rojo.

## Veredicto

SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero», S10a: hecho, gate y E2E en verde, al
95 % del tope de tamaño.
