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

## Tanda 2 — D39 y D40: la pantalla consume el dato

**Veredicto:** la conciliación, la tarjeta de bodega, la composición de la ganancia, el filtro del libro y las tres notas de mensajero dicen el texto del modelo nuevo cuando el dato lo pide, y sin él cada frase queda idéntica a la de hoy. No se tocó `lib/`.

### Cambios

| Deuda | Dónde | Qué |
|---|---|---|
| D40 | `ConciliacionSatelite.tsx:159,170,177` | `c.incluyeModeloNuevo === true` elige las dos notas `_MODELO_NUEVO` |
| D40 | `cierre-factura.tsx:1075,1182` | `CierreBodegaFacturaResumen` pasa el campo a `HojaResumen`, que elige la nota. La otra rama de `modeloNuevo` en esa hoja (`:1049`) no se pinta con `cascadaCentral` |
| D40 | `cierre-labels.ts:389,396,552` | Las tres variantes nuevas |
| D40 | `CascadasCierreMensajero.tsx:204,275,367` | `lineasParticion` recibe `modeloNuevo` |
| D40 | `DesglosePorTienda.tsx:149` | La nota según la prop |
| D39 | `ComposicionGananciaCard.tsx:190,222,270` | Rótulo por categoría con `conceptoDeMovimientoCaja` |
| D39 | `LibroCajaBarra.tsx:86,133` | `rotulosDeConceptos`: diccionario para `opcionesDeConceptos` |

`cierre-detalle-shared.tsx` reexporta dos variantes, porque es la puerta por la que `CascadasCierreMensajero` pide sus textos.

### Las tres notas nuevas son ciertas con el cambio mínimo

- **La cifra:** `pagoTienda − ganaLaTienda` es `fleteDevolucionConIva` (`ingreso-empresa.ts:650`), y en el nuevo esa categoría recoge todo resultado distinto de entregado (`derivarIngresoModeloNuevo`, SLT-52 R29).
- **«Se le cobra aparte, contra su saldo»:** `WalletTiendaFeedService` debita esas dos categorías al aprobar, sea cual sea el resultado. Depende del interruptor `TIENDA_DEBITA_FLETE_DEVOLUCION`, igual que la frase del modelo viejo.
- **Mixto:** una devolución a origen también es una gestión no entregada, así que el texto sigue siendo cierto.

### Decisiones

- **Reversos:** conservan su rótulo, porque `conceptoDeMovimientoCaja` no los cubre. El test lo fija con la fila del reverso del IVA.
- **Concepto ajeno al catálogo de la caja:** sigue sin ofrecerse, aunque traiga la marca, con test propio.
- **Elegido con 0 movimientos:** cae a `CATEGORIA_LABEL`. La opción puede cambiar de nombre al cambiar de periodo, como ya se anotó en la tanda 1.

### Mapa deuda → test

Todo en `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx`, 27 casos con esperados literales.

| Caso | Test |
|---|---|
| D40, conciliación | «la cuenta de una consolidación»: nuevo, ausente y `false`, con cifras |
| D40, tarjeta | «la tarjeta del cierre de bodega»: nuevo, ausente y `false`, con cifra |
| D40, roles de la tarjeta | «el `adminSatelite` en sus solicitados y el maestro en los resueltos…» |
| D40, mensajero | «las dos notas del cierre de mensajero»: nuevo, ausente y `false`; cada nota en su línea |
| D40, desglose | «la nota del desglose por tienda»: nuevo, ausente y `false`; el cierre le pasa el modelo |
| D39, composición | «la composición de la ganancia»: las dos categorías, una sola de cada lado, lista ausente y vacía, reverso y filas ajenas |
| D39, filtro | «el filtro de concepto del libro»: con marca, sin marca, sin contagio, sin rótulo por modelo, concepto ajeno y elegido con 0 |

### Mutaciones

**46/46 muertas**, una a una, con `scratchpad/mutar-d39d40-pantalla.cjs` (fuera del repo). Cada corrida exige 27 tests ejecutados, 0 saltados y al menos un fallo, y el patrón debe aparecer exactamente una vez. Línea base y final: 27/27 en verde. Árbol intacto, comprobado por huella de los 7 archivos mutados.

- **Conciliación (C1–C8):** condición invertida, fija y ausente como nuevo, ramas invertidas, nota equivocada.
- **Tarjeta (F1–F6):** rama invertida, nota fija, campo sin entregar, condición invertida.
- **Mensajero (M1–M7) y desglose (D1–D3):** ramas, notas cruzadas, modelo sin pasar.
- **Literales (L1–L6):** cada texto viejo con una palabra cambiada y cada nuevo diciendo el viejo.
- **Composición (G1–G8):** lista ignorada, fija, invertida y por tarjeta en vez de por categoría.
- **Filtro (B1–B8):** diccionario ignorado, marca fija, invertida y contagiada, elegido con 0 sin rótulo o con el nuevo, valor técnico.

### Salida real

- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0, 0 errores y 234 avisos, el mismo número que en la tanda 1.
- `vitest related` de los 9 archivos, con la base desechable: 203 archivos, 3054 tests, 3054 en verde, 0 rojos, 0 saltados. Exit 0.

### No verificado

- **Pantalla real:** sin navegador ni dev server. Los tests montan componentes con dobles de las acciones, así que el camino completo base → DTO → DOM no se recorrió.
- **Roles:** los componentes no filtran por rol. Solo se comprobó que `adminSatelite` y maestro leen la misma nota en sus dos listas; quién entra a cada página no se probó aquí.
- **E2E:** no se corrió ninguno.
- **Coste del `EXISTS`** con volumen real: sigue sin medir, como en la tanda 1.
- **El grafo de código** no se consultó en esta tanda: la tanda 1 anotó que no tiene índice de este worktree. Se exploró con Grep y Read.

### Archivos

**Nuevos:** `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx`

**Modificados:** `app/(app)/cierres-admin/_components/{CascadasCierreMensajero,DesglosePorTienda,cierre-detalle-shared,cierre-factura}.tsx`, `app/(app)/cierres-admin/_components/cierre-labels.ts`, `app/(app)/wallet/_components/{ComposicionGananciaCard,LibroCajaBarra}.tsx`, `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`, esta bitácora

## Tanda 3 — D42 y los menores n1, n2 y n3 de SLT-64

Veredicto de D42: el clic pasa a `abrirCon` y no hubo ningún fallo en 5 corridas, pero tampoco lo hubo en 3 corridas sin el cambio. **No se puede concluir que la inestabilidad haya desaparecido, y la causa sigue sin medir.**

### D42: relación entre `:58` y `:81`

- **Son el mismo test.** `:58` es la línea donde se declara el test que el reportero nombra; `:81` es un paso de su cuerpo. Comparten botón y panel porque no hay dos pasos distintos que comparar.
- **El clic de `:81` no «explica» la caída de `:58`: es el paso que cayó.** `progress/impl_SLT-54.md:1395` nombra ese botón y el registro `element was detached from the DOM, retrying`.
- **La caída anterior de CI fue otro paso del mismo test:** la navegación de `:63`, en el run 40875969358, que `navegarCon` ya cubre. Son dos puntos de caída; no consta que tengan la misma causa.

### D42: el cambio

`e2e/wallet-mensajeros.spec.ts:81` pasa a `abrirCon(botón, región «Órdenes que componen «Pago devengado»…»)`.

- **Lo que espera es la región y no el destinatario.** El botón alterna, y `pulsar.ts` avisa de que `abrirCon` no sirve si un segundo clic deshace el primero. Por lectura de `DataTable.tsx` y `DetalleMovimientoCierre.tsx`, la región se monta en el mismo clic, antes de leer las órdenes. Si se esperara el destinatario, un reintento podría plegar el panel. Las aserciones del destinatario siguen después.
- **Lo que cambia:** cada intento de clic tiene 2 s y se reintenta con el localizador resuelto de nuevo, en vez de que un solo clic consuma el plazo del test.
- **Lo que no cambia:** por qué se desmonta el botón. Si la página entera se quedara parada, `abrirCon` también caería a los 30 s.
- Sin `retries`, sin `waitForTimeout` y sin subir ningún plazo.

### D42: medida

Proyecto `dinero`, misma build, `workers: 1`, una tras otra sobre la misma base.

| Corrida | Spec | Passed | Failed | Flaky | Skipped | Did not run | Exit |
|---|---|---|---|---|---|---|---|
| base-1 | sin el cambio, con sonda | 49 | 0 | 0 | 0 | 0 | 0 |
| base-2 | sin el cambio, con sonda | 49 | 0 | 0 | 0 | 0 | 0 |
| base-3 | sin el cambio, con sonda | 49 | 0 | 0 | 0 | 0 | 0 |
| tras-1 | con `abrirCon` | 49 | 0 | 0 | 0 | 0 | 0 |
| tras-2 | con `abrirCon` | 49 | 0 | 0 | 0 | 0 | 0 |
| tras-3 | con `abrirCon` | 49 | 0 | 0 | 0 | 0 | 0 |
| tras-4 | con `abrirCon` | 49 | 0 | 0 | 0 | 0 | 0 |
| tras-5 | con `abrirCon` | 49 | 0 | 0 | 0 | 0 | 0 |

- **El fallo no se reprodujo antes del cambio**, así que estas corridas no distinguen el antes del después. Es «sin fallo en 5 corridas», no una causa demostrada. La única tasa disponible es muy pobre: 1 caída en 6 corridas sin el cambio, contando las 3 de SLT-54. Con esa tasa, 5 corridas limpias saldrían por azar cerca de 4 veces de cada 10.
- **Sonda temporal, no commiteada, en las corridas `base`:** un `MutationObserver` sobre el botón, más `pageerror`, errores de consola y peticiones RSC del test. En las 3 corridas, el botón se quitó **0 veces** y se puso 1, y hubo 0 errores. El desmontaje no es algo habitual que el clic sortee: en las corridas que pasan no ocurre. Solo se sabe de él por el registro de la corrida caída de SLT-54.
- **Diferencia con la corrida caída:** aquí se corrió con `--trace retain-on-failure`, para guardar la traza si caía, y allí no había traza. No se generó ninguna.

### D42: la base

- **El servidor apuntó a la desechable, medido durante las corridas:** netstat da las conexiones Postgres del proceso que escucha en el puerto del E2E, y `pg_stat_activity` las cruza por puerto de cliente. En `tras-1` a `tras-5`, y en una medida a mano durante `base-3`, 3 conexiones, las 3 en `servi_gate_deudas`. La sonda automática de las corridas `base` falló por un error mío de escapado y no midió nada; esas tres corridas las respalda el recuento de abajo y que usaron el mismo entorno.
- **El `.env` no manda:** `@next/env` y `process.loadEnvFile` no pisan lo que ya trae el entorno.
- **La base local no se tocó:** organizaciones 11, usuarios 44, movimientos de wallet 13 y cierres 6, iguales antes y después.
- **La desechable** tenía 0 empresas y 304 migraciones; se le aplicó `migrate deploy` y `db:seed` sin recrearla. Queda con los datos de las corridas: 128 organizaciones.

### n1, n2 y n3

- **n1.** Corregidos `base-del-kpi.ts:91` y `madurez-textos.ts:25`, en `app/(app)/analitica/_components/entregas/`. Comprobado en el código: `CicloVidaRepository` usa `RESULTADOS_DE_CIERRE` y `CohorteCargaRepository` usa `ESTADOS_TERMINALES`. Solo comentarios.
- **n2.** Fila añadida en `specs/SLT-64-ciclo-vida-cerradas-coherente/requirements.md`. Cubre la cláusula **por composición**: `deshacer-gestion-invalida-analitica` (bloque «las tres vías»), `cache-invalidacion-correccion-cableado`, `cache-por-empresa` y el caso (c) de `cierres-admin`. La fila dice que ningún test deshace y luego lee en navegador; lo comprobé con Grep en `e2e/`. El caso (c) mide el perfil de caché por la vía de corregir, no por la de deshacer.
- **n3.** Añadido a `docs/verification.md > El E2E`. Comprobado: 16 archivos de `.next/server` llevan el origen incrustado tras el `next build`; `gate.yml` la pone antes del build; `lib/config/app-url.ts` cae a `NEXT_PUBLIC_SITE_URL`; `enlaceEnviadoA` solo lee lo que va detrás de `#enlace=`. Sin valores reales.

### Salida real

- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, el mismo número que en la tanda 2.
- `vitest related` de los archivos tocados: 16 archivos, 289 tests, 272 en verde, 0 rojos, 17 saltados. Exit 0. Los 17 son todos de `tests/components/AnaliticaPage.test.tsx`, marcados `INERTE` con fecha 2026-08-19: ya estaban y este cambio no los toca.
- `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 38 de 38.

### No verificado

- **La causa del desmontaje.** No se reprodujo, y por tanto tampoco se sabe si `abrirCon` rescata ese fallo.
- **El camino de reintento de `abrirCon` en este botón.** No medí si algún clic se reintentó. Que un reintento no pliegue el panel sale de leer el código, no de una corrida.
- **El CI**, donde `retries: 1` y `failOnFlakyTests` cambian lo que se ve.
- **Una base recreada entre corridas:** las 8 corrieron sobre la misma, con datos acumulados, y la corrida caída de SLT-54 fue sobre una base nueva.
- **n3 en `superadmin-empresas`:** ese spec no se corrió; no es del proyecto `dinero`.
- **Fuera de alcance, sin tocar:** `e2e/mi-wallet.spec.ts:71` tiene el mismo clic crudo sobre el mismo tipo de botón.
- **El grafo de código** no se consultó: Grep y Read.

### Archivos

**Modificados:** `e2e/wallet-mensajeros.spec.ts`, `app/(app)/analitica/_components/entregas/{base-del-kpi,madurez-textos}.ts`, `specs/SLT-64-ciclo-vida-cerradas-coherente/requirements.md`, `docs/verification.md`, esta bitácora
