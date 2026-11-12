# SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» — tasks (S10b, sin filtros)

> **Zona:** fullstack. T1 = `backend_dev` (`lib/` y sus tests); T2 = `frontend_dev` (`components/`,
> `app/(app)/cierre-dia/` y sus tests). Un commit por task.
>
> **Alcance:** R60, R71, R72, R155-R160, R163-R166, R180, R181. El buscador y los filtros (R167-R179)
> son de SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero».
>
> **Antes de empezar** (memorias «Worktree sin .env = gate ciego» y «vitest related toca la base
> local»):
> - copia `.env` al worktree antes del primer gate;
> - exporta la base desechable antes de cualquier `vitest`.
>
> **Orden con SLT-106 «Bodega satélite: A consolidar con la cola única»:** SLT-106 mergea antes.
> T1 y T2.1 no tocan archivos de SLT-106 y pueden empezar ya; T2.2 en adelante esperan a que
> SLT-106 esté en `origin/dev`.

## Tamaño

Tope (`arnes.config.json` no fija `gate.tamano_pr`; rige el de `docs/gate.md`): 40 archivos y 1 000
líneas añadidas + borradas.

- **Archivos:** 22 de 40 (55 %), por debajo del aviso del 80 % (32).
- **Líneas:** ~850-950 (85-95 %). Cabe, con aviso. Referencia: SLT-108 cerró con 946 (95 %).

| Bloque | Líneas |
|---|---|
| Servidor: interfaz, servicio, acción | ~60 |
| `ColaCierres.tsx` (tres puntos) | ~20 |
| `TablaColaPropia.tsx` + `cola-propia-vista.ts` | ~150 |
| `CierreDiaModule.tsx` (quita ~60, pone ~35) | ~95 |
| Test de servicio + cableado | ~125 |
| Integración Postgres real | ~150 |
| `cola-propia-vista.test.ts` + `CierreDiaColaPropia.test.tsx` | ~190 |
| Tests y guardias adaptados (8) | ~90 |
| E2E (2) | ~50 |
| **Total** | **~930** |

**Disparo:** T1.4 y T2.6 miden con `./init.sh`. Si tras T1 la proyección (medido + lo que falta de la
tabla) pasa de 1 000, **para** y avisa al leader: decide Carlos entre el corte en tres de
`requirements.md > PA1` (la cola sale con «Sin dato») o la línea `tamano-pr-aceptado`.

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** Actualiza la rama desde `origin/dev` (`git fetch` + merge; comprueba el `merge-base`).
  Mira si SLT-106 ya está mergeado (`git log origin/dev --oneline | grep SLT-106`).
  **Hecho:** SHA de `origin/dev` y estado de SLT-106 (mergeado o no) anotados en
  `progress/features/SLT-137.md`.
- [ ] **T0.2** Repite el censo de `design.md > Tests y guardias que cambian` con `grep -rl` en `tests/`
  y `e2e/`: «Cierres solicitados», `ListaComprobantes`, `CierreFacturaResumenPropio`,
  «Ver del cierre», `PAGINACION_PASADOS_LABEL`. En `ColasPaginacion.test.tsx`, mira si la mención de
  `ListaComprobantes` es de `/cierre-dia`; si no lo es, sale de `## Archivos esperados`.
  **Hecho:** la lista coincide con `## Archivos esperados`, o el leader tiene el archivo de más.
- [ ] **T0.3** `pnpm run test:guardias` en limpio. **Hecho:** guardias verdes de partida, anotadas.

## T1 — Servidor: pendiente de pago (backend_dev; depende de T0) [P con T2.1]

- [ ] **T1.1** `ICierreDiaService.ts`: `CierrePasadoDTO.pendientePagoMensajero?: string | null` y la
  interfaz `LecturasPendienteCierre` (`design.md > 1. Contrato`). `CierreDiaService.ts`: parámetro
  opcional `pendientes` al final del constructor y helper privado `conPendientePago` llamado desde
  `listarCierresPasadosPaginado`. Test nuevo `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
  con dobles:
  - página de 1 cierre y página de 10 → `sumarVigentesPorCierre` y `sumarPremiosVivosPorCierre` se
    llaman **una vez** cada una en las dos (R165);
  - solo los ids de `aprobado` llegan a las lecturas; un `solicitado` sale `null` (R164);
  - sin `pendientes`, ningún item tiene la propiedad (`not.toHaveProperty`) y las lecturas no se
    llaman (R165);
  - `listarCierresPasadosCompleto` no cambia (no llama a las lecturas).

  **Hecho:** el test verde; `vitest related` de `CierreDiaService.ts` verde (las 30+ construcciones
  de hoy compilan sin tocarlas).
- [ ] **T1.2** `lib/actions/cierre-dia.ts > buildService()`: inyecta
  `{ liquidaciones: new LiquidacionPagoRepository(prisma), premios: new PagoMensajeroMovimientoRepository(prisma) }`.
  Test nuevo `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`, patrón de
  `gestion-desde-ayuda-cableado.test.ts`: se ejecuta `listarCierresPasadosPaginado` **sin** servicio
  inyectado, con la clase del servicio mockeada, y se comprueba que el último argumento del
  constructor trae los dos repositorios reales (`toBeInstanceOf`).
  **Hecho:** verde; y en rojo si se borra la inyección (comprobado a mano una vez, anotado).
- [ ] **T1.3** `tests/integration/db/cierre-dia-pendiente-pago.test.ts` contra Postgres real, con la
  tabla C1-C4 + M2 y las cinco aserciones de `design.md > Prueba de integración`. Datos sembrados por
  el propio test; falla si el catálogo no está.
  **Mutaciones** (una a una, a mano, se revierten): las cinco de `design.md`. Cada una debe poner el
  test en rojo.
  **Hecho:** verde con base desechable, y las cinco mutaciones en rojo, con la aserción que cae
  anotada en `progress/impl_SLT-137.md`. Si alguna sobrevive, el test no está terminado.
- [ ] **T1.4** `./init.sh` verde. **Hecho:** tamaño medido y anotado; aplica el disparo de `## Tamaño`.

## T2 — Pantalla: la cola con rol mensajero (frontend_dev)

- [ ] **T2.1** [P con T1] `components/private/cierres/cola/cola-propia-vista.ts`: textos,
  `columnasColaPropia`, `destinoPropio`, `pagoPropioDe`, `textoPagoPropio` (`design.md > Lógica
  pura`). Test nuevo `tests/unit/utils/cola-propia-vista.test.ts`:
  - `pagoPropioDe`: rechazado con motivo, rechazado sin motivo (y con `""`), aprobado `"12.50"` →
    pendiente, aprobado `"0.00"` → liquidado, aprobado sin campo → sinDato, aprobado `null` →
    sinDato, solicitado → nulo, vencido → nulo (R157);
  - los textos de `design.md > Textos` como literales (R155, R160, R180);
  - las ocho columnas en orden (R60, R156); `destinoPropio` de los dos tipos, sin zona (R156).

  **Hecho:** verde. El tipo `CierrePasadoDTO.pendientePagoMensajero` puede venir de T1.1; si T1.1 no
  está, se declara el campo igual (es aditivo) y se reconcilia al traer T1.
- [ ] **T2.2** (depende de T0.1 con SLT-106 mergeado y de T2.1) `TablaColaPropia.tsx` nuevo y los tres
  cambios en `ColaCierres.tsx` (`design.md > Props nuevas`). No toques `cola-cierres-vista.ts` ni
  `cola-cierres-labels.ts`.
  **Hecho:** `typecheck` verde; `tests/components/ColaCierres.test.tsx` y `ColaCierresBodega.test.tsx`
  verdes **sin cambios** (R163).
- [ ] **T2.3** (depende de T2.2) `CierreDiaModule.tsx`: monta `ColaCierres tipo="propios"`
  (`design.md > Montaje`), quita `ListaComprobantes` y `CierreFacturaResumenPropio` de los imports y
  del JSX. Test nuevo `tests/components/CierreDiaColaPropia.test.tsx`, montando `CierreDiaModule` con
  una página de cuatro cierres (aprobado con pendiente `"300.00"`, aprobado `"0.00"`, rechazado con
  motivo, solicitado) y `total` 7:
  - descripción, pestaña «Cierres solicitados 7», `tablist` «Tus cierres», región «Cierres
    solicitados» única (`getAllByRole("region", …)` de longitud 1) (R155);
  - celdas de la primera fila: folio, solicitado, destino, estado, recaudado, ganancia (R156);
  - «Pago»: «Pendiente de pago», «Liquidado», «Motivo: «…»», «—» (R157);
  - no hay «Ganancia pendiente de pago» ni «Ganancia pagada este mes» (R158);
  - vacío, error y paginación con su nombre y tamaños (R160);
  - con `ListaComprobantes` y `CierreFacturaResumenPropio` mockeados a un marcador, el marcador no
    aparece (R166);
  - «Ver»: con `verCierrePasado` pendiente, el botón de esa fila está `disabled` y
    `aria-busy="true"`; al resolver, se abre el detalle (R181).

  **Hecho:** verde.
- [ ] **T2.4** Adapta los tests del censo: `CierreDiaModule.test.tsx` (incluida la relectura de todas
  las páginas tras solicitar, R160), `descarga/CierresDescarga.test.tsx` (R159: mismo título,
  columnas y ámbito), `paginacion/BajoRiesgoPaginacion.test.tsx` y, si T0.2 lo confirma,
  `paginacion/ColasPaginacion.test.tsx`. Ningún literal de contrato se sustituye por su propia fuente
  (memoria «Literal: contrato o polizón»).
  **Hecho:** verdes.
- [ ] **T2.5** Guardias: `censo-tablas.ts` (montaje `CierreDiaModule.tsx` en `ColaCierres.tsx`; fuera
  `ListaComprobantes` de `/cierre-dia`), `cascada-central-en-las-dos-pantallas.guardia.test.ts`,
  `liquidacion-money-safe.test.ts` (censa `TablaColaPropia.tsx` y `cola-propia-vista.ts`, R71) y
  `cierres-fecha-cr.guardia.test.ts`.
  **Hecho:** `pnpm run test:guardias` verde, y `liquidacion-money-safe` en rojo si se mete un
  `Number(` en `cola-propia-vista.ts` (comprobado a mano una vez).
- [ ] **T2.6** `./init.sh` verde. **Hecho:** tamaño medido y anotado.

## T3 — E2E (depende de T2)

- [ ] **T3.1** `e2e/cierres-rediseno.spec.ts`: el mensajero del escenario A ve su cola: pestaña con
  conteo, la celda «Pago» de un aprobado («Pendiente de pago» o «Liquidado», según el escenario) y
  «Ver» que abre el detalle. Los literales, derivados a mano de los datos del escenario, en la
  cabecera del spec (R60, R157, R181).
- [ ] **T3.2** `e2e/cierre-dia.spec.ts`: los localizadores de la tira pasan a la cola (región
  «Cierres solicitados», «Ver del cierre del …»).
- [ ] **T3.3** En local, con base desechable y `NEXT_PUBLIC_APP_URL` como en `gate.yml`:
  `cierre-dia.spec.ts`, `cierres-rediseno.spec.ts`, lo que dé `grep -rl "cierre-dia" e2e/` y el grupo
  `dinero` entero (`pnpm exec playwright test --project=dinero`; el pendiente es dinero).
  **Hecho:** verde sin reintentos.

## T4 — Cierre (leader)

- [ ] `./init.sh` verde.
- [ ] Review OK antes del PR; PR a `dev`.
- [ ] Preview con Carlos: `design.md > Verificación de lo que ve el usuario`.

## Trazabilidad

| R | Test |
|---|---|
| R60 | `tests/components/CierreDiaColaPropia.test.tsx` (columnas, «Ver», paginación, sin tarjetas); `tests/unit/utils/cola-propia-vista.test.ts` (columnas en orden); `e2e/cierres-rediseno.spec.ts` |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censa `TablaColaPropia.tsx` y `cola-propia-vista.ts`); `tests/unit/utils/cola-propia-vista.test.ts` (`pagoPropioDe` decide por texto) |
| R72 | `tests/integration/db/cierre-dia-pendiente-pago.test.ts` (aserción 4: los snapshots no cambian al leer); reviewer: el diff no toca `db/`, migraciones ni Server Actions de escritura |
| R155 | `tests/components/CierreDiaColaPropia.test.tsx` |
| R156 | `tests/components/CierreDiaColaPropia.test.tsx`; `tests/unit/utils/cola-propia-vista.test.ts` (destino sin zona) |
| R157 | `tests/unit/utils/cola-propia-vista.test.ts` (ocho casos); `tests/components/CierreDiaColaPropia.test.tsx`; `e2e/cierres-rediseno.spec.ts` |
| R158 | `tests/components/CierreDiaColaPropia.test.tsx` |
| R159 | `tests/components/descarga/CierresDescarga.test.tsx` |
| R160 | `tests/components/CierreDiaColaPropia.test.tsx` (vacío, error, paginación); `tests/components/CierreDiaModule.test.tsx` (relectura tras solicitar); `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx` |
| R163 | `tests/components/ColaCierres.test.tsx` y `tests/components/ColaCierresBodega.test.tsx`, sin cambios y en verde |
| R164 | `tests/integration/db/cierre-dia-pendiente-pago.test.ts` (tabla C1-C4, M2 y mutaciones 1-5); `tests/unit/services/cierre-dia-pendiente-pago.test.ts` |
| R165 | `tests/unit/services/cierre-dia-pendiente-pago.test.ts` (una llamada por lectura con página de 1 y de 10; sin lecturas no hay campo); `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`; `tests/integration/db/cierre-dia-pendiente-pago.test.ts` (aserción 5) |
| R166 | `tests/components/CierreDiaColaPropia.test.tsx` (marcador ausente); `tests/unit/descarga/censo-tablas.ts` + `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts` |
| R180 | `tests/unit/utils/cola-propia-vista.test.ts` (los textos nuevos como literales, en tú) |
| R181 | `tests/components/CierreDiaColaPropia.test.tsx` (`disabled` + `aria-busy`, y abre el detalle); `e2e/cierres-rediseno.spec.ts` |

## Archivos esperados

Producción:
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/actions/cierre-dia.ts`
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/TablaColaPropia.tsx`
- `components/private/cierres/cola/cola-propia-vista.ts`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`

Tests nuevos:
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
- `tests/integration/db/cierre-dia-pendiente-pago.test.ts`
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`
- `tests/unit/utils/cola-propia-vista.test.ts`
- `tests/components/CierreDiaColaPropia.test.tsx`

Tests y guardias adaptados:
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `tests/unit/guards/cierres-fecha-cr.guardia.test.ts`

E2E:
- `e2e/cierre-dia.spec.ts`
- `e2e/cierres-rediseno.spec.ts`

Total: 22 archivos. Compartidos con SLT-106: `ColaCierres.tsx`, `censo-tablas.ts`,
`BajoRiesgoPaginacion.test.tsx`, `CierresDescarga.test.tsx`, `ColasPaginacion.test.tsx`,
`liquidacion-money-safe.test.ts` (SLT-106 mergea antes).
