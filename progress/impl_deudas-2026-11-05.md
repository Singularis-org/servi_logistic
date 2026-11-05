# Deudas 2026-11-05 — bitácora

## Tanda 1 — D39 y D40: el modelo de tarifa en los agregados (backend)

**Veredicto:** los dos DTO de la consolidación, la composición de la ganancia y las opciones del filtro de concepto ya dicen si incluyen el modelo nuevo. Sin esquema, sin migraciones, sin pantalla. D39 y D40 siguen abiertas hasta que la tanda de pantalla consuma los campos.

### Campos

Todos son aditivos y salen de `cierre_detail.tarifa_modelo`, lo congelado al solicitar. Ninguno lee `tarifa_activacion`. Mixto cuenta como incluye nuevo y ausente se lee como viejo.

| Deuda | Campo | DTO | Dónde se calcula |
|---|---|---|---|
| D40 | `incluyeModeloNuevo?: boolean` | `CierreBodegaResumen` (`ICierreBodegaService.ts:98`) y su fila (`ICierreBodegaRepository.ts:97`) | `aResumenRows` → `consolidacionesConModeloNuevo`; lo copia `toResumen` (`CierresBodegaAdminService.ts:534`) |
| D40 | `incluyeModeloNuevo?: boolean` | `ConsolidacionSateliteDTO` (`conciliacion-satelites.ts:214`) | `aConsolidacionDTOs` → la misma función |
| D39 | `categoriasConModeloNuevo?: WalletCategoriaRotuloPorModelo[]` | `ComposicionGananciaDTO` (`wallet.ts:633`) | `WalletService.verResumenCaja` → `WalletMovimientoRepository.categoriasConModeloNuevo` |
| D39 | `incluyeModeloNuevo?: boolean`, solo `true` | `ConceptoConMovimientosDTO` (`wallet-filtros.ts:71`) | `FiltrosWalletService`, caso `caja` → `FiltrosWalletRepository.categoriasConModeloNuevoCaja` |

### Decisiones

- **`Lite` no se pudo reutilizar.** Su `_count` filtrado cuenta `detalle` de un `cierre_dia`. La cabecera de bodega está un nivel arriba y su `_count` ya cuenta `cierresDia`. Va una consulta por lectura, como `consolidacionesConDinero`, y ninguna sin ids.
- **`EXISTS` y no el lote `cierresConModeloNuevo` en la caja.** `verResumenCajaAction({})` no lleva periodo (`wallet/page.tsx:51`), así que el lote mandaría toda la historia en un `IN`, hacia el tope de 32.767 parámetros. Es el motivo que ya escribe `libro-caja-a-quien-sql.ts`.
- **Filtro de `LibroCajaBarra`: por el conjunto, no por empresa.** Sus opciones ya salen del servidor (`conceptosConMovimientos`) con su número, bajo periodo, dirección y «A quién». El campo responde por esas mismas filas, así que no hizo falta ni el interruptor ni «la empresa tiene algún cierre del modelo nuevo». Este último habría dicho «no entregadas» en un periodo solo con cobros del viejo.
- **Solo dos categorías:** `WALLET_CATEGORIA_ROTULO_POR_MODELO_SEED`. `satisfies` ata el catálogo a `CATEGORIA_LABEL_MODELO_NUEVO` en los dos sentidos.
- **Reversos fuera:** `egreso_reverso_*_flete_devolucion` anula cobros por rechazo, donde «devolución a origen» es cierto.
- **Opcional en el tipo**, como H1: obligatorio tocaba decenas de fixtures. El compilador no obliga a poblarlo; lo obligan las mutaciones R1 a R7.
- **`incluyeModeloNuevo` del concepto solo cuando es `true`:** las opciones de una empresa sin modelo nuevo conservan su forma exacta, y el test lo fija con un literal.
- **Guardia `caja-173-alcance`, tocada a propósito:** `detalle-modelo-nuevo.ts` ahora tiene un fragmento `Prisma.sql`. La guardia gana una regla: el SQL de ese módulo solo lee `cierre_id` y `tarifa_modelo` de `cierre_detail`, con control de no vacuidad y contraprueba. Conviene que el reviewer lo mire.
- **Composition root:** ningún constructor cambió, y `lib/actions/{wallet,wallet-filtros,cierre-bodega,conciliacion-satelites}.ts` pasan los repositorios reales. `RecolectorDeFilasDeCaja` lanza en el método nuevo, como en los otros.

### Otras notas de D40

| Nota | Dónde | Dato | Falta |
|---|---|---|---|
| `GANA_LA_TIENDA_NOTA` | `CascadasCierreMensajero.tsx:201` | Ya está: prop `modeloNuevo` (`:183`), de `hayGestionEnModeloNuevo(grupos)` | Pasarlo a esa función y el texto |
| `PAGO_TIENDA_HOY_NOTA` | `CascadasCierreMensajero.tsx:272` | Ya está: `props.modeloNuevo` | El texto |
| `DESGLOSE_POR_TIENDA_NOTA` | `DesglosePorTienda.tsx:147` | Ya está: prop `modeloNuevo` (`:125`) | El texto |

Ninguna necesita DTO. Las tres carecen de variante `_MODELO_NUEVO`, y esos textos no existen. No se tocó el encabezado de la descarga.

### Para la tanda de pantalla

- `ConciliacionSatelite.tsx:167,174`: `c.incluyeModeloNuevo === true` elige `GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO` y `PARA_LA_CENTRAL_NOTA_MODELO_NUEVO`.
- `cierre-factura.tsx:1073`: `cierre.incluyeModeloNuevo === true`, en la tarjeta de `CierreBodegaResumen`.
- `ComposicionGananciaCard`: `conceptoDeMovimientoCaja({ categoria, incluyeModeloNuevo: … })` en las filas de ingreso e IVA, mirando `composicion.categoriasConModeloNuevo`.
- `LibroCajaBarra`: `opcionesDeConceptos` recibe un diccionario por categoría; hay que darle el rótulo de cada `ConceptoConMovimientosDTO` con esa misma función.
- **El elegido con 0 movimientos** no viene en la lista y cae al rótulo viejo. No hay fila a la que le mienta, pero la opción puede cambiar de nombre al cambiar de periodo.

### Mapa deuda → test

Todo en `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts`, 16 casos, leídos como `servi_app`.

| Caso | Test |
|---|---|
| D39, sin modelo nuevo: el texto de hoy | «una empresa sin cierres del modelo nuevo…» (literal e importes) |
| D39, nuevo y mixto | «un cierre del modelo nuevo…»; «mixto…» |
| D39, categorías y origen | «solo las categorias cuyo rotulo depende del modelo…» |
| D39, periodo | «el periodo consultado manda…» |
| D39, tipo, concepto y «A quién» | «los demas filtros del conjunto…» |
| D39, interruptor | «activar la empresa no mueve lo congelado: solo cuenta…» |
| D39, otra empresa | «otra empresa no contamina: la RLS para el `EXISTS`…» |
| D39, coherencia con las filas | «dice lo mismo que las filas que abre…» |
| D40, viejo, sin detalle y sin cierres | «solo viejo y sin detalle…» |
| D40, nuevo y mixto | «un cierre del modelo nuevo: verdadero…» |
| D40, vecina y sin consolidar | «cada consolidacion responde por sus cierres…» |
| D40, detalle del maestro | «el detalle del maestro…» |
| D40, interruptor | «activar la empresa no mueve lo congelado» |
| D40, otra empresa | «otra empresa no contamina: la RLS esconde…» |
| Sin N+1 | «tres cierres cuestan una sentencia…» |

### Mutaciones

**27/27 muertas**, una a una, con `scratchpad/mutar-d39d40.cjs` (fuera del repo). Cada corrida exige 16 tests, 0 saltados y al menos un fallo. Antes y después: 16/16 en verde. Árbol limpio al terminar.

- **`WHERE` y SQL (W1–W7):** modelo, correlación, origen, filtros, catálogo y `EXISTS`.
- **Repositorios (C1–C4) y servicios (S1–S5):** filtros perdidos, catálogo entero, marca fija y campo sin entregar.
- **Lote de consolidaciones (B1–B4):** modelo, ids y cálculo.
- **Mappers (R1–R7):** siempre falso, siempre verdadero, sin ids y `toResumen` sin copiar.

W6 sobrevivió a la primera pasada porque el repositorio tapaba el catálogo quitado del SQL. Se añadió la aserción sobre la sentencia y se repitieron las 27.

### Salida real

- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0, 0 errores y 234 avisos.
- Test nuevo: 16/16, sobre la base desechable (comprobado: el nombre de la base es el de la desechable).
- `vitest related` de los 39 archivos: 647 archivos, 8598 tests, 7724 en verde, 102 rojos, 772 saltados, y 120 archivos de integración sin ejecutar. Exit 1.

Los rojos, clasificados:

- **Fuera de integración, 1:** `caja-173-alcance`, «el unico modulo del arbol que escribe…», por tiempo agotado (26,8 s) con la máquina cargada. Solo pasa 39/39.
- **Integración, 101 + 120 suites:** la base desechable no tiene usuarios, zona central ni catálogos sembrados. Corridos los mismos 141 archivos en `49f45a7e`: 230 rojos contra 221 en la rama.
- **Diferencias con la base, 2:** `wallet-tienda-cobro`, roja en las dos con otra forma, y `gasto-fijo-cobro-aprobacion` R20, que falla con «La base tiene 0 usuarios».

### No verificado

- **Las suites que no corren sin siembra**, entre ellas `marca-conciliacion`, `corregir-conciliacion`, `cierre-bodega-conciliacion` y `consolidacion-concurrente`, que pasan por `aResumenRows`. Solo se comparó que fallan igual que en la base. Las cubrirá CI.
- **Coste real del `EXISTS`** con el volumen de una empresa: sin `EXPLAIN` ni medición. `verResumenCaja` también lo pagan los KPI de analítica (`finanzas/cargar-kpis.ts:142`), una sentencia más.
- **Pantalla:** nada de esto se ve todavía.
- **El grafo de código** no tiene índice de este worktree; se exploró con Grep y Read.

### Archivos

**Nuevos:** `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts`, esta bitácora

**Modificados:** `lib/constants/wallet-rotulos.ts`, `lib/interfaces/repositories/{ICierreBodegaRepository,IFiltrosWalletRepository,IWalletMovimientoRepository}.ts`, `lib/interfaces/services/ICierreBodegaService.ts`, `lib/repositories/_shared/detalle-modelo-nuevo.ts`, `lib/repositories/{CierreBodegaRepository,FiltrosWalletRepository,SaldosSatelitesRepository,WalletMovimientoRepository,libro-caja-a-quien-sql}.ts`, `lib/services/{CajaBackfillTesoreriaService,CierresBodegaAdminService,FiltrosWalletService,WalletService}.ts`, `lib/types/{conciliacion-satelites,wallet,wallet-filtros}.ts`, la guardia `caja-173-alcance` y los dobles y literales de 19 archivos de test
