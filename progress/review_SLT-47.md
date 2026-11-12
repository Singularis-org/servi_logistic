# Review SLT-47 «Geografía jerárquica: filtros de N niveles»

- Rama: `feature/SLT-47-geo-jerarquica-presentacion`, en `2b4c2fc1`.
- Diff contra `origin/feature/SLT-89-geo-jerarquica-zonas`: 141 archivos, +8.065/−1.355 (43 commits).
- Ruta completa (zona fullstack, complejidad medium). Fecha: 2026-11-12.

## Veredicto: **OK con menores**

No hay bloqueantes. Los menores no piden cambios de código antes del merge. M1 pide una línea de
ratificación humana en `requirements.md > Decisiones cerradas`. M2 y M3 pueden ir aquí o en SLT-48.
T7.1 y T7.2 siguen abiertas a propósito: son ensayos de una persona sobre la copia de producción.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1–R40 → test concreto | OK. Ver «Trazabilidad». R26, R31, R33, R34 y R40 se verifican por anotación o por diff, como dice el spec |
| 2 | Tasks `[x]` | OK salvo T7: T7.1 y T7.2 los corre una persona (por diseño); T7.3 queda cubierta por el CI de abajo; T7.4 es esta review. El leader marca T7.3 y T7.4 |
| 2b | Tamaño del PR | AVISO aceptado (`<!-- tamano-pr-aceptado -->` en `progress/features/SLT-47.md`). Ver M5 |
| 3 | `design.md > ## Lo que ya existe` | OK: está y no está vacía. Lo que borra el diff (`FiltroCantonDistrito`, `useFiltroCantonDistrito`, `filtro-canton-distrito.ts`) lo sustituye por diseño (§5.4); no re-crea nada de la lista |
| 3 | CHECKPOINTS / checkpoints-proyecto | OK: sin tablas nuevas, sin migraciones, sin RLS que tocar, sin secretos ni recursos de Ordenex. Entradas validadas con zod (`lugar_id` no vacía; las claves viejas dan `validation_error`) |
| 4 | Typecheck | OK: `tsc --noEmit`, rc=0 |
| 4 | Lint | OK: `eslint` sobre los 130 `.ts/.tsx` añadidos o cambiados: 0 errores y 23 avisos (variables `_x` sin usar en tests) |
| 4 | Tests relacionados | OK: 18 archivos y 239 tests en verde (filtro-ubicacion, barra, mis-asignaciones, novedades unit y URL, vistas v2, schemas, lugares-del-filtro, ruta-del-lugar, rendimiento, seleccion-a-filter-lugar, NovedadesBuscador, novedades-filtros y las guardias `sin-nodo-fk`, `sin-cte-recursiva`, `vista-filtro-formato-propio`, `catalogo-sin-instancia-de-modulo` y `etiquetas-sin-literal`) |
| 4 | CI | **OK (T7.3).** Run `43132008639` sobre `2b4c2fc1`: `gate-completo` success. Los jobs `vitest` 1/3, 2/3 y 3/3, `estatico` y los cuatro `e2e` (`e2e`, `dinero`, `aislamiento`, `reparto`) también. `geo-filtro-lugar` va en el proyecto `e2e` (`playwright.config.ts`) |
| 5 | Literales de país o moneda en código nuevo | OK: «Costa Rica» solo sale en comentarios. La guardia `etiquetas-sin-literal` está en verde |
| 5 | Dependencias nuevas | Ninguna: `package.json` solo suma dos scripts `geo:*` |
| 5 | Migraciones (R31) | Ninguna en el diff |
| 5 | Escrituras nuevas (R34) | Ninguna: no hay `create`, `update`, `delete` ni `INSERT` nuevos en producción. La v1 se traduce al leer (`leerPayloadGuardado`) |
| 5 | Código de producción guiado por tests | No aparece: ni `NODE_ENV`, ni `VITEST`, ni ramas para tests |
| 5 | Comentarios explican el porqué | OK |

## CR se ve igual (pedido del leader)

- **Columnas de descarga:** el diff no toca columnas, descargas, exportes ni `page.tsx`. Nombres y
  orden siguen iguales.
- **Vistas guardadas y enlaces viejos:** `deV1` renombra `provincia_id`, `canton_id` y `distrito_id` a
  `nivel_1..3`, en la selección y en `activos`. `traductorPorId` acepta las claves viejas, con comas o
  repetidas. El e2e `geo-filtro-lugar` comprueba que la barra, `?canton_id=` y una vista v1 dan las
  mismas guías (R39). Solo `/ordenes` tiene vistas (`SUPERFICIES_VISTA = ["ordenes"]`).
- **Permisos:** sin cambios en actions, páginas ni roles. `FiltrosOrdenesService` mantiene el recorte
  por rol. El de zona recibe `listLugaresDeFiltro(zonaId)` con el mismo conjunto que
  `listGeografiaLitePorZona`: la extracción de `nodosDeLaZona` es un movimiento literal.
- **Controles de `/ordenes`, satélite y analítica:** mismos rótulos, orden, búsqueda y encadenado
  (R6, con test campo a campo). Los placeholders siguen en el «Todos» por defecto, como hoy. Un
  nombre repetido en su lista sale con sus ancestros: lo autorizó el humano (fila «Homónimos»).

## Diff de `tests/` contra la base (R38)

Revisé cada línea `-` de los 59 tests que ya existían.

**Dentro de la regla de R38** (la clave de transporte o el SQL de la faceta, solo en esas líneas):
- `provincia_id`, `canton_id` y `distrito_id` pasan a `nivel_k` en las barras, y a `lugar_id` o
  `lugarIds` en el transporte. Archivos: `ordenes-filtros-def`, `filtros-acotados-por-rol`,
  `FiltrosEntregas`, `EntregasFiltroConectado`, `entregas-filtro-analitica`, `seleccion-a-filter`,
  `ordenes-listado-filtros`, `orden-filter-144`, `orden-service-filtros`, `conteo-entregas-contrato`,
  `recepcion-satelite-*`, `geografia-historico-intacto` y `satelite-conjunto-sql-real`.
- El SQL de la faceta: `satelite-paginado-where` (`IN (?)` pasa a `sqlLugarEn`), y
  `ciclo-vida`, `conteo-cargadas-servicio` y `conteo-por-status-sql` (de 3 condiciones a 1).
  `orden-repository-filtros` cambia la forma del `where` (`AND: [whereLugarEn]`, y vacío pasa a
  `id IN []`). Lo que prueba sigue igual: falla cerrado y no cuela los NULL.
- Solo entrada (dobles y fixtures): `gestion-orden-repository`, `SateliteDescarga`,
  `SatelitePaginacion`, `RepartoModule`, `AppLayout`, `OrdenesPageFiltros`, `geo-analitica-lugar`,
  `geo-lecturas-sin-backfill`, `ciclo-vida-gestion-final` y los `vi.mock` de
  `use-niveles-geograficos`. Las aserciones de SLT-71 se mantienen porque la entrada se traduce como
  la barra (`rawConLugar`).

**Autorizadas en «Decisiones cerradas»:**
- `filtros-ordenes-service`: suma `niveles` y `lugares`.
- `orden-repository.novedades`: suma `cantonId` y `distritoId`.
- `v: 1` pasa a `v: 2` en `buscador-filtros-vistas`, `ordenes-listado-vistas` y
  `vistas-filtro-aviso-incompleta`.
- `v: 2` pasa a `v: 3` en `vista-filtro-payload:124,148` y `vista-filtro-service:235`.
- `NovedadesBuscador` suma «Distrito».

**Fuera de las dos listas:** M1.

## Hallazgos

### BLOQUEANTE
Ninguno.

### menor

- **M1 · R38: `tests/unit/repositories/lugares-del-filtro.test.ts` pierde casos de SLT-71 que ninguna
  decisión cerrada nombra.** Se quitan tres casos:
  - «R3: un id de otro nivel no aporta» (`{distrito_id:["C3",…]}` daba `{distrito:["D4"]}`);
  - «un nodo de nivel 4 pedido como distrito no casa»;
  - «varias facetas se resuelven cada una por su lado».

  No es un renombre de clave ni un cambio de texto SQL: cambia la semántica. Con `lugar_id` sin
  nivel, el id de un cantón ya no da cero. Esto lo exige el diseño aprobado (§3.1, T2.1 «ajustado»),
  el implementer lo avisó al leader («Bloqueos» 3 de `impl_SLT-47.md`) y R11/R12 lo cubren con casos
  nuevos. En la equivalencia de integración, el «hoy» conserva la regla con `LUGAR_INEXISTENTE`.

  Falta una línea del humano en «Decisiones cerradas» que lo ratifique, como en las demás
  excepciones. Lo mismo vale para `tests/unit/filtro-canton-distrito.test.ts`, que se borra (T5.1 lo
  prevé). Sus 12 casos están en `mis-asignaciones/FiltroUbicacion.test.tsx`, con las mismas
  expectativas pero por id en vez de por nombre normalizado. Pido anotarlo antes del merge.

- **M2 · En `/novedades` de CR cambia el texto vacío de «Provincia».** Hoy la provincia declaraba
  `placeholder: "Todas"` y `emptyMessage: "Ninguna provincia coincide"`, y el cantón
  `"Ningún cantón coincide"`. `declararNiveles` no pone ni placeholder ni mensaje, así que salen los
  por defecto de `MultiSelectFilter`: «Todos» y «Sin coincidencias». La maqueta pinta
  «Provincia: Todas ▾». Es solo texto y ningún test lo fija. Arreglo sugerido: que `declararNiveles`
  acepte el placeholder por género que ya calcula `todosLosDelNivel` (mis-asignaciones), y que
  novedades lo use. En `/ordenes` hoy también sale «Todos», así que allí R6 se cumple tal cual.

- **M3 · Catálogo de filtros de CR: de 78 KB a 166 KB.** Está medido y anotado, como pide la decisión
  de R36. `lugares` repite los nodos de nivel 1 a 3 que ya van en `provincias`, `cantones` y
  `distritos`. En el cliente, las tres listas planas solo sirven de respaldo en
  `opcionesDeLugarDelCatalogo`, cuando `cat.lugares` no llega. No bloquea: es un JSON una vez por
  carga y se comprime bien. Sugiero que SLT-48 «Geografía jerárquica: retirar modelo viejo» quite las
  listas planas del DTO (design §11 ya lo dice).

- **M4 · `TRADUCTOR_URL_NOVEDADES` (activación tardía): correcto, con un efecto cosmético.**
  - El envoltorio solo actúa mientras ninguna lista de nivel tiene opciones. Entonces activa las
    listas que pide la URL con los valores crudos. `FilterComponent` los descarta, deja la clave
    pendiente y vuelve a sembrar con la traducción buena cuando llegan las opciones. Es puro y de
    identidad estable. No toca `FilterComponent` ni `BuscadorFiltros` más allá del `traductorUrl`
    opcional, que sin traductor no cambia nada.
  - El efecto: con `?lugar_id=<id de nivel 1>`, mientras no hay opciones se activan las N listas.
    Cuando llegan, solo se elige la de nivel 1, y las de nivel 2 y 3 quedan montadas y vacías.
  - Ningún test de pantalla cubre `?lugar_id=` en novedades. `NovedadesFiltroLugarUrl` cubre
    `?provincia=&canton=`. A nivel puro, `traductorPorNombre` sí traduce `lugar_id`.
  - Sugiero un caso de componente con `?lugar_id=` en novedades.

- **M5 · Tamaño real frente a lo aceptado.** El humano aceptó «81 archivos / ~4.100 líneas» (P6), y
  el diff contra la base da 141 archivos y +8.065/−1.355. Unas 1.500 líneas son spec y bitácora; el
  resto, sobre todo tests nuevos y los dos scripts. `tamano-pr.mjs` mide contra `dev` (558/70.860,
  con toda la pila geo) y da la aceptación por buena. Hay que decírselo al humano al pedir el merge.

- **M6 · Orden estable de homónimos en novedades.**
  - `listasDeLugar` ordena por el nombre sin ancestros (`nombreDeOpcion`) con `sort` estable (ES2019).
    Los homónimos quedan juntos, en el orden en que aparecen en el conjunto.
  - Es determinista para cada carga, pero no alfabético por ancestro: hoy puede salir «Central · San
    José» antes que «Central · Alajuela», y otro día al revés si cambia el conjunto.
  - Es aceptable: lo eligió el implementer para no tocar `novedades-filtros-lugar.test.ts:213`, un
    test nuevo de SLT-47.
  - Si se quiere orden por ancestro, cambia solo ese test nuevo, sin pedir autorización por R38.

- **M7 · Orden de las opciones para el rol de zona (sin comprobar en datos).**
  - Para el adminSatelite, `listGeografiaLitePorZona` ordenaba sus listas con
    `localeCompare("es", {sensitivity:"base"})`. `listLugaresDeFiltro(zonaId)` deja el orden del
    catálogo, `ORDER BY nombre, id` con la collation de la base.
  - Si la collation no es la de `es`, el orden de las opciones con tilde puede variar frente a hoy
    («Ángeles»).
  - Para maestro y admin no cambia nada: hoy ya usaban el orden del catálogo.
  - No pude medirlo: la conexión a `logistic_slt47` desde un script suelto falló al resolver la URL,
    y no seguí.
  - Sugiero ordenar `lugares` por nombre con `localeCompare("es")` en la rama de zona, o comprobarlo
    en T7.1.

- **M8 · `scripts/tamano-pr.mjs` no está en el worktree.** Lo corrí desde la raíz del repo. No es de
  esta feature.

## Trazabilidad (R → test que lo prueba de verdad)

| R | Test |
|---|---|
| R1, R2 | `filtro-ubicacion.test.ts` (it.each con 2, 3, 4 y 10 niveles, y país de 2); `pais-service.test.ts` (`nivelesDeEmpresa`) |
| R3 | `FiltroUbicacionBarra.test.tsx` (P4, hijos, poda) |
| R4 | `filtro-ubicacion.test.ts` («se para en cualquier nivel») |
| R5 | `FiltroUbicacionBarra.test.tsx` (`flex-wrap` con 10 niveles) |
| R6 | `filtro-ubicacion.test.ts` (CR comparado con la declaración de hoy, campo a campo) |
| R7 | `mis-asignaciones/FiltroUbicacion.test.tsx` (CR, 4 niveles y 2 niveles) |
| R8 | `novedades-filtros-lugar.test.ts`; `NovedadesBuscador.test.tsx` («Distrito») |
| R9 | `filtro-ubicacion.test.ts`; `seleccion-a-filter-lugar.test.ts`; novedades; mis-asignaciones |
| R10 | `filtro-lugar-schemas.test.ts` |
| R11, R12 | `lugares-del-filtro.test.ts`; `geo-filtros-lugar.test.ts`; `orden-repository-filtros.test.ts` |
| R13 | `geo-filtros-lugar.test.ts` (dos «San Rafael» y dos «Central», CR y XA); mis-asignaciones; novedades |
| R14 | `geo-filtros-lugar.test.ts` (AND con zona y tienda; satélite dentro de su zona) |
| R15 | `geo-filtros-lugar.test.ts` (`nodo_geografico_id` en NULL); guardia `sin-nodo-fk` ampliada; `sin-cte-recursiva` (barre `lib/` y `scripts/` enteros) |
| R16 | `ruta-del-lugar.test.ts`; `geo-filtros-lugar.test.ts` |
| R17, R18, R20, R21 | `filtro-ubicacion.test.ts`; `FiltroUbicacionBarra.test.tsx`; e2e (R18) |
| R19 | `filtro-ubicacion.test.ts`; `novedades-filtros-lugar.test.ts`; `NovedadesFiltroLugarUrl.test.tsx` |
| R22–R24 | `vista-filtro-v2.test.ts`; `vista-filtro-service`/`payload` (versión 3 como desconocida) |
| R23, R39 | `e2e/geo-filtro-lugar.spec.ts` (verde en CI) |
| R25, R35 | Guardias sin cambios y en verde |
| R26 | Abierta por diseño (T7.2, persona sobre la copia de producción) |
| R27 | `geo-filtros-lugar.test.ts` (frente a la columna de hoy); `geo-equivalencia-filtros.test.ts` |
| R28, R30 | `geo-equivalencia-filtros.test.ts` (salida 0 o 1, incoherentes aparte, `25006`, URL no local da 2) |
| R29 | `geo-explain-filtros.test.ts` (+19 %, +21 %, Seq Scan nuevo, y que el «después» es el SQL de `lib/`) |
| R31 | Diff sin migraciones |
| R32 | `filtro-ubicacion-rendimiento.test.ts` (medidas anotadas: 66, 114 y 87 ms; umbral 200 ms) |
| R33 | `impl_SLT-47.md > T0`: maqueta aprobada el 2026-11-11 con su referencia. Lo implementado la sigue (listas por nivel, P4 sin bloqueo, mis-asignaciones «Cantón (Provincia)», homónimos con ancestros, distrito nuevo en novedades), salvo M2 |
| R34, R40 | Diff: sin escrituras nuevas; nada de descargas, etiqueta, PDF, tarjetas, chat, `ubicacion_snapshot` ni geocodificación. `NivelGeografico`/`PROFUNDIDAD_DEL_NIVEL` siguen definidos (solo se deja de importar en `lugares-del-filtro.ts`) |
| R36 | `geo-filtros-lugar.test.ts` (zona de 4 niveles); `filtros-ordenes-service.test.ts` |
| R37 | `geo-filtros-lugar.test.ts` (XA dentro de CR da 0; plataforma da `EmpresaNoResuelta`); `lugares-del-filtro.test.ts` |
| R38 | CI en verde (incluidos `mis-asignaciones`, `recepcion-satelite`, `asignacion-satelite` y `dos-empresas-humo`) y el diff de `tests/` de arriba |

## Lo que no corrí

- La suite completa y el E2E: los corrió el CI (run `43132008639`).
- Los tests de integración contra `logistic_slt47`: los cubre el CI. Mi único intento de leer esa base
  local (M7) no conectó.
- El MCP del grafo no lo usé: la revisión fue por diff, Grep y Read.
