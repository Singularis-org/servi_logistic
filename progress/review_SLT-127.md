# Review — SLT-127 «Cola de bodega de la central con la cola única» (C2 de SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados»)

Reviewer, 2026-11-11. Rama `feature/SLT-127-cola-bodega-central-ui`, revisado en HEAD 703a61c9,
diff `origin/dev...HEAD` (33 archivos con `specs/` y `progress/`; 28 de código y tests). Ruta: completa.
Grafo: no usado (el índice de este worktree no existe, como anota `design.md`); todo con Grep/Read.
Base desechable `slt127_a` exportada en la shell (el `.env` del worktree apunta a otra base; no se tocó
y la URL no se imprimió).

## Checklist

- [x] **Ruta.** Completa (requirements + design + tasks). Pantalla de dinero, sin servidor: correcto.
- [x] **Trazabilidad.** Cada R tiene un test concreto que lo verifica (tabla abajo).
- [x] **Tasks.** T0-T5 en `[x]`. T6 es del leader (gate, review, Preview, promoción conjunta).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` → 28/40 archivos, 1651/1000 líneas, «aceptado por el
  humano» (marca en `progress/features/SLT-127.md:28`), `TAM_EXIT=0`. No es hallazgo.
- [x] **`design.md > ## Lo que ya existe`.** Presente y con contenido; el diff no re-crea nada de esa
  lista: reutiliza `ColaCierres`, `FiltrosCierresBarra`, `DescargarCierresButton`, `Pagination`,
  `DataTable`, `Badge`, `folioDe`, `fechaHora`, `ESTADO_CONCILIACION_*`, `estadoConciliacionDe`,
  `hayFaltantePorRecibir`, `money()`.
- [x] **Montaje real.** `CierresBodegaAdminModule.tsx` importa y monta `<ColaCierres tipo="bodega"
  rol="central" …>`; ya no importa `ListaComprobantes`, `CierreBodegaFacturaResumen`,
  `CierresBodegaResueltosLista` (componente), `SegmentedToggle` ni `PanelConmutado`.
  `CierresBodegaAdminCola.test.tsx` monta el módulo sin doble de la cola.
- [x] **Partición del servidor.** «Conciliados» lee `listarHistoricoCierresBodegaPaginado`, que desde C1
  usa el criterio de R122 (`CierresBodegaAdminRepository.ts:257`), ahora con `filtros`.
- [x] **R72 / D5.** El diff no toca `lib/`, `db/`, Server Actions ni migraciones (`git diff --stat -- lib db` vacío).
- [x] **R71.** La fila pinta con `money()` sobre el string del servidor; nada de `Number`, sumas ni
  redondeos. `liquidacion-money-safe` verde.
- [x] **Datos y seguridad.** Sin tabla, query, migración ni RLS nuevos. Ningún literal de país/moneda en
  código de producción nuevo (el «₡0» solo aparece en un comentario de `cola-cierres-vista.ts`). Sin
  recursos de Ordenex. Sin `console.log`.
- [x] **Dependencias.** Ninguna nueva.
- [x] **Permisos.** Sin cambios (la autorización sigue en las actions de C1).
- [x] **Comentarios.** Explican el porqué (caducidad del campo, por qué sin `@sin-superficie`, etc.).
- [x] **E2E en local (perfil, bloqueante si falta).** La bitácora trae la salida con bases desechables
  nuevas y sin reintentos: `dinero` entero 95 passed, `dos-empresas-humo` 18 passed, los tres specs
  tocados 16 passed, cada uno con `E2E_EXIT=0`. No los repetí: la evidencia es concreta (base, proyecto,
  cifra, exit) y coherente con el diff. El describe de C1 de `cierre-bodega-satelite.spec.ts` se
  adaptó sin aflojarse: conteos exactos «Por conciliar 1/0» y «Conciliados 0/1», pastilla, celdas
  Recibido (6.000) y Falta (1.000) en la fila, «Ver / corregir», y control de la lista vacía.

### Verificación ejecutada por mí

| Comando | Resultado |
|---|---|
| `tsc --noEmit -p .` | `TSC_EXIT=0` |
| `eslint` sobre producción, tests nuevos, `tests/unit/descarga`, E2E tocados | `LINT_EXIT=0` |
| `vitest run` de 19 archivos (los dos nuevos, vista, `ColaCierres`, `CierresAdminModule`, `CierresAdminPage`, `cobertura-tablas`, `cascada-central…`, detalle único, refresco, paginación ×4, `CierresDescarga`, `liquidacion-money-safe`) | 19 passed, 271 tests, `VT_EXIT=0` |
| `pnpm run test:guardias` | 342/343; el único rojo es `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json` (no es hallazgo) |

### Mutaciones reaplicadas (cada una revertida con `git checkout`; `git status` limpio al final)

| Mutación | Resultado |
|---|---|
| A. `recibidoCola` devuelve `"0.00"` si `montoRecibido` es null | `ColaCierresBodega.test.tsx`: 2 failed — ROJO |
| B. «Conciliados» se lee sin `filtros` (`{}`) | `CierresBodegaAdminCola.test.tsx`: 1 failed («filtrar lleva el filtro a LAS DOS lecturas…») — ROJO |
| C. `aplicarFiltros` no devuelve Conciliados a la página 1 | `CierresBodegaAdminCola.test.tsx`: 1 failed — ROJO |
| D. `faltaResaltada` devuelve siempre `true` | `ColaCierresBodega.test.tsx`: 1 failed — ROJO |
| E. (propia) quitar `CierresBodegaAdminModule.tsx` de `montajes` de la cola en el censo | `cobertura-tablas.guardia.test.ts`: 2 failed («el censo real cumple…», «una tabla compartida declara TODAS las pantallas…») — ROJO |

Coinciden con lo anotado por el implementer (A, B, C, D) y la E confirma que la guardia sigue atada al árbol.

### Guardia de cobertura de tablas (`cobertura-tablas.guardia.test.ts`)

- **Sigue vigilando lo mismo.** La regla de caducidad (`problemasMontajesPrevistos`: más de un montaje
  real + `montajesPrevistos` = ROJO) no se tocó; es ella la que obliga a quitar el campo entero, no
  solo SLT-105. Los casos (b) formato y (c) caducidad siguen ejercitando la excepción sobre una copia
  devuelta a un montaje (`conUnMontaje`), y (c) sigue partiendo de 1 montaje + previstos y añadiendo
  uno: rojo con «ya tiene 2 montajes reales». «El censo real cumple» ahora exige además
  `montajes` = 2 y `montajesPrevistos` ausente.
- **SLT-106 «Bodega satélite: A consolidar con la cola única» y SLT-108 «/cierre-dia: detalle y cola
  únicos para el mensajero» fuera de `montajesPrevistos`: no debilita la guardia para esas fichas.**
  `montajesPrevistos` era solo la licencia para que una tabla compartida tuviera UN montaje; con dos
  reales ya no hace falta. Lo que obliga a cada ficha futura a registrarse es la comparación
  `montajes` = `montajesEnElArbol(ruta)` (línea 697): cuando SLT-106 o SLT-108 monten `ColaCierres`,
  el árbol tendrá un tercer montaje y la guardia se pone roja hasta que lo añadan (la mutación E
  prueba ese mecanismo en sentido inverso). Lo único que se pierde es el **recordatorio con nombre**
  de qué fichas montarán la cola, que queda en un comentario (menor m1).
- La desviación no estaba en `## Archivos esperados` ni en el texto de R133 («dejar de listar SLT-105»):
  está justificada y anotada en la bitácora (desvío 3), pero el spec quedó desfasado (menor m2).

### Literales de contrato y negativos

- Ningún literal sustituido por su fuente: los tests nuevos escriben a mano importes (T0.2), fechas,
  folios, cabeceras, textos, nombres accesibles y conteos (37/21); `cola-cierres-vista.test.ts` compara
  `tablistCola` y los rótulos contra strings, no contra `L.*`. Las `etiquetaPaginacion` de
  `paginacion-transversal` son nombres de constante que el censo busca en el código, no valores.
- Negativos de R134 con valores imposibles por casualidad: «987.654», «45.678», «NOTA-SLT127-ZQ»,
  «Marcadora-ZQ7»; «—» se comprueba con `^—$` en la celda exacta, no solo con `not.toContain("₡0")`.
  `/modelo nuevo/i` y «Ver detalles» son textos cortos, pero su presencia sería precisamente el fallo
  que buscan, no una coincidencia.

## Trazabilidad R → test (verificado leyendo cada test)

| R | Test | ¿Lo verifica? |
|---|---|---|
| R32 | `ColaCierresBodega.test.tsx` «sin tarjetas de cifras…» (una tabla; 0 `article/figure/dl`); `cola-cierres-vista.test.ts` columnas de bodega | Sí |
| R37 | `CierresAdminPage.test.tsx` (sin cambios, verde) | Sí |
| R44 | `cola-cierres-vista.test.ts` (columnas, `accionBodegaDe`); `ColaCierresBodega.test.tsx` (cabeceras en orden); E2E `cierre-bodega-satelite.spec.ts` (incompleto en «Por conciliar», entero en «Conciliados») | Sí |
| R127 | `CierresBodegaAdminCola.test.tsx` (37/21 desde `total`, arranque en «Por conciliar», pestaña conserva filtro y página); `ColaCierresBodega.test.tsx` (tablist) | Sí (ver m3) |
| R128 | `CierresBodegaAdminCola.test.tsx` (sin Mensajero; filtro + `page: 1` en las dos lecturas; «Descargar» de la pestaña activa) | Sí; mutaciones B y C rojas |
| R129 | `ColaCierresBodega.test.tsx` (celdas literales, «—», Falta resaltada si y solo si, pastillas con token, sin enum) | Sí; mutaciones A y D rojas |
| R130 | `cola-cierres-vista.test.ts` (`accionBodegaDe`, incluido rechazado sin marca); `ColaCierresBodega.test.tsx` (nombres, variante, `abrir(id)`); `CierresBodegaAdminDetalleUnico.test.tsx` (abre el detalle) | Sí |
| R131 | `CierresBodegaAdminCola.test.tsx` (descripción; pie solo en «Por conciliar») | Sí |
| R132 | `CierresBodegaAdminCola.test.tsx` (vacío y error por pestaña); `ColaCierresBodega.test.tsx` (región, carga) | Sí |
| R133 | `censo-tablas.ts` + `cobertura-tablas.guardia.test.ts`; `cascada-central-en-las-dos-pantallas`; `CierresBodegaAdminCola.test.tsx` (tablist + tabla, sin `group`, sin lista de comprobantes, sin «Ver / decidir») | Sí; mutación E roja |
| R134 | `ColaCierresBodega.test.tsx` (negativos en las dos pestañas) | Sí |
| R135 | `ColaCierres.test.tsx` y `CierresAdminModule.test.tsx` sin tocar y verdes; columnas de mensajero en la vista | Sí |
| R71 | `liquidacion-money-safe` verde; `recibidoCola` devuelve el string del servidor | Sí |
| R72 | Diff sin `lib/`, `db/`, actions ni migraciones | Sí (revisado) |

## Hallazgos

- **m1 (menor)** — `censo-tablas.ts`: SLT-106 «Bodega satélite: A consolidar con la cola única» y SLT-108
  «/cierre-dia: detalle y cola únicos para el mensajero» quedan solo en un comentario. La guardia las
  obligará igual a registrarse (comparación con el árbol), así que no hay pérdida de vigilancia; solo
  de inventario con nombre. Nada que hacer en esta ficha.
- **m2 (menor)** — El spec quedó desfasado respecto a lo implementado: R133 dice «dejar de listar
  SLT-105 en `montajesPrevistos`» (se quitó el campo entero, porque la guardia lo exige) y
  `tasks.md > Archivos esperados` no lista `cobertura-tablas.guardia.test.ts`. Desvío justificado y
  anotado en la bitácora; conviene que el leader ajuste la frase de R133 al cerrar.
- **m3 (menor)** — R127 «conservar … la página en la que estaba cada lista»: el test
  «cambiar de pestaña conserva el filtro y la página de cada lista» solo comprueba la página de
  «Por conciliar»; la de «Conciliados» no se afirma tras ir y volver. Por construcción se conserva
  (el estado vive en el módulo, no en la pestaña), pero el título del test promete más de lo que mira.

Bloqueantes: ninguno.

## Veredicto

**OK** — 0 bloqueantes, 3 menores.
