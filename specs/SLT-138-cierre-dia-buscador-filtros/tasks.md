# SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» — tasks

> Diseño: `design.md`. Requisitos: `requirements.md` (R167-R180). `backend_dev` hace T1;
> `frontend_dev` hace T2. T3 cierra. Cada task se commitea sola (`feat(SLT-138): …`).

## T0 — Preparación

- [x] **T0.1** Traer `origin/dev` (con SLT-137 dentro) y copiar `.env` al worktree **antes** del primer
  gate (sin `.env` la integración se salta en verde).
  *Hecho:* `git log origin/dev..HEAD` vacío al empezar; `./init.sh` verde de partida.
- [x] **T0.2** [P] Repetir el censo de `design.md > Tests y guardias que pueden cambiar` con Grep
  (`DESCARGA_CIERRES_PASADOS`, `listarCierresPasadosCompleto`, `cierresDeMensajeroWhere`,
  `components/private/cierres/`, `barra={null}`) y anotar en `progress/impl_SLT-138.md` qué archivos
  cambian de verdad.
  *Hecho:* la lista anotada; si sale un archivo que no está en `## Archivos esperados`, se añade
  aquí antes de tocarlo.

## T1 — Servidor (`backend_dev`)

- [x] **T1.1** `lib/utils/folio-cierre.ts` con `normalizarFolio` + `tests/unit/utils/folio-cierre.test.ts`
  (test primero, en rojo).
  *Hecho:* casos de `design.md > Tests unitarios` verdes; ningún `number` ni regex sin anclar.
- [x] **T1.2** (dep. T1.1) `lib/types/filtros-cierres.ts`: `MAX_FOLIO_FILTRO`,
  `filtrosColaPropiaSchema`, `FiltrosColaPropia`, `FiltrosColaPropiaRepo`, `sinFiltrosPropios`.
  `lib/types/cierre.ts`: `filtros` opcional en `listarCierresPasadosSchema`; el `Completo` sigue
  derivado; comentarios al día.
  *Hecho:* typecheck verde; `tests/unit/guards/filtros-cierres-alcance.guardia.test.ts` sigue verde
  sin tocarlo.
- [x] **T1.3** (dep. T1.2) `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (rojo) y
  `lib/actions/cierre-dia.ts`: el archivo pasa `data.filtros` al servicio solo si existe.
  *Hecho:* R168, R170 y el tope de R171 verdes en las dos acciones; el servicio doble no se llama en
  ningún `validation_error`; `tests/unit/actions/cierre-dia-descarga-action.test.ts` verde.
- [x] **T1.4** (dep. T1.2) Repositorio: `cierresDeMensajeroWhere(mensajeroId, filtros?, idsPorFolio?)`,
  `idsDeCierresPorFolio` exportada, `filtros?` al final de `findCierresByMensajeroPaginado` y
  `findCierresByMensajero`, y `ICierreDiaRepository` al día. Caso nuevo en
  `tests/unit/repositories/historicos-paginados-where.test.ts`.
  *Hecho:* el caso sin filtros sigue pidiendo `{ mensajeroId }` exacto; con filtros, el mismo
  `{ AND: [...] }` en `findMany` y `count`; `sql-a-mano-por-empresa` y `criterio-unico` verdes;
  `CierreDiaRepository.ts` sin `organizacion_id` nuevo.
- [x] **T1.5** (dep. T1.3, T1.4) Servicio: `filtrosParaRepo`, firmas nuevas de los dos listados,
  corto de folio imposible, zona solo con rango. `ICierreDiaService` al día.
  `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (rojo primero).
  *Hecho:* los casos de `design.md` verdes; `cierre-dia-pasados-paginado.test.ts`,
  `cierre-dia-pasados-completo.test.ts` y `cierre-dia-pendiente-pago.test.ts` verdes sin tocarlos.
- [x] **T1.6** (dep. T1.5) `tests/integration/db/cierre-dia-filtros-propios.test.ts` contra la base
  desechable, con la tabla K1-K6 y los 11 casos de `design.md`.
  *Hecho:* verde **con base** (la salida dice `passed`, no `skipped`); las **8 mutaciones** de
  `design.md` aplicadas una a una, cada una en rojo, revertidas, y anotadas en
  `progress/impl_SLT-138.md` con el caso que cae. Ninguna mutación queda en el diff (la 4 toca
  `CierresAdminRepository.ts` solo en local).

## T2 — Pantalla (`frontend_dev`)

- [x] **T2.1** (dep. T1.2) `components/private/cierres/cola/cola-propia-vista.ts`: textos nuevos,
  `opcionesEstadoPropias`, `aFiltrosPropios`. En `tests/unit/utils/cola-propia-vista.test.ts`:
  sus casos y el arreglo del test de voseo (`design.md > El test de voseo`).
  *Hecho:* el control positivo «Buscá por folio» casa con el regex nuevo y con el viejo **no**
  (se comprueba una vez y se anota); los textos nuevos pasan.
- [x] **T2.2** (dep. T2.1) `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx`.
  *Hecho:* usa `BuscadorFiltros` y `FilterComponent` de `components/shared/`, sin `disabled` por
  carga; `FiltrosCierresBarra.tsx` sin cambios.
- [x] **T2.3** (dep. T1.5, T2.2) `CierreDiaModule.tsx`: estado de filtros, clave de SWR,
  `fallbackData` solo sin filtros, `aplicarFiltrosPropios` a la página 1, `vacio` según filtros,
  `barra`, `descargaCierresPasados(filtros)`. `tests/components/CierreDiaColaFiltros.test.tsx`
  (rojo primero) y lo que pida el censo de T0.2 (`CierresDescarga.test.tsx`, censo de tablas).
  *Hecho:* R167, R174-R178 verdes en componente; `CierreDiaModule.test.tsx`,
  `CierreDiaColaPropia.test.tsx`, `BajoRiesgoPaginacion.test.tsx`, `FiltrosCierresBarraEstado.test.tsx`,
  `CierresAdminFiltros.test.tsx` y `CierresAdminPage.test.tsx` verdes.
- [x] **T2.4** (dep. T2.3) `e2e/cierres-rediseno.spec.ts`: el caso del escenario A de
  `design.md > Tests unitarios y de componente`. El folio se **lee de la fila**, nunca de `folioDe`.
  *Hecho:* verde en local contra base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
  `.github/workflows/gate.yml`; también `e2e/cierre-dia.spec.ts` verde (toca la pantalla).

## T3 — Cierre

- [ ] **T3.1** `./init.sh` verde; `git diff --stat origin/dev` sin `FiltrosCierresBarra.tsx`,
  `ColaCierres.tsx`, `db/` ni `CierresAdminRepository.ts` (R179).
  *Hecho:* gate verde, log con `INIT_EXIT=` dentro.
- [ ] **T3.2** `progress/impl_SLT-138.md` con el mapa `R<n> → test` de `## Trazabilidad`, las
  mutaciones y la lista de Preview de `design.md > Verificación de lo que ve el usuario`, con los
  literales anotados a mano.
  *Hecho:* cada R167-R180 con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R167 | `tests/components/CierreDiaColaFiltros.test.tsx` («la barra usa el buscador y los filtros de la app, con folio, fecha y estado»); servidor: los de R168-R174 |
| R168 | `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (claves coladas dentro y fuera, `desde > hasta`, mismo bloque en página y archivo) |
| R169 | `tests/integration/db/cierre-dia-filtros-propios.test.ts` casos 3 y 4 (mutación 4); `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (zona solo con rango) |
| R170 | `tests/integration/db/cierre-dia-filtros-propios.test.ts` caso 5 (mutación 5); `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (`[]`, `"consolidado"`) |
| R171 | `tests/unit/utils/folio-cierre.test.ts`; `tests/integration/db/cierre-dia-filtros-propios.test.ts` casos 2 y 7 (mutaciones 2, 3, 7); `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (imposible sin leer); `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (21 caracteres) |
| R172 | `tests/integration/db/cierre-dia-filtros-propios.test.ts` casos 5, 6, 8 y 11 (mutaciones 1 y 6); `tests/unit/repositories/historicos-paginados-where.test.ts` (alcance dentro del `AND`, mismo `where` en `count`) |
| R173 | `tests/integration/db/cierre-dia-filtros-propios.test.ts` casos 1 y 10; `tests/unit/repositories/historicos-paginados-where.test.ts` (sin filtros, `{ mensajeroId }` exacto); `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (llamada al repo sin filtros) |
| R174 | `tests/integration/db/cierre-dia-filtros-propios.test.ts` caso 9 (mutación 8); `tests/components/CierreDiaColaFiltros.test.tsx` («Descargar» manda `{ filtros }`) |
| R175 | `tests/components/CierreDiaColaFiltros.test.tsx` (desde la página 2 vuelve a la 1; conteo = `total`); `e2e/cierres-rediseno.spec.ts` |
| R176 | `tests/components/CierreDiaColaFiltros.test.tsx`; `tests/unit/utils/cola-propia-vista.test.ts` (texto); `e2e/cierres-rediseno.spec.ts` |
| R177 | `tests/components/CierreDiaColaFiltros.test.tsx` (placeholder, solo dos filtros, atajos, cuatro estados sin grupo, sin aviso); `tests/unit/utils/cola-propia-vista.test.ts` (`opcionesEstadoPropias`) |
| R178 | `tests/components/CierreDiaColaFiltros.test.tsx` («Limpiar todo» → página 1 sin `filtros`); `e2e/cierres-rediseno.spec.ts` |
| R179 | `tests/components/FiltrosCierresBarraEstado.test.tsx`, `tests/components/CierresAdminFiltros.test.tsx`, `tests/components/CierresAdminPage.test.tsx` sin tocar y verdes, y T3.1 (`FiltrosCierresBarra.tsx` fuera del diff) |
| R180 | `tests/unit/utils/cola-propia-vista.test.ts` («ningún texto usa voseo», con el regex Unicode y su control positivo) |

## Tamaño

Medido contra `gate.tamano_pr` por defecto (40 archivos, 1 000 líneas añadidas + borradas; `specs/`
y `progress/` no cuentan). Los tests se estiman y se multiplican por 2, que es lo que han pesado en
las fichas anteriores.

| Bloque | Archivos | Líneas estimadas |
|---|---|---|
| Producción `lib/` (tipos, folio, interfaces, repo, servicio, acción) | 8 | ~210 |
| Producción pantalla (barra nueva, vista, módulo) | 3 | ~200 |
| **Producción** | **11** | **~410** |
| Tests: integración (~220), servicio (~110), borde (~80), folio (~40), vista (~40), componente (~180), where (~20), E2E (~40), ajustes del censo (~20) = ~750 estimadas | 9-12 | **~1 500** (×2) |
| **Total** | **20-23** | **~1 900** |

**No cabe en 1 000 líneas.** Archivos sí (20-23 de 40, bajo el 80%). Por instrucción del leader no
se parte: decide el humano (`docs/gate.md > Tamaño del PR`, línea `tamano-pr-aceptado` en
`progress/features/SLT-138.md`). Lo que más pesa es la prueba contra Postgres real y la de
componente, y las dos son condición de R169-R178.

## Archivos esperados

Producción:
- `lib/types/filtros-cierres.ts`
- `lib/types/cierre.ts`
- `lib/utils/folio-cierre.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/services/CierreDiaService.ts`
- `lib/actions/cierre-dia.ts`
- `components/private/cierres/cola/cola-propia-vista.ts`
- `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`

Tests:
- `tests/integration/db/cierre-dia-filtros-propios.test.ts`
- `tests/unit/services/cierre-dia-pasados-filtros.test.ts`
- `tests/unit/actions/cierre-dia-filtros-borde.test.ts`
- `tests/unit/utils/folio-cierre.test.ts`
- `tests/unit/utils/cola-propia-vista.test.ts`
- `tests/unit/repositories/historicos-paginados-where.test.ts`
- `tests/components/CierreDiaColaFiltros.test.tsx`
- `tests/unit/actions/cierre-dia-descarga-action.test.ts`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/repositories/criterio-unico.guardia.test.ts` (T0.2: la MUTACION 3 buscaba
  `cierresDeMensajeroWhere(mensajeroId);` literal; con dos parámetros más, su regex pasa a `\([^)]*\)`)
- `e2e/cierres-rediseno.spec.ts`

Specs y progreso (no cuentan para el tamaño):
- `specs/SLT-138-cierre-dia-buscador-filtros/requirements.md`
- `specs/SLT-138-cierre-dia-buscador-filtros/design.md`
- `specs/SLT-138-cierre-dia-buscador-filtros/tasks.md`
- `specs/SLT-137-cierre-dia-cola-filtros/requirements.md`
- `progress/impl_SLT-138.md`
