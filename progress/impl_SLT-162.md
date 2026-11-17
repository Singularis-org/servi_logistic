# SLT-162 «Ranking del mensajero en tarjetas en el móvil» — bitácora del implementer (frontend_dev)

Rama `feature/SLT-162-ranking-mensajero-tarjetas`, ruta ligera, spec aprobado por Carlos 2026-11-16
(DC23 con `BuscadorFiltros`, DC24 premios editables en la tarjeta). Sin push. Grafo: el worktree no
está indexado; exploración con Grep/Read.

## Commits

| SHA | Task |
|---|---|
| `760db73c` | T1 base compartida: `DESPLEGABLE_TACTIL` promovido, `DESCARGA_MOVIL`, textos largos del E2E |
| `804e2c1e` | T2 Ranking del día, Premios y podio en tarjetas + búsqueda por nombre |
| `0c494089` | T3 Histórico en tarjetas, desplegar a la derecha, fecha dentro de `BuscadorFiltros` |
| `17fd0f4c` | T4 descarga a ancho móvil y con búsqueda, guardia ampliada con contraprueba |
| `5fb4fe02` | T5 E2E (escrito, sin correr) |
| `1e12ddf9` | anclas de contenido en las esperas (guardia `ancla-de-carga`) |
| (este) | mapa R → test en el spec y esta bitácora |

## Archivos

Producción: `app/(app)/ranking/page.tsx` (solo pasa `mensajeroPropioId`), `_components/RankingModule.tsx`,
`_components/PremioInputRow.tsx`, `_components/RankingPodio.tsx`, `_components/ranking-labels.ts`,
`historico/_components/RankingHistoricoModule.tsx`, `historico/_components/ranking-historico-labels.ts`,
`components/shared/texto-entero.ts`, `components/shared/DataTable.tsx`,
`components/private/cierres/cola/ColaCierres.tsx`.

Tests: `tests/components/RankingModule.test.tsx`, `RankingHistoricoModule.test.tsx`, `RankingPodio.test.tsx`,
`descarga/RankingDescarga.test.tsx`, `descarga/RankingHistoricoDescarga.test.tsx`,
`tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts`, `e2e/pwa-mensajero-ranking.spec.ts` (nuevo),
`e2e/_pwa-mensajero-fixture.ts` (`MENSAJERO_LARGO` 80 car. con palabra de 40; `PREMIO_DESCRIPCION_LARGA` 200).

`BuscadorFiltros.tsx` y `cuentas-por-pagar-listado.ts` sin tocar. Sin dependencias. Nada de `lib/`, `db/`, `app/api/`.

## Decisiones (para el reviewer)

1. **`DataTable.expandAriaLabel` recibe `abierta`** (`(row, abierta) => string`, una línea + doc). R760 pide
   «Ver detalle»/«Ocultar detalle» y la tabla no exponía el estado; el parámetro extra no cambia a los
   demás consumidores. El spec solo listaba `DataTable.tsx` para `DESCARGA_MOVIL` (que al final NO la
   necesitó: el selector alcanza el botón, verificado compilando las clases con Tailwind 4.3.2).
2. **Desplegar a la derecha (R755) sin tocar la `DataTable`**: la tabla pone el botón en la primera columna;
   en el teléfono la sección escribe la tabla `direction: rtl` y cada celda vuelve a `ltr`
   (`DESPLEGAR_A_LA_DERECHA` en `RankingHistoricoModule`). La tarjeta y el detalle se leen igual.
3. **Premios en el teléfono**: el MISMO `<table>`/`<tr>` como rejilla `max-md:` (un solo DOM, sin duplicar
   campos ni «Guardar»); cabecera `max-md:sr-only`; «º ·» del puesto y los rótulos visibles de la tarjeta
   van `aria-hidden` (el nombre accesible sigue siendo el de hoy: rowheader «1», `aria-label` de campos).
4. **Fila del resto del podio (R767)**: `flex` en el teléfono con el envoltorio nombre+conteo en
   `max-md:contents`; en ≥ 768 px la rejilla de hoy (la barra pasa de `sm:` a `md:`).
5. **Porcentaje del pedestal `max-md:text-lg`**: «100.0%» a 30 px no cabe en un tercio de 360 px (R761). El
   spec deja los pedestales «como hoy»; es el único cambio de tamaño en ellos.
6. **Búsqueda (R769)**: `BuscadorFiltros` tal cual en la prop `filtros` de la `DataTable`, `debounceMs={0}`
   (filtra en memoria), `leerDeUrl={false}`, `tactil`. Nombre accesible «Buscar mensajero».
7. **Histórico (R757)**: la fecha es `children` de `BuscadorFiltros buscador={false}`; `children` se pinta
   siempre, así que NO hizo falta modificarlo (no hubo que parar).
8. **R760 literal**: «Ver detalle»/«Ocultar detalle» igual en todas las filas, como pide el spec; la doc de
   `expandAriaLabel` recomienda identificar la fila («Ver detalle de {nombre}»). Abierto para el reviewer.

## Diferencias con el canvas (manda el spec)

- `BuscadorFiltros` en las dos pantallas aunque el canvas no lo dibuje (DC23).
- Chip «Tú»: el canvas lo pinta amarillo y en minúsculas; se reusa el del podio (token `bg-brand`,
  mayúsculas) para que lista y tarjeta digan lo mismo igual.
- Pedestal: el canvas usa 15 px para el porcentaje; aquí `text-lg` (18 px) en el teléfono, el resto como hoy.
- Fila del resto: el canvas usa tarjetas blancas separadas; se conserva la lista con bordes de hoy.
- Desplegar del Histórico: el canvas lo pone en la línea del nombre; aquí ocupa la columna derecha de la
  tarjeta, alineado arriba (misma posición visual, sin tocar la `DataTable`).

## Mapa R → test

En `specs/SLT-162-ranking-mensajero-tarjetas/requirements.md > Mapa R → test`, con el nombre de cada caso.
Resumen: R750-R754, R763, R764, R766, R769 → `RankingModule.test.tsx`; R755-R757, R760, R763, R764, R766 →
`RankingHistoricoModule.test.tsx`; R758, R765 → guardia + componentes; R759, R761 → E2E (+ clases);
R762 → `RankingDescarga`/`RankingHistoricoDescarga`; R767, R768 → `RankingPodio.test.tsx` + E2E.

## Salidas

```
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .   → TSC_EXIT=0
pnpm exec eslint <los 18 .ts/.tsx del diff>                          → LINT_EXIT=0 (sin avisos)
pnpm exec vitest run RankingModule RankingPodio RankingPage RankingHistoricoModule RankingHistoricoPage
  descarga/RankingDescarga descarga/RankingHistoricoDescarga pwa-mensajero-sin-recorte.guardia
  CierreDiaColaPropia ColaCierres DataTable                          → 11 files, 211 passed, VITEST_EXIT=0
pnpm exec vitest run guards/{filtros-url-r25,vistas-superficies-declaradas,marca-texto-amarillo,
  estado-con-info,ancla-de-carga} tests/unit/descarga paginacion-transversal paginacion-dominios
                                                                     → 55 files, 584 passed, EXIT=0
```

`ancla-de-carga` salió ROJA la primera vez (6 esperas ancladas solo a un conteo de filas); corregido en
`1e12ddf9` con anclas de contenido. E2E: escrito, **sin correr** (orden del leader: no levantar dev
server ni build); lo corre CI. `./init.sh` no corrido (T6 queda para el leader).

## Mutaciones (todas restauradas con `git checkout --`, árbol limpio al final)

Línea base antes: 6 archivos, 135 passed. Cada mutación corre solo sus tests.

| # | Mutación | Resultado |
|---|---|---|
| G1 | `truncate` en el nombre de la fila del resto del podio | ROJO (guardia + `RankingPodio`) |
| G2 | `gap-1.5` de vuelta en el Histórico | ROJO (guardia) |
| M1 | quitar el chip «Tú» de la tarjeta | ROJO |
| M2 | recortar el nombre de la tarjeta (`truncate`, sin `TEXTO_ENTERO`) | ROJO (componente + guardia) |
| M3 | los premios leen la lista filtrada (filtrar también premios/podio) | ROJO |
| M4 | la descarga ignora la búsqueda | ROJO |
| M5 | columnas de escritorio en el teléfono | ROJO (5) |
| M6 | sin `DESCARGA_MOVIL` | ROJO |
| M7 | «Guardar» sin `TACTIL_MOVIL` | ROJO |
| M8 | búsqueda sensible a acentos | ROJO |
| M9 | «sin resultados» igual al vacío del día | ROJO |
| M10 | nombre del desplegar fijo | ROJO |
| M11 | desplegar a la izquierda (sin `DESPLEGAR_A_LA_DERECHA`) | ROJO |
| M12 | `buscador` encendido en el Histórico | ROJO |
| M13 | premio del Histórico sin descripción | ROJO |
| M14 | podio con letra de 11 px en el teléfono | ROJO |
| M15 | la barra del resto vuelve en el teléfono | ROJO |
| M16 | el conteo vuelve bajo el nombre (sin `max-md:contents`) | ROJO |
| M17 | Histórico con el orden invertido | ROJO |
| M18 | premios en el teléfono con cabecera visible | ROJO |

M3, M4 y M8 se repitieron tras el arreglo de anclas: siguen ROJAS.

## Abierto

- E2E `e2e/pwa-mensajero-ranking.spec.ts` sin ejecutar (siembra con Prisma de `premio_ranking` y
  `ranking_snapshot_*` con `organizacionId` explícito; si alguna restricción de la base lo rechaza, saldrá en CI).
- T6 (`./init.sh` con base desechable) para el leader.
- R760: nombre genérico «Ver detalle» por fila (literal del spec) frente a la recomendación de la `DataTable`.
- Cambio de firma en `DataTable.expandAriaLabel` (decisión 1): fuera de lo que el spec autorizaba
  expresamente para ese archivo; compatible con todos los consumidores.

Veredicto: T1-T4 hechos y verdes en local con 20 mutaciones en rojo; E2E escrito sin correr y T6 pendientes del leader.
