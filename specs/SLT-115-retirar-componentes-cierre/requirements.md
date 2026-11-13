# SLT-115 «Retirar los componentes de cierre sustituidos» — requirements

> Ruta: **ligera**. Zona: frontend. Escrito por spec_author el 2026-11-13.
>
> Rebanada **S16** del rediseño de cierres (`specs/SLT-95-detalle-cierre-rediseno/design.md`, tabla
> «Qué sustituye cada componente», líneas 223-240, y línea 61: «S16 retira código de pantalla, no
> contratos»). Rama apilada sobre SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (#153),
> que aún no mergea. Va **después** de SLT-134 «Textos de pantalla de cierres en tú, con guardia».
> Rango: **R400-R409** (R390-R399 los reserva SLT-134; el más alto mergeado en `specs/` es R389).
> No viene sembrado por `/afinar-feature`.
>
> El grafo (`codebase-memory-mcp`) no tiene índice de este worktree (`index_status`: «project not
> found»): el inventario sale de Grep sobre el árbol de la rama, a fecha 2026-11-13.

## Alcance

S16 entera no cabe en un PR (ver `## Tamaño` y P3). Esta ficha es la **primera rebanada: las colas
viejas y las columnas de descarga sin consumidor**, el alcance que el leader ya fijó
(`progress/features/SLT-115.md > Decisiones`).

Entra:

1. Borrar las tres listas de comprobantes que sustituyó `ColaCierres` y su contenedor común.
2. Mudar, sin cambiar una línea, lo que esas listas aún exportan a un consumidor vivo (descargas,
   etiquetas de paginación, tipos de página) al único módulo que lo usa.
3. Quitar el último montaje vivo de `CierresBodegaSolicitadosLista`: la satélite **sin zona** (P1).
4. Retirar de `cierre-dia-descarga-columnas.ts` los cinco catálogos por resultado que dejó sin uso
   SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (su R256), y
   `desgloseDescarga`, que solo usaban ellos.
5. Una guardia que falla si algo de lo retirado reaparece o se vuelve a importar.

### Inventario (evidencia)

**Se borra (archivo entero):**

| Archivo | Importadores en `app/`, `components/`, `lib/` | Por qué está sin uso |
|---|---|---|
| `app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx` | `CierresAdminModule.tsx:121-127` importa solo `ERROR_CARGA_HISTORICO`, `PAGINACION_HISTORICO_LABEL`, `VACIO_HISTORICO`, `descargaHistoricoCierres` y el tipo `CierresAdminHistoricoPagina` | `<CierresAdminHistoricoLista` no se monta en ningún archivo (Grep `<CierresAdminHistoricoLista`: solo su declaración, `:135`). Lo sustituyó `ColaCierres` (SLT-102 «Cola de cierres única: mensajeros (central y satélite)», R107). |
| `app/(app)/cierres-admin/_components/CierresBodegaResueltosLista.tsx` | `CierresBodegaAdminModule.tsx:52-55` importa solo `descargaBodegaResueltos` y el tipo `CierresBodegaResueltosPagina` | El componente no se monta (`:120` es su declaración; ningún `<CierresBodegaResueltosLista` en `app/`). Lo sustituyó la pestaña «Conciliados» de `ColaCierres` (SLT-127 «Cola de bodega de la central con la cola única»). |
| `app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista.tsx` | `ConsolidacionBodegaModule.tsx:52-57` importa el componente, `PAGINACION_BODEGA_SOLICITADOS_LABEL`, `descargaBodegaSolicitados` y el tipo `CierresBodegaSolicitadosPagina` | Único montaje: `ConsolidacionBodegaModule.tsx:538`, `{sinZona ? <CierresBodegaSolicitadosLista …/> : null}`. Sin zona la lista **siempre** está vacía: `CierreBodegaService.ts:403-406` devuelve `items: []` cuando `findUsuarioZonaId` da `null`. Con zona la sustituyó `ColaCierres` (SLT-107 «Satélite: Solicitados y el cierre de bodega en lectura»). |
| `app/(app)/cierres-admin/_components/ListaComprobantes.tsx` | Solo las tres listas de arriba (`CierresAdminHistoricoLista.tsx:13`, `CierresBodegaResueltosLista.tsx:18`, `CierresBodegaSolicitadosLista.tsx:16`) | Cae con ellas. |

**La función de descarga de `CierresBodegaSolicitadosLista` sigue viva** (pregunta del leader):
`descargaBodegaSolicitados` (`:89-107`, con el cambio de SLT-141, R384/R385) la monta la pestaña
«Solicitados» de la cola (`ConsolidacionBodegaModule.tsx:455`). No se borra: se muda (R401). Igual
`descargaHistoricoCierres` (`CierresAdminModule`) y `descargaBodegaResueltos` (`CierresBodegaAdminModule`).

**Se poda (el archivo sigue):**

| Archivo | Se retira | Se queda (consumidor) |
|---|---|---|
| `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts` | `AMBITO_DESCARGA_DIA_{ENTREGADAS,REPROGRAMADAS,DEVUELTAS,RECHAZADAS,INCIDENTES}`, `COLUMNAS_DESCARGA_DIA_{…}` y `filaDescargaDia{Entregada,Reprogramada,Devuelta,Rechazada,Incidente}`, `TIENE_EVIDENCIA_COL/_SI/_NO`, `FECHA_GESTION_COL` y sus ayudantes privados (`COMUNES`, `ubicacion`, `celdasComunes`, `tieneEvidencia`). Consumidores en `app/`/`components/`/`lib/`: ninguno (Grep: solo el propio archivo y comentarios en `cierres-gestiones-fundida-descarga-columnas.ts:103,172` e `ICierresAdminService.ts:280`). | `GANANCIA_COL` (`detalle-cierre-descarga-columnas.ts:22`); `AMBITO_`/`COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS` y `filaDescargaDiaCierrePasado` (`CierreDiaModule.tsx:78-82`). |
| `app/(app)/cierres-admin/_components/desglose-pago.ts` | `desgloseDescarga` (`:59`). Su único consumidor es `cierre-dia-descarga-columnas.ts:35,155`, dentro de lo que se retira arriba. | `desglosePantalla`, `montoPorMetodo`, `MEDIOS_PAGO`, `CLAVE_MEDIO_PAGO`, `SEPARADOR_DESGLOSE`, `LineaPagoDTO`. |

**Tiene consumidor vivo: NO se toca en ninguna rebanada de S16** (la tabla del madre los daba por
retirables):

| Símbolo | Consumidor vivo |
|---|---|
| `BotonesEvidencia` (`botones-evidencia.tsx`) | `components/private/cierres/fila/FilaGestion.tsx:11,269` |
| `TotalesPanel` | `CorregirResultadoDialog.tsx:196` |
| `PanelConmutado` | `CierresTabs.tsx:9,84,87`; `CierresTabs` lo monta `cierres-admin/page.tsx:24` |
| `ConsolidacionBodegaModule.tsx` | es la pantalla de la satélite (monta `ColaCierres`); se edita en sitio (R403) |
| `marcaDeVariasTiendas` (`DesglosePorTienda.tsx:111`) | `detalle-cierre-vista.ts:48,705,731` |
| `lineasCascadaCentral` (`cascadas-bodega.ts:46`) | `detalle-cierre-vista.ts:47` |
| De `cierre-factura.tsx`: `FILA_*`, `RECHAZOS_*`, `separarParaDevolucion`, `efectoAlAprobar`, `SeccionSinGestion`, `CierreFacturaAudiencia` | `FilaGestion.tsx:17-21`, `RechazosDeTiendaCierre.tsx:7-17`, `CierreDiaModule.tsx:38`, `CierresAdminModule.tsx:80` |

### Lo que NO entra

- **Rebanada siguiente A — cascadas del detalle viejo de mensajero** (P3): `CascadasCierreMensajero.tsx`
  (ningún importador fuera de `tests/`; SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»
  lo dejó sin ruta), `CascadaDinero.tsx` (importadores: `DesglosePorTienda.tsx:9`,
  `CascadasCierreMensajero.tsx:10`, y el tipo `LineaCascada` en `cascadas-bodega.ts:33`), el componente
  `DesglosePorTienda` (solo lo monta `CascadasCierreMensajero.tsx:380`) y `lineasCascadaDueno`
  (`cascadas-bodega.ts:102`, sin consumidor). Arrastra el fixture `tests/fixtures/detalle-cierre-admin-anterior.tsx`
  y ~7 tests.
- **Rebanada siguiente B — podar `cierre-factura.tsx`** (P3): quedan sin montar `CierreFacturaResumen`,
  `CierreBodegaFacturaResumen`, `CierreFacturaResumenPropio`, `CierreConsolidableFacturaResumen`,
  `CierreFacturaDetalle`, `GestionesPorResultado` y la hoja de impresión. ~25 archivos de `tests/`
  importan `cierre-factura` (Grep): no cabe aquí. Hasta entonces R409 vigila que nadie los vuelva a
  montar.
- `listarCierresBodegaAdmin` sin paginar (SLT-105 «Cola de bodega de la central», `requirements.md:118`)
  y `listarCierresImputables` sin alcance (deuda D63): son contratos de `lib/`. S16 no retira contratos
  (madre, `design.md:61`); van a ficha propia por la ruta completa.
- Etiquetas de `cierre-labels.ts` que queden sin uso: son textos del censo de SLT-134; no se tocan.
- Comentarios que citan lo retirado fuera de los archivos de la lista (`ICierresAdminService.ts:280`,
  `cierres-gestiones-fundida-descarga-columnas.ts:103,172`, `tests/unit/descarga/censo-tablas.ts:115,131`):
  `lib/` no se toca (R407) y los otros son historia; no rompen nada.
- Nada de dinero, permisos, esquema ni migraciones.

### Con SLT-134 «Textos de pantalla de cierres en tú, con guardia»

- Su censo (`tests/fixtures/censo-cierres.ts`, SLT-134 `design.md:58-80`) se define **por árboles**
  (`app/(app)/cierres-admin`, `app/(app)/cierre-dia`, `components/private/cierres`…), no por lista de
  archivos. Los cuatro archivos borrados salen solos; **no hay que tocar ni el censo ni su fixture**.
  Su control positivo (R145: más de 60 archivos, y `CierreDiaModule.tsx`, `CierresAdminModule.tsx`,
  `conciliacion-labels.ts`, `CierreDiaService.ts`) sigue cumpliéndose: ~98 → ~94 archivos.
- Ninguna fila del inventario de SLT-134 vive en un archivo que esta ficha borra (Grep de los cuatro
  nombres en su spec: cero). No se pierde ninguna traducción.
- Lo que se muda (R401, R402) se muda **con el texto que deje SLT-134**, sin cambiarlo. Vive en archivos
  del censo, así que su guardia de trato lo sigue vigilando.
- `ConsolidacionBodegaModule.tsx` lo tocan las dos (SLT-134, los toasts con voseo; esta, la rama sin
  zona y la mudanza). Como SLT-134 mergea antes, esta ficha rebasa sobre ella antes de T2.

## Decisiones (no reabrir)

| # | Fecha · quién | Decisión | Requisitos |
|---|---|---|---|
| L1 | 2026-11-13 · leader | Entran `CierresBodegaSolicitadosLista` y las columnas de descarga sin consumidor. | R400, R404, R405 |
| L2 | 2026-11-13 · leader | Orden SLT-141 → SLT-134 → SLT-115. | R401 (se muda el texto de SLT-134) |
| M61 | madre `design.md:61` | S16 retira código de pantalla, no contratos. | R407 |
| E1 | 2026-11-13 · spec_author | Lo vivo de una lista retirada se muda **sin cambiar una línea** a su **único** módulo consumidor, que es el que ya monta su `<Pagination>` y su «Descargar» (como `descargaConsolidables`, que ya vive en `ConsolidacionBodegaModule.tsx:225`). | R401, R402 |
| E2 | 2026-11-13 · spec_author | R3 de la feature 230 («las constantes de la marca de evidencia siguen vivas para las descargas por sección», `cierres-gestiones-fundida-descarga-columnas.test.ts:844`) queda sin objeto: ya no hay descargas por sección. Mismo camino que la FICHA 482 con las del admin. | R404 |
| E3 | 2026-11-13 · spec_author, **pendiente de P1** | Sin zona, la satélite ve solo el aviso. Reemplaza a R202 de SLT-106 «Satélite: A consolidar con la cola única». | R403 |

## Requisitos (EARS)

- **R400** — Los archivos `CierresAdminHistoricoLista.tsx`, `CierresBodegaResueltosLista.tsx`,
  `CierresBodegaSolicitadosLista.tsx` y `ListaComprobantes.tsx` de `app/(app)/cierres-admin/_components/`
  NO DEBEN existir, y ningún archivo de `app/`, `components/`, `lib/`, `tests/` ni `e2e/` DEBE
  referenciar su ruta en un `import`, un `export … from`, un `import()`, un `import type` ni un
  `vi.mock(…)`.
  *Test:* `tests/unit/guards/cierres-retirados.guardia.test.ts` (nueva).
- **R401** — Las descargas «Cierres del día resueltos» (central, mensajeros), «Cierres de bodega
  resueltos» (central, bodega) y «Cierres de bodega solicitados» (satélite) DEBEN producir el mismo
  archivo que antes de esta ficha: mismo título, columnas, ámbito de columnas, filtros que viajan y libro
  del modelo nuevo.
  *Test:* `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` y
  `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (solo cambia la ruta del import;
  ninguna aserción cambia) y `tests/components/descarga/CierresDescargaColumnas.test.tsx` (superficies
  «Cierres de bodega solicitados», `:662-667`, y las de la central, sin cambios).
- **R402** — Los controles de paginación de la pestaña de resueltos de `/cierres-admin` (mensajeros) y de
  «Solicitados» de la satélite DEBEN conservar su nombre accesible
  (`PAGINACION_HISTORICO_LABEL`, `PAGINACION_BODEGA_SOLICITADOS_LABEL`), y `app/` DEBE seguir exportando
  exactamente trece `PAGINACION_…_LABEL`, cada uno desde el archivo que monta su `<Pagination>`.
  *Test:* `tests/components/paginacion/paginacion-transversal.test.tsx` (las dos filas del Anexo III
  apuntan a `CierresAdminModule.tsx` y `ConsolidacionBodegaModule.tsx`; sin `lector`) y
  `tests/unit/config/paginacion-dominios.test.ts`.
- **R403** (E3, P1) — SI la satélite no tiene zona asignada, ENTONCES `ConsolidacionBodegaModule` DEBE
  pintar solo el aviso (`role="alert"`), sin cola, pestañas, tarjetas, botón de solicitar ni región
  «Cierres de bodega solicitados».
  *Test:* `tests/components/ConsolidacionBodegaRefresco.test.tsx` (los casos de `:316` y `:514` pasan a
  afirmar la ausencia de la región, y el `useSWR` de solicitados sigue sin pedir nada con `sinZona`).
- **R404** (L1, E2) — `cierre-dia-descarga-columnas.ts` DEBE exportar exactamente `GANANCIA_COL`,
  `AMBITO_DESCARGA_DIA_CIERRES_PASADOS`, `COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS` y
  `filaDescargaDiaCierrePasado`.
  *Test:* la guardia nueva (las claves de `import * as` del módulo, comparadas con esa lista literal) y
  los casos de cierres pasados que se conservan en `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`.
- **R405** (L1) — `desglose-pago.ts` NO DEBE exportar `desgloseDescarga`, y DEBE seguir exportando
  `desglosePantalla` y `montoPorMetodo`.
  *Test:* la guardia nueva y `tests/unit/guards/pagos-captura.guardia.test.ts` (sale la fila de
  `cierre-dia-descarga-columnas.ts` de `MODULOS_DE_DESCARGA`, `:337-340`; la de la fundida sigue).
- **R406** — La descarga «Cierres solicitados» de `/cierre-dia` y la de «Gestiones» del detalle del
  mensajero DEBEN conservar sus columnas, en su orden y con sus encabezados.
  *Test:* `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` (casos de cierres pasados, esperado
  literal) y `tests/components/descarga/CierresDescargaColumnas.test.tsx` (superficie «Cierres
  solicitados», `:668-674`).
- **R407** (M61) — El diff de esta ficha NO DEBE tocar `lib/`, `db/` ni `e2e/`, ni cambiar un importe, un
  estado, un permiso o un contrato de servicio.
  *Verificación:* `git diff --name-only origin/dev...HEAD` sin rutas de `lib/`, `db/` ni `e2e/` (T6), y
  la suite de `/cierres-admin` y `/cierre-dia` en verde.
- **R408** — La guardia nueva DEBE tener control positivo y contraprueba: DEBE comprobar que barre más de
  50 archivos de `app/` y más de 200 de `tests/`, y DEBE dar hallazgo, con el archivo y el especificador,
  sobre fuentes de muestra con cada forma de R400 (`import`, `export … from`, `import()`, `import type`,
  `vi.mock`, con alias `@/` y con ruta relativa). La guardia se excluye a sí misma del barrido.
  *Test:* la propia guardia.
- **R409** — MIENTRAS `CierreFacturaResumen` y `CierreBodegaFacturaResumen` sigan declarados en
  `cierre-factura.tsx`, ningún archivo de `app/` DEBE montarlos.
  *Test:* `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`: las superficies
  esperadas de la tarjeta de bodega (`:152-159`) y los ajenos (`:176-186`) pasan a `[]`, y el
  `it.each` sobre `USOS_BODEGA` (`:195`) se cambia por una aserción que no quede vacía con cero usos.

## Tests que cubren lo retirado

Regla: **ningún caso de comportamiento vivo se pierde.** Un caso que monta una lista retirada se borra
solo si lo que mide ya no existe en ninguna pantalla, o si el mismo comportamiento lo cubre un test de la
pantalla viva. T0 escribe ese mapa (caso → test vivo que lo cubre, o «sin pantalla viva») en
`progress/impl_SLT-115.md`. Si un caso no tiene equivalente vivo y su comportamiento sí está en
pantalla, se porta a `ColaCierres`/`DetalleCierre` en vez de borrarlo, y el implementer lo avisa.

| Archivo | Qué cambia | Por qué |
|---|---|---|
| `tests/components/CierreBodegaTarjetaCascada.test.tsx` | sale el caso `:206` (monta las dos listas, R38 de la 393) | la tarjeta ya no se monta en ninguna pantalla (R409); los casos sobre `CierreBodegaFacturaResumen` se quedan hasta la rebanada B |
| `tests/components/CierreBodegaMarcaConciliacion.test.tsx` | sale el `describe` de `:244` («lo que ve la bodega satélite», monta la lista en `:254`) e import `:47` | la satélite ve la marca en la cola y el detalle de SLT-107; el mapa de T0 cita el test vivo |
| `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx` | sale el caso `:224` (monta las dos listas) e imports `:45-46` | igual que arriba; el resto del archivo (cascadas, D39) no se toca |
| `tests/components/CierreDiaColaPropia.test.tsx` | sale el `vi.mock` de `:41-43` y la aserción `:163` | el módulo ya no existe; que no vuelva lo afirma R400 |
| `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` · `CierresBodegaResumenModeloNuevo.test.tsx` | solo la ruta del import (`:57`; `:54-55`) | R401 |
| `tests/components/descarga/CierresDescargaColumnas.test.tsx` | comentario `:675-679` | dice que los catálogos siguen «hasta SLT-115» |
| `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` | salen los casos de las cinco secciones; se quedan los de cierres pasados | R404, R406 |
| `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` | sale el caso `:844-854` e import `:37-42` | E2 |
| `tests/components/ConsolidacionBodegaRefresco.test.tsx` | casos `:316`, `:514` | R403 |
| `tests/components/paginacion/paginacion-transversal.test.tsx` | filas `:239-246`, `:280-287` | R402 |
| `tests/unit/config/paginacion-dominios.test.ts` | salen `:199-201` (sus módulos ya están en la lista) | archivos borrados |
| `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` | salen `:117-118` de `SUPERFICIES_ENTERAS` | archivos borrados |
| `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts` | R409 | archivos borrados |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | sale `:51` | archivo borrado |
| `tests/components/CierresAdminPagoMensajero.test.tsx` | sale `:934` | archivo borrado |
| `tests/unit/guards/pagos-captura.guardia.test.ts` | R405 | la descarga del mensajero ya no lleva pagos |

`tests/unit/guards/cierres-fecha-cr.guardia.test.ts` no cambia: pide ≥ 30 archivos en
`app/(app)/cierres-admin` (quedan ~39) y que `cierre-dia-descarga-columnas.ts` esté entre los revisados
(sigue existiendo).

## Tasks

- [ ] **T0 — Medir antes de tocar.** Rebasar sobre `origin/dev` (con SLT-141 y SLT-134 dentro si ya
  mergearon) y copiar `.env` al worktree. Repetir los Grep del inventario: si aparece un importador nuevo
  de algo de la lista, parar y avisar. Escribir el mapa de cobertura (sección de arriba) en
  `progress/impl_SLT-115.md`.
  *Hecho:* inventario confirmado con `archivo:línea` y mapa de cobertura escrito, sin casos «sin cubrir».
- [ ] **T1 — Guardia en rojo (R400, R404, R405, R408).** Crear `tests/unit/guards/cierres-retirados.guardia.test.ts`.
  *Hecho:* la contraprueba y el control positivo pasan; los casos de R400, R404 y R405 fallan nombrando los
  cuatro archivos y los exports que aún existen.
- [ ] **T2 — Mudar lo vivo (R401, R402).** Depende de T0. Sin cambiar una línea: `descargaHistoricoCierres`,
  su título, `PAGINACION_HISTORICO_LABEL`, `ERROR_CARGA_HISTORICO`, `VACIO_HISTORICO` y
  `CierresAdminHistoricoPagina` → `CierresAdminModule.tsx`; `descargaBodegaResueltos`, su título y
  `CierresBodegaResueltosPagina` → `CierresBodegaAdminModule.tsx`; `descargaBodegaSolicitados`, su título,
  `PAGINACION_BODEGA_SOLICITADOS_LABEL` y `CierresBodegaSolicitadosPagina` → `ConsolidacionBodegaModule.tsx`.
  Actualizar los imports de los tests de R401 y las filas de R402.
  *Hecho:* typecheck verde; los tests de R401 y R402 verdes sin tocar una aserción.
- [ ] **T3 — Sin zona (R403).** Depende de T2. Quitar el montaje de `ConsolidacionBodegaModule.tsx:535-538`
  y el comentario de `cola-cierres-labels.ts:178-181` que lo cita.
  *Hecho:* `ConsolidacionBodegaRefresco.test.tsx` verde con R403.
- [ ] **T4 — Borrar las cuatro (R400, R409).** Depende de T2 y T3. Borrar los cuatro archivos y aplicar los
  cambios de tests de la tabla de arriba (salvo los de T5).
  *Hecho:* la parte R400 de la guardia de T1 en verde; `cascada-central…` y `cierre-bodega-vocabulario…` en
  verde con R409.
- [ ] **T5 [P] — Columnas sin consumidor (R404, R405, R406).** Depende solo de T1; va en paralelo con T2-T4.
  Podar `cierre-dia-descarga-columnas.ts` y `desglose-pago.ts`; ajustar sus tests y la guardia de pagos.
  *Hecho:* la guardia de T1 entera en verde; R406 verde con su esperado literal sin cambios.
- [ ] **T6 — Cierre.** `./init.sh` verde; comprobar R407 con `git diff --name-only`; Grep de los nombres de
  la lista en `app/`, `components/`, `lib/`, `tests/` y `e2e/` (solo comentarios de historia, ninguno en
  código). Mapa `R400-R409 → test` en `progress/impl_SLT-115.md`. Correr en local
  `e2e/cierre-bodega-satelite.spec.ts` y `e2e/cierres-rediseno.spec.ts` (tocan las pantallas, regla
  E2E en local de `docs/perfil-agentes.md`).
  *Hecho:* gate verde, mapa escrito, E2E verdes.

## Tamaño

- **Archivos: 28 de 40** (70 %; aviso al 80 % = 32). Cabe.
- **Líneas: ~1 900 de 1 000** (añadidas + borradas). Estimación: ~880 borradas de producción (las cuatro
  listas suman 658 líneas; ~190 de catálogos; ~30 de `desgloseDescarga`), ~700 borradas de tests (casi
  todo `cierre-dia-descarga-columnas.test.ts`, 559 líneas) y ~350 añadidas (la mudanza y la guardia). El
  rojo por líneas es casi todo borrado: ver P2.

## Archivos esperados

- `app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaResueltosLista.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista.tsx`
- `app/(app)/cierres-admin/_components/ListaComprobantes.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/_components/desglose-pago.ts`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`
- `tests/unit/guards/cierres-retirados.guardia.test.ts`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/CierreBodegaTarjetaCascada.test.tsx`
- `tests/components/CierreBodegaMarcaConciliacion.test.tsx`
- `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx`
- `tests/components/CierreDiaColaPropia.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx`
- `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/paginacion/paginacion-transversal.test.tsx`
- `tests/unit/config/paginacion-dominios.test.ts`
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `tests/unit/guards/pagos-captura.guardia.test.ts`

## Preguntas abiertas

- **P1 — Satélite sin zona (para Carlos).** Hoy, debajo del aviso «no tienes una zona asignada», sale la
  lista vieja de solicitados, que sin zona **siempre** está vacía (`CierreBodegaService.ts:403-406`): solo
  enseña «Aún no has solicitado ningún cierre de bodega.». **Recomendación:** dejar solo el aviso (R403);
  no se pierde ningún dato. Alternativa: mantener ese vacío pintándolo con la cola nueva, que es más
  código para un caso sin datos. El spec está escrito con la recomendación; cambia R202 de SLT-106.
- **P2 — Tamaño por líneas (para Carlos).** ~1 900 líneas contra un tope de 1 000, casi todo borrado.
  **Recomendación:** aceptarlo con la línea `tamano-pr-aceptado` en `progress/features/SLT-115.md`
  (`docs/gate.md > Tamaño del PR`), como en los otros PR de cierres. Partir más deja pantallas sin
  cambio y cuesta otro ciclo de review por borrar código.
- **P3 — Las dos rebanadas que faltan de S16 (para Carlos: crear fichas).** Rebanada A, «retirar las
  cascadas del detalle viejo de mensajero» (~4 archivos de producción y ~8 de tests), y rebanada B,
  «podar `cierre-factura.tsx`» (~25 archivos de tests; puede necesitar partirse otra vez). Inventario en
  `## Lo que NO entra`. **Recomendación:** crear las dos con `depends_on` SLT-115, A antes que B (B borra
  `CierreFacturaDetalle`, que el fixture de A aún importa).
