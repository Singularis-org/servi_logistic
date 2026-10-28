# SL-20 · tanda 4, frontend 1: T5.1 y T5.2 (frontend_dev)

## Archivos

Nuevos:
- `providers/EtiquetasGeograficasProvider.tsx`: contexto con las `EtiquetasGeograficas`.
- `hooks/use-etiquetas-geograficas.ts`: lee el contexto. Si no hay proveedor, devuelve `ETIQUETAS_NEUTRAS` («Nivel 1»…), no las de CR (design §7).
- `tests/fabricas/etiquetas-geograficas.tsx`: `ETIQUETAS_CR` (las de la fila `CR` de la migración `20261026120000_pais`), `ETIQUETAS_XA` («Departamento», «Municipio», «Aldea») y `ConEtiquetasCR`.
- `tests/components/etiquetas-geograficas.test.tsx`: test de T5.1.
- `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`: guardia de §7, con contraprueba.

App (T5.1):
- `app/(app)/layout.tsx`: cuarta lectura en el mismo `Promise.all`. Con empresa llama a `construirPaisService().etiquetasDeEmpresa(organizacionId)`. Sin empresa (superadmin, o sin `organizacionId`) usa `ETIQUETAS_NEUTRAS` y no consulta. Si la lectura falla, `console.error` y neutras: mismo criterio que `mapaAyudaDelActor`. `EtiquetasGeograficasProvider` envuelve solo a `{children}`.

App (T5.2, lista cerrada de §7):
- órdenes:
  - `ordenes-columns.tsx`: `ordenesColumns` pasa a `ordenesColumnsDe(etiquetas)` y `ordenesColumnsReprogramada` a `ordenesColumnsReprogramadaDe(etiquetas)`. Las dos memorizan con un `WeakMap` por objeto de etiquetas, así que el mismo objeto devuelve las mismas columnas (se conserva la identidad de la que dependen `recibidas-columns.test`).
  - `ordenes-filtros-def.ts`: `opts.etiquetas` es obligatorio.
  - `ordenes-descarga-columnas.ts`: nuevo `columnasDescargaOrdenes(etiquetas)`.
  - `CorregirDatosClienteModal.tsx`: se quitan `CORREGIR_{PROVINCIA,CANTON,DISTRITO}_LABEL` y usa el hook.
  - `CorregirUbicacionAviso.tsx`: se quita `AVISO_FILA_DISTRITO` y usa el hook.
  - `OrdenesModule.tsx`: `columns` por defecto = `ordenesColumnsDe(hook)`.
  - `OrdenesListado.tsx`: usa el hook.
- entregas: `entregas-filtros-def.ts` (`opts.etiquetas` obligatorio) y `FiltrosEntregas.tsx` (hook). `filtro-secciones.tsx`, `entregas-filtro-analitica.ts` y `analitica/page.tsx` no pintan ningún nivel (solo claves y comentarios): sin cambios.
- novedades:
  - `novedades-filtros.ts`: `ETIQUETAS_FILTRO` pasa a `etiquetasFiltroNovedades(etiquetas)`, y `construirFiltrosNovedades` recibe un tercer argumento, `etiquetas`.
  - `useNovedadesFiltro.ts`: usa el hook.
  - `NovedadesFiltrosBarra.tsx`: sin cambios (no importa rótulos).
- satélite:
  - `satelite-descarga-columnas.ts`: nuevo `columnasDescargaSatelite(etiquetas)`.
  - `satelite-ordenes-filtros.ts`: `opts.etiquetas` es obligatorio.
  - `recibidas-columns.tsx`: `recibidasColumns(etiquetas)`.
  - `SateliteOrdenesListado.tsx`: usa el hook.
  - `RecepcionSateliteModule.tsx`: sin cambios (`filaDescargaSatelite` no lleva rótulos).
- monitoreo: `detalle-columnas.ts` (`columnasDetalle(alcance, etiquetas)`) y `DetalleMensajeroPanel.tsx` (hook).
- mis asignaciones:
  - `FiltroCantonDistrito.tsx`: rótulos, región y `aria-label` salen del hook.
  - `AsignacionDetalle.tsx`: usa el hook y lleva `"use client"`. Todos sus importadores ya eran cliente.
  - `useFiltroCantonDistrito.ts`, `chat/chat-format.ts` y `lib/utils/filtro-canton-distrito.ts`: no pintan ningún rótulo de nivel. Sin cambios; `lib/` no se tocó.
- tarifas:
  - `cobertura-descarga-columnas.ts`: nuevo `columnasDescargaCobertura(etiquetas)`. `MOTIVO_SIN_COBERTURA_LABEL` pasa a `motivoSinCoberturaLabel(etiquetas)`. `filaCobertura(etiquetas)(dto)` es una factoría: es la forma que reconoce `columnas-sensibles.guardia`.
  - `DescargarCoberturaButton.tsx`: usa el hook.
  - `GeografiaSelector.tsx`: placeholder y «X seleccionados».
- cierres: `cierre-detalle-shared.tsx`. `ESPECIAL_SIN_PACTO_BADGE_NOTA` pasa a `especialSinPactoBadgeNota(etiquetas)`. `MarcaEspecialSinPacto` es un componente con el hook, y `renderFleteOrigen(origen)` conserva su firma.

Las `COLUMNAS_DESCARGA_{ORDENES,SATELITE,COBERTURA}` siguen exportadas como contrato de claves y orden. Sus encabezados de nivel son los neutros, y las pantallas montan la función. Se dejaron así para no romper `columnas-asercion-de-orden.guardia`, que tiene el canario `COLUMNAS_DESCARGA_ORDENES` y un suelo de 35 constantes.

Tests adaptados: se pasa `ETIQUETAS_CR` a las funciones, o se dobla `@/hooks/use-etiquetas-geograficas` para que devuelva `ETIQUETAS_CR` en las pantallas montadas sin layout. Son:
- `AppLayout`
- `AsignacionBloqueoPorCierre`
- `ChatContactoAntesDeRecoger`
- `CierreTarifaEspecial`
- `CorregirDatosCliente.{ordenes,novedades}`
- `descarga/SateliteDescarga`
- `DetalleMensajeroPanel`
- `FiltrosEntregas`
- `NovedadesBuscador`
- `OrdenesPage`
- `paginacion/SatelitePaginacion`
- `RecepcionSateliteModule`
- `RepartoModule`
- `unit/app/tarifas/DescargarCoberturaButton`
- `unit/components/{corregir-ubicacion-inactivos, detalle-columnas, filtros-acotados-por-rol, novedades-filtros, ordenes-buscador-declaracion, ordenes-columns, ordenes-descarga-columnas, ordenes-filtros-def, ordenes-listado-buscador, ordenes-listado-filtros, recibidas-columns, salida-a-reparto-filtro, satelite-filtro-estado}`
- `unit/descarga/{cobertura,satelite}-descarga-columnas`
- `unit/tablero-dia/recorte-por-alcance.guardia`

Spec: `[x]` en T5.1 y T5.2 de `tasks.md`.

## Mapa R<n> -> test

| R | Test |
|---|---|
| R19 (T5.1, UI) | `tests/components/etiquetas-geograficas.test.tsx` › «con una empresa de un país de prueba, la pantalla dice «Departamento» y no «Provincia»», «con una empresa de Costa Rica, la misma pantalla dice «Provincia», «Cantón» y «Distrito»», «sin proveedor, el hook da las neutras» |
| R19 (T5.1, layout) | `tests/components/AppLayout.test.tsx` › «SL-20/T5.1 — el layout baja los nombres de nivel…» (con empresa: `etiquetasDeEmpresa(orgId)` y se pasan al proveedor; superadmin: neutras y sin consulta; si falla: neutras y `console.error`) |
| R19 (T5.2, lista cerrada) | `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` (barrido de `app/` y `components/` + dos contrapruebas sobre texto inventado) |
| R19 (descargas) | `ordenes-descarga-columnas.test.ts`, `satelite-descarga-columnas.test.ts`, `cobertura-descarga-columnas.test.ts` › «SL-20/R19 — … con un país de prueba …» |
| R19 (filtros) | `ordenes-filtros-def.test.ts` › «SL-20/R19 — los filtros geográficos llevan los nombres de nivel del país de la empresa» |
| R20 | No es de esta tanda: va con T5.3 (`geografia-plataforma-page.test.tsx`) |

## Salida real

- Guardia nueva: `pnpm exec vitest run tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` → `Test Files 1 passed (1) · Tests 4 passed (4)`.
- T5.1: `etiquetas-geograficas.test.tsx` + `AppLayout.test.tsx` + `superadmin-fuera-de-empresa.guardia` → `Test Files 3 passed (3) · Tests 41 passed (41)`.
- Tests de componentes y unitarios de los archivos tocados (147 archivos, por lotes, `pnpm exec vitest run <archivos>`):
  - lote 1: `37 passed · 646 passed | 17 skipped`;
  - lote 2: `37 passed · 651 passed`;
  - lote 3: `36 passed · 557 passed`;
  - lote 4: `36 passed · 605 passed`.
  - Cubren órdenes, novedades, satélite, tarifas, mis asignaciones (`RepartoModule`, `AsignacionDetalle`, `ChatContacto…`), cierres (`CierreTarifaEspecial`, `CierreCobrosDeLaGestion`, `CierreTarifaAplicada`), monitoreo y entregas.
- Guardias y unitarios que nombran los archivos tocados (46 archivos): `Test Files 46 passed · Tests 440 passed`, después de arreglar `columnas-sensibles.guardia` con la factoría `filaCobertura(etiquetas)`. Ese arreglo se volvió a correr junto con sus tests: `3 passed · 40 passed`.
- `tests/integration/descarga-dataset-roundtrip.test.ts`, `descarga-170-volumen.test.ts` y `OrdenesDescargaColumnas.test.tsx` → `3 passed · 20 passed`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 errores. Se corrió dos veces, porque después de la primera cambió la firma de `filaCobertura`.
- `pnpm exec eslint <62 archivos tocados>` → 0 errores, 1 warning anterior y ajeno (`RepartoModule.test.tsx:161 ordenCardsEnReparto` sin usar).

## Preguntas abiertas

1. **Género y artículos.** El país trae singular y plural, pero no el género. Las frases en minúscula con artículo o concordancia siguen con la de Costa Rica. La guardia vigila solo las palabras con mayúscula inicial. Quedan así:
   - «Elige una provincia», «el distrito»;
   - «catálogo de provincias, cantones y distritos», «Sin distrito»;
   - «el distrito está marcado…», «Ninguna provincia coincide»;
   - en interpolaciones: «{X} retirada/retirado del catálogo», «{X} marcado como zona especial», «{Distritos} seleccionados».

   Con un país cuyos nombres tengan otro género (p. ej. «Aldea») saldría «Aldea marcado». Hay dos opciones: añadir el género a `pais`, que es de backend, o redactar sin concordancia, que cambia textos de CR. Lo decide el humano.
2. **Fallo de `etiquetasDeEmpresa` en el layout.** Se pintan las neutras y se escribe `console.error`, en vez de devolver un 500 en todo el portal. T2 lo había dejado como decisión del layout.
3. **Encabezados de las constantes de descarga.** Las `COLUMNAS_DESCARGA_{ORDENES,SATELITE,COBERTURA}` tienen encabezados neutros y las pantallas usan la función. La alternativa era borrar las constantes y ajustar el canario y el suelo de `columnas-asercion-de-orden.guardia`.

## Veredicto

T5.1 y T5.2 hechas: el proveedor, el hook y el layout están enganchados, la lista cerrada de R19 pasa a los nombres del país, la guardia está verde con su contraprueba, y typecheck, lint y los tests de los archivos tocados están en verde.
