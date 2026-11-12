# impl SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página»

> frontend_dev · 2026-11-12 · tanda T0-T4 (T5 es del leader). Worktree
> `.worktrees/SLT-109-cierre-dia-hoy-como-pagina`, rama `feature/SLT-109-cierre-dia-hoy-como-pagina`.

## T0 — comprobaciones

- **T0.1** merge-base con `origin/dev` = `790372a9` (merge de #140, SLT-137 «/cierre-dia: cola de
  cierres del mensajero con filtros»). `origin/dev` está ahora en `ec0e5ab3` (+2 commits de
  `chore(arnes)`, sin código de app). El «Ver» de la cola: `ColaCierres` con
  `acciones={{ abrir: abrirDetalle, leyendo: cargandoDetalle }}`, `abrirDetalle(cierre: CierrePasadoDTO)`.
  Los 5 archivos compartidos cuadraban con lo que dejó SLT-137: sin choque con el spec.
  (Va aquí y no en `progress/features/SLT-109.md`, que es del leader.)
- **T0.2** Censo (`grep -rl` en `tests/` y `e2e/`). Además de `## Archivos esperados` salieron:
  `tests/components/paginacion/paginacion-transversal.test.tsx` (la vista agrupada del mensajero),
  `tests/unit/descarga/cobertura-tablas.guardia.test.ts` (totales del censo),
  `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` (`rechazos={[]}` del en curso, PA3) y
  `tests/unit/guards/liquidacion-money-safe.test.ts` (censa `CorregirCierre.tsx`). No hizo falta
  tocar `tests/unit/components/intentos-no-alcance-ui.test.ts` (sigue verde). Los demás hallazgos del
  grep (`TableroDiaFiltro`, `cierres-rediseno`, `cierres-admin`, `CierreDiaDetalleUnico`,
  `contexto-460` y las guardias que solo nombran el archivo) no dependían de lo retirado.
- **T0.3** `pnpm run test:guardias` en limpio: 1 archivo rojo de partida,
  `dependencias-declaradas-presentes.guardia.test.ts` (4 casos: «init.sh ya no tiene el marcador
  >>> FIN PASO 2…»), ajeno a la ficha; sigue igual al final. Ninguna guardia exige consumidor por
  export de `cierre-dia-descarga-columnas.ts`.
- **T0.4** Cifras del mensajero (R77), escritas a mano con su derivación en la cabecera de
  `e2e/cierre-dia.spec.ts` (viejo: Recaudado 11.000 · Gestiones 2 · Tu ganancia 3.400) y de
  `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` (viejo 60.000 · 2 · 1.700; nuevo 110.000 · 4 ·
  6.175), y medidas por el propio E2E en la base desechable `slt109_e2e`.

## Archivos (40 que cuentan para el tamaño; `specs/` y `progress/` no cuentan)

Producción (10): `app/(app)/cierre-dia/page.tsx`, `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`,
`components/private/cierres/detalle/{DetalleCierre.tsx, detalle-cierre-vista.ts, detalle-cierre-labels.ts,
CorregirCierre.tsx (nuevo)}`, `components/private/cierres/fila/{FilaGestion.tsx, GestionesCierre.tsx,
fila-gestion-vista.ts, fila-gestion-labels.ts}`.

Tests (23): `tests/components/{CierreDiaPagina.test.tsx (nuevo), CierreDiaPage, CierreDiaModule,
CierreDiaModule477Correccion, CierreDiaModuleIncidente, CierreDiaComprobanteMarcasDeOrigen,
CierreEvidenciasVarias486, DetalleCierre, FilaGestion}.test.tsx`,
`tests/components/descarga/{CierresDescarga, CierresDescargaColumnas}.test.tsx`,
`tests/components/paginacion/paginacion-transversal.test.tsx`,
`tests/unit/utils/{detalle-cierre-vista, fila-gestion-vista}.test.ts`,
`tests/unit/descarga/{censo-tablas.ts, cobertura-tablas.guardia.test.ts, contadores-cabecera.guardia.test.ts}`,
`tests/unit/guards/{cierre-detalle-superficies.guardia, estado-con-info.guardia, incidente-exhaustividad,
liquidacion-money-safe, pagos-captura.guardia}.test.ts`; **borrado**
`tests/components/CierreDiaMotivoRechazoAutomatico.test.tsx` (el borrado viajó en el commit de T1).

E2E (7): `e2e/{cierre-dia, cierre-vencido-modelo, reglas-bloqueos-cierre, mis-asignaciones,
tope-intentos-por-empresa, tarifas-valor-propio-mensajero, cierre-modelo-nuevo-plan-porcentual}.spec.ts`.

Tamaño medido (`node scripts/tamano-pr.mjs`): **40/40 archivos, 4 428 líneas** (2 232 + / 2 196 −).
No pasa de 40 (PA5). Las líneas doblan la estimación del spec (~2 300): casi todo es reescritura de
tests sobre la lista única.

## Decisiones técnicas (anotadas, sin cambiar el spec)

- **R254**: en vez de una altura fija calculada contra la cabecera de `AppPage` (que en el teléfono
  no cabe: cabecera + cifras + pestañas + pie > 667 px), el pie del marco página es `sticky bottom-0`;
  en `lg` el marco tiene `h-[calc(100dvh-12rem)]` con un solo scroll en el panel. El E2E (d) lo mide
  con `boundingBox` en 375 × 667.
- **R252**: el `rechazado` de la tabla de acciones es `[solicitarRechazado, cerrar]` filtrado por
  `disponibles`; `pieTextoDe` recibe `disponibles` opcional para decir «Lo envías desde esta página…».
- **R253**: `cierreDeLaPagina` también da `error` si la lectura es de otro `cierreId` o si el estado
  leído ya no es re-solicitable (carrera).
- **Guardia `cierre-detalle-superficies`**: admite UN literal, el `rechazos={[]}` del en curso (PA3),
  y un caso nuevo exige que haya exactamente uno.

## Lo que se pierde a la vista (S3-PA6, para que lo vea Carlos en Preview)

La fila única no pinta el **motivo** de la gestión, la **nueva fecha** de un reprogramado, la
**ubicación** ni la marca **«La tienda»** (S3-PA6 de SLT-101, ya vigente en el detalle de un cierre
pasado). Con la tabla en vivo retirada (R242, R255) eso deja de verse en el cierre de hoy. Lo de la
tienda sigue dicho en el «Devolver a gestión» deshabilitado con su motivo (R244). Por eso se borró
`CierreDiaMotivoRechazoAutomatico.test.tsx` (ficha 408 R11: su única superficie en vivo era la celda
«Motivo») y el bloque 237/R41 de `CierreDiaModule.test.tsx`.

## R → test

| R | Test |
|---|---|
| R4 | `tests/unit/utils/detalle-cierre-vista.test.ts` › SLT-109 › R4, R246 (rechazado + bloqueado; en curso + bloqueado + motivo; ninguna) |
| R12 | `DetalleCierre.test.tsx` › R12; `CierreDiaPagina.test.tsx` › R245, R250, R251 |
| R61 | `CierreDiaPagina.test.tsx` › R240 / R61, R243; `CierreDiaPage.test.tsx` › R1; `e2e/cierre-dia.spec.ts` (a) |
| R62 | `CierreDiaPagina.test.tsx` › R240 rechazado; `CierreDiaModule477Correccion.test.tsx` › 477 → SLT-109 |
| R63 | `CierreDiaPagina.test.tsx` › R240 vencido, R249; `e2e/cierre-vencido-modelo.spec.ts` pasos 2-3 |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censa `CorregirCierre.tsx`) |
| R72 | sin cambios en `lib/` ni `db/` (T5.2 del leader) |
| R77 | `e2e/cierre-dia.spec.ts` (a) viejo 11.000 / 2 / 3.400; `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` viejo 60.000 / 2 / 1.700 y nuevo 110.000 / 4 / 6.175 |
| R240 | `detalle-cierre-vista.test.ts` › R240 (3) y R253; `CierreDiaPagina.test.tsx` › R240 (3); `CierreDiaPage.test.tsx` › SLT-109 |
| R241 | `CierreDiaPagina.test.tsx` › R241 (cabecera, tres cifras, sin empresa); `DetalleCierre.test.tsx` › SLT-109 (R241); `detalle-cierre-vista.test.ts` › R241 |
| R242 | `CierreDiaPagina.test.tsx` › R242; `CierreDiaModule.test.tsx` › R3/R242 |
| R243 | `CierreDiaPagina.test.tsx` › R61, R243 (ok) y R243 (conflict); `CierreDiaModule.test.tsx` › feature 67; `e2e/cierre-dia.spec.ts` (b) |
| R244 | `FilaGestion.test.tsx` › SLT-109 (R244) ×3; `fila-gestion-vista.test.ts` › SLT-109 (R244); `CierreDiaModule.test.tsx` › 237/D3 |
| R245 | `CierreDiaPagina.test.tsx` › R245 (2); `DetalleCierre.test.tsx` › SLT-109 (R245); `detalle-cierre-vista.test.ts` › R245 |
| R246 | `CierreDiaPagina.test.tsx` › R246 (2); `CierreDiaModule.test.tsx` › 271 (avisoDeBloqueo); `detalle-cierre-vista.test.ts` › R4, R246 |
| R247 | `CierreDiaPagina.test.tsx` › R247; `CierreDiaModule477Correccion.test.tsx` › R247 (×3) |
| R248 | `CierreDiaModule477Correccion.test.tsx` › R248 (×3) |
| R249 | `CierreDiaPagina.test.tsx` › R249; `e2e/cierre-vencido-modelo.spec.ts` paso 2 |
| R250 | `CierreDiaPagina.test.tsx` › R250; `CierreDiaModule477Correccion.test.tsx` › R28 (×5) |
| R251 | `CierreDiaPagina.test.tsx` › R251; `e2e/cierre-vencido-modelo.spec.ts` paso 3 |
| R252 | `CierreDiaPagina.test.tsx` › R252 (×3); `DetalleCierre.test.tsx` › SLT-109 (R252); `detalle-cierre-vista.test.ts` › R252 (×2) |
| R253 | `CierreDiaPage.test.tsx` › `no_encontrada` y excepción; `CierreDiaPagina.test.tsx` › R253 (×2) |
| R254 | `e2e/cierre-dia.spec.ts` (d) 375 × 667 |
| R255 | `CierreDiaPagina.test.tsx` › R255 (en curso, vencido, rechazado) |
| R256 | `CierreDiaModuleIncidente.test.tsx` › R256 (×4); `descarga/CierresDescarga.test.tsx` (una descarga, sin URL, etiquetas) |

## Comandos y salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0 (sin el heap ampliado, tsc
  se queda sin memoria en esta máquina).
- `pnpm run lint` → 0 errores; 243 avisos, ninguno en un archivo tocado.
- `pnpm exec vitest related --run <10 archivos de producción>` → **61 archivos, 1 211 tests, 0 rojos**.
- Archivos fuera de `related` corridos aparte: `CierreDiaPagina` 24/24, `CierreDiaPage` 8/8,
  `CierreDiaModule` 66/66, `477Correccion` 14/14, `Incidente` 9/9, `ComprobanteMarcas` + `486` 15/15,
  `CierresDescarga` 35/35, `CierresDescargaColumnas` 8/8, `paginacion-transversal` 9/9.
- `pnpm run test:guardias` → 4 852 verdes, 4 rojos: los 4 de
  `dependencias-declaradas-presentes.guardia.test.ts`, los mismos de partida (T0.3), ajenos.
- Base desechable `slt109_pagina` (vitest) y `slt109_e2e` (E2E): `DROP/CREATE` + `prisma migrate
  deploy` + `db:seed`. **Aviso del leader (15:12)**: el `prisma generate` de SLT-123 dejó el cliente
  compartido esperando `cierre_dia.pago_independiente_efectivo`; se añadió SOLO a esas dos bases con
  `ALTER TABLE cierre_dia ADD COLUMN IF NOT EXISTS pago_independiente_efectivo boolean NOT NULL DEFAULT false`
  (hacía caer `tests/integration/db/zona-central-guarda-y-rastro.test.ts`; con la columna, 17/17).
  Ningún archivo de la rama la usa.
- ⚠️ Incidente propio: el primer intento de preparar `slt109_pagina` falló a mitad de cadena y
  `pnpm run db:seed` corrió una vez SIN la URL desechable, es decir contra la base de `.env`. El seed
  es de catálogos con `upsert` por `value` (rol, order_status, vehiculos): idempotente, no borra ni
  duplica. Lo digo para que conste.

## Mutaciones (16/16 muertas)

Arnés en el scratchpad (`mutar.mjs`): aplica, corre los tests del R, restaura con `git checkout` y
comprueba que el archivo quedó igual. Autocomprobación: corrida sin mutar verde (91/91) y una mutación
repetida a mano cae por aserción (`R249: … SIN «Devolver a gestión»`).

| R | Mutación | Resultado |
|---|---|---|
| R240 | `cierreDeLaPagina` ignora `aReenviarPrimero` | rojo |
| R4/R246 | franja de bloqueo solo en `vencido` | rojo |
| R245 | la vista copia `motivoBloqueo` aunque pueda solicitar | rojo |
| R252 | el pie del rechazado sin envío dice el texto de siempre | rojo |
| R249 | `devolver` también en el vencido | rojo |
| R245 | quitar `deshabilitadas.solicitar` | rojo |
| R246 | pintar un aviso de bloqueo fuera del detalle | rojo |
| R252 | el «Ver» de un rechazado abre en solo lectura | rojo |
| R252 | sin relectura tras deshacer en el modal | rojo |
| R253 | el modo `error` no pinta nada | rojo |
| R256 | título de la descarga distinto | rojo |
| R240 | `page.tsx` lee otro `cierreId` | rojo |
| R244 | quitar la condición `desdeAyudaTienda` | rojo |
| R244 | ignorar `enVuelo` | rojo |
| R248 | «Ir a Entregas» también en la ya rehecha | rojo |
| R241 | la cabecera no salta las partes vacías | rojo |

## E2E (T4.4)

Candado `scratchpad/e2e.lock`, puerto 3000, base nueva `slt109_e2e`, `next build` con
`NEXT_PUBLIC_APP_URL=http://localhost:3000`. Los 7 specs:
`E2E_PUERTO=3000 pnpm exec playwright test <7 specs> --reporter=list`.

- Corrida 1: **50 passed** (5,3 min), 0 failed, 0 flaky, 0 skipped.
- Corrida 2 (misma base): **50 passed** (6,2 min), 0 failed, 0 flaky, 0 skipped.

Logs: `scratchpad/slt109/e2e1.log`, `e2e2.log`.

## Veredicto

T0-T4 hechas; unit, componentes, guardias (salvo el rojo de partida ajeno) y los 7 E2E verdes; 40/40 archivos.

