# SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31» — bitácora

Ruta ligera. Spec: `specs/SLT-177-remedir-baseline-sl31/requirements.md` (R730-R749).

## Tareas

- [x] **T1 — Medir** (R730-R733). 2026-11-16, backend_dev. Detalle y tabla de 239 filas en
  `progress/medicion_SLT-177.md`.
- [x] T2 — Puerta: lote aprobado con la excepción D37/premio; fichas SLT-178…SLT-188 creadas (`progress/features/SLT-177.md > Decisiones`).
- [x] T3 — Guardia de forma del baseline: `SLT-<n>` (R742). `9aa40d6f`.
- [x] T4 — Podar (R734, R735). Con T1 no había nada que podar (0 pasa, 0 verde sin datos); el párrafo
  «PODA DEL 2026-11-16 (SLT-177)» de `_lee_esto` va con T7.
- [x] T5 — Sembrar el lote. `d432d21f`.
- [x] T6 — Mutaciones y R738. `d20248aa`.
- [ ] T7 — Baseline. `12412b11`, `b386a76f`: 92 fuera, 126 motivos nuevos. **Parado:** 21 entradas
  siguen citando SL-31 porque su causa medida no tiene ficha; sin eso no entra la regla de R743.
- [ ] T8 — Cierre. Hecho: deudas, diff de producción vacío y tamaño. Falta: `./init.sh` y el CI del PR.

## T1 — Medición

- **Run 43973243440** (`gate.yml`, `pull_request` del PR #184 «SLT-175 pruebas R621/R623 y guardia
  R631», head `2b985ead`, árbol `825ba66d` = `origin/dev`; `success`). Postgres 17 de servicio +
  `migrate deploy` + `db:seed`. Fuente: artefactos `gate-completo-informe` e `informe-shard-{1,2,3}`
  bajados con `gh run download`. Sin runs nuevos, sin push, sin base local, sin leer `.env`.
- Esta rama no tiene cambios en `lib app components hooks db scripts tests` respecto de `825ba66d`.
- R733: las 239 aparecen en el informe; ninguna sin ejecutar. Las 239 salen `failed`.

| clase | archivos |
|---|---|
| pasa | 0 |
| verde sin datos | 0 |
| base vacía | 227 |
| otra causa | 12 |
| **total** | **239** |

«Verde sin datos» queda en 0 porque ningún archivo terminó verde: R731 (retornos tempranos o `skip`
por datos) solo se aplica a los que la corrida dio por buenos. Los casos «saltados» de la tabla son
los de suites que cayeron en su `beforeAll`, no `skip` condicionados a datos.

Base vacía por punto de fallo: G1 `454/_escenario.ts` 76 · G2 `_fixtures/caja-459.ts` 29 ·
G3 `_whatsapp-envios-474.ts` 7 · G4 `_informe-transito-475.ts` 5 · G5 `419/_escenario-419.ts` 3 ·
G6 `_picking-476.ts` 2 · propias del archivo: G7 `fksDeOrden` 59, G7b orden sin `fksDeOrden` 11,
G8 usuario 30, G9 zona 4, G10 gestiones 1.

Otra causa: dato ajeno de otra empresa 5 (incluye `detalle-movimiento-cierre-postgres` de D37 y
`premio-ranking-idempotencia`) · sin empresa en contexto 1 · estado retirado del catálogo 2 · tests de
migración desfasados tras SL-17 «Tabla organizacion y aislamiento por empresa» 4.

**Hallazgo**: en los shards 2 y 3 había, en algún momento, una orden y una zona de OTRA empresa
confirmadas en la base de servicio. Algún test deja filas fuera de su transacción. Los «dato ajeno»
lo prueban (`medicion_SLT-177.md > Hallazgo`).

## T2 — Propuesta (para la puerta; no se ha tocado ningún test)

### (a) Lote de esta ficha

Tope del spec: ≤ 20 archivos de siembra y ≤ 1300 líneas. Las líneas son **estimación**: ~70 por
archivo sembrado a mano (lo que costó SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con
imports indirectos») y lo que calculo para cada helper.

| prio | archivos tocados | entradas que retira si todo queda verde | líneas est. |
|---|---|---|---|
| 1 (dinero) | `_fixtures/caja-459.ts` (G2) + `detalle-en-lote-464.test.ts` (D37) + `estado-cuenta-cierre-pagos-172r52.test.ts` + `estado-cuenta-servidor-458d.test.ts` | 29 | ~250 |
| 1 (dinero) **con excepción** | `detalle-movimiento-cierre-postgres.test.ts` (D37) + `premio-ranking-idempotencia.test.ts` | 2 | ~200 |
| 2 | `454/_escenario.ts` (G1) + `454/caracterizacion/notificacion-n1.test.ts` + `462/reprogramadas-retenidas-sql-real.test.ts` + `477-ordenes-en-correccion-sql-real.test.ts` | 76 | ~250 |
| 2 | `_whatsapp-envios-474.ts` (G3) | 7 | ~30 |
| 2 | `_informe-transito-475.ts` (G4) | 5 | ~30 |
| 2 | `419/_escenario-419.ts` (G5) | 3 | ~60 |
| 2 | `_picking-476.ts` (G6) | 2 | ~30 |
| | **13 archivos** (+ `_fixtures/orden-minima.ts` si hace falta) | **124** | **~850** |

- **Excepción que decide Carlos**: el spec solo admite D37 y el premio en la prioridad 1 «si T1 los
  clasifica base vacía». Salen **otra causa / dato ajeno**: su lectura no falló, devolvió una fila de
  otra empresa. El remedio es el mismo (sembrar en la transacción, R737) y vigilan dinero. Propongo
  admitirlos; si no, van a F1 / F7.
- **Margen reservado** (~7 archivos, ~450 líneas): al dejar de fallar la primera lectura saldrán
  errores de segundo nivel que hoy no se ven (R736 exige todos los casos verdes). Si al cerrar T5 sobra
  margen, se sigue con la prioridad 3 (menos líneas primero): `whatsapp-envio-idempotencia-programado`
  (119 l.), `wallet-origen-legible` (154), `usuario-contar-adminsatelites` (159),
  `wallet-anulacion-concurrencia` (171), `wallet-etiqueta-historial-458` (182).
- **R738**: G1, G2 y G5 leen en el `beforeAll`, fuera de la transacción. La siembra tiene que bajar a
  la parte transaccional (`crearEscenario`, `enTransaccionRevertida459`, …), nunca al `beforeAll`.
- **Pregunta para la puerta**: un usuario de G1/G2 que, arreglado el helper, cae por un error de
  segundo nivel, ¿se queda en el baseline con su motivo medido de nuevo (y va a una ficha siguiente),
  o se arregla dentro del lote mientras quepa en el tope? Propongo lo primero.

### (b) Borrador de fichas siguientes (no creadas)

Siembra, todas iguales: ruta ligera, mismo patrón y requisitos que R736-R741, tope 20 archivos / 1300
líneas, sin `depends_on` salvo que una cambie `_fixtures/orden-minima.ts`. Las listas exactas, con
clase y grupo de cada archivo, están en `progress/medicion_SLT-177.md > Reparto propuesto por destino`.

| id | título | descripción breve | archivos |
|---|---|---|---|
| F1 | Siembra propia en los tests de cierres | Los tests de cierres leen «la primera orden» (`fksDeOrden`); que creen la suya. Incluye dos «dato ajeno». | 17: `cierre-aprobacion-libera-solo-lo-suyo`, `cierre-aprobar-el-mas-viejo-desbloquea`, `cierre-bloqueo-nv-sql-real`, `cierre-descarga-fechas-sql-real`, `cierre-descarga-intentos-entrega-sql-real`, `cierre-excluye-gestiones-de-escritorio`, `cierre-rechazado-aviso-dedupe`, `cierre-rechazado-jornada-sql-real`, `cierre-rechazo-tienda-aprobacion`, `cierre-rechazo-tienda-sql-real`, `cierre-rechazo-tienda-totales`, `cierre-segundo-vincula-solo-lo-suyo`, `cierre-sin-gestion-sql-real`, `cierre-sin-gestion-tope-sql-real`, `cierres-admin-retornables-sql-real`, `cierres-filtro-estado-sql-real`, `corte-diario-segundo-cierre-sql-real` |
| F2 | Siembra propia en tests de corrección, gestión y reparto | Mismo arreglo para correcciones, deshacer, gestiones, reparto y traspaso. | 15: `correccion-dia-reparto-efectos`, `correccion-dia-reparto-historial`, `correccion-dia-reparto`, `correccion-fecha-reprogramacion`, `correccion-resultado-gestion`, `corregir-datos-cliente.repo`, `corregir-ubicacion-geocode`, `deshacer-asignacion-zona-satelite`, `deshacer-gestion-conserva-reserva`, `gestion-desde-ayuda-dia-reserva`, `gestiones-detalle-api-405`, `novedades-sin-gestionar-aviso-dedupe`, `recoger-lote-dia-reserva`, `reparto-manana-repository`, `traspaso-mensajero` |
| F3 | Siembra propia en tests de API keys, historial y borrado de órdenes | Mismo arreglo para API keys, historial de acciones, borrado y remisión de órdenes. | 15: `486-evidencias-cierres-sql-real`, `api-key-eliminabilidad`, `api-key-eliminar-fk-inesperada`, `api-key-eliminar-tienda-destino`, `eliminar-orden-api-frontera-tienda`, `eliminar-orden-pantalla-frontera-tienda`, `emisor-relaciones-anidadas`, `historial-accion-atomicidad`, `historial-accion-lectura`, `historial-accion-q1-ubicacion`, `notificacion-bloqueo-otro-cierre-avisa`, `orden-eliminada-actor-admin`, `orden-remision-borrada-libera-numero`, `orden-traspaso-migration`, `tarifa-zona-borrado-fk-real` |
| F4 | Siembra propia en tests de búsqueda, push y liberación | Mismo arreglo para búsqueda, push, liberación al aprobar y el resto de `fksDeOrden`. | 14: `aviso-agregado-repository`, `busqueda-comportamiento`, `busqueda-normalizacion-paridad`, `busqueda-sincronizacion-columna`, `busqueda-usa-indice`, `costo-y-zona-api-415`, `liberacion-al-aprobar-cierre-real`, `liberacion-reprogramada-cierre-real`, `push-canal-restricciones`, `push-destinatarios-equivalencia`, `rechazo-tienda-cobro`, `usuario-preferencia`, `wallet-anulacion-concurrencia`, `webhook-evidencias-url-resuelve-sql-real` |
| F5 | Usuarios propios en tests de dinero y conciliación | Leen «el primer usuario» de la base; que creen los suyos con `crearUsuarioDePrueba`. | 15: `actions/analitica-financiera-action`, `cierre-bodega-conciliacion`, `cierre-bodega-resumen-pendientes`, `consolidacion-concurrente`, `corregir-conciliacion`, `gasto-fijo-cobro-aprobacion`, `gasto-fijo-cobro-idempotencia`, `gasto-fijo-cobro-migration`, `marca-conciliacion`, `mi-wallet-cierres-alcance`, `premio-ranking-devengo-migration`, `ranking-snapshot-migration`, `wallet-fecha-elegida`, `wallet-tienda-cobro`, `repositories/financiera-cubo-temporal` |
| F6 | Usuarios propios en tests de geografía, avisos y migraciones | Mismo arreglo de usuario para geografía, notificaciones, webhooks y migraciones. | 15: `api-key-eliminar`, `asistente-uso-diario`, `cobertura-repository`, `geografia-cascada-reversible`, `geografia-registro-accion`, `geografia-renombrado`, `notificacion-evento-cierre-rechazado-migration`, `notificacion-evento-geocodificacion-caida-migration`, `notificacion-evento-reparto-manana-migration`, `notificacion-evento-traspaso-migration`, `reparto-manana-aviso-dedupe`, `usuario-contar-adminsatelites`, `vista-filtro`, `webhook-suscripcion-circuito-migracion`, `whatsapp-envio-idempotencia-programado` |
| F7 | Orden y zona propias en tests de chat, notas y wallet | Leen orden, zona o gestiones de la base sin `fksDeOrden`; que las creen. Incluye un «dato ajeno». | 17: `chat-entrante-telefono-cr`, `confirmacion-fisica-migration`, `corregir-datos-cliente.chat`, `geografia-historico-intacto`, `geografia-ordenes-sin-entregar`, `habilitacion-api-migration`, `orden-mensajero-meta-drop-nota-migration`, `orden-nota-migration`, `wallet-cierres-selector`, `wallet-etiqueta-historial-458`, `wallet-origen-legible`, `repositories/chat-media-autorizada`, `repositories/chat-media-historico`, `repositories/conteo-productos`, `repositories/dinero-productos`, `repositories/historico-conversaciones`, `repositories/orden-nota` |
| F8 | aporte-capital sin empresa en contexto | La action corre sin empresa (`EmpresaNoResuelta`) y responde INTERNAL; diagnosticar si falta el contexto en el test o en la action. | 1: `aporte-capital` |
| F9 | Tests con estados retirados del catálogo | Usan `ayuda_tienda` (454) y `en_fulfillment` (155), que una base nueva no trae. | 2: `analytics-daily-job`, `satelite-bodega-alcance-real` |
| F10 | Tests de migración desfasados tras SL-17 | Policies RLS que ahora existen, orden del enum de wallet y un `down.sql` de SL-17 que nombra `vista_filtro`. SL-28 «Consolidar las migraciones en una línea base limpia» está cancelada: no los cubre. | 4: `historial-accion-migration`, `postulacion-recurso-migration`, `vista-filtro-migration`, `wallet-458-migration` |

Totales: F1-F7 = 108 entradas (105 base vacía + 3 dato ajeno); F8-F10 = 7 de otra causa.
Cuenta: lote 122 + excepción 2 + F1 17 + F2 15 + F3 15 + F4 14 + F5 15 + F6 15 + F7 17 + F8 1 + F9 2
+ F10 4 = **239**. Si Carlos no acepta la excepción, sus 2 archivos van a F1
(`detalle-movimiento-cierre-postgres`, queda en 18) y F5 (`premio-ranking-idempotencia`, queda en 16).

Opcional, a decidir por el leader: F11 «Encontrar el test que deja filas de otra empresa en la base de
CI» (hallazgo de T1). No retira entradas; evita que vuelvan los «dato ajeno».

## T3-T8 (2026-11-16, backend_dev, en primer plano)

### Entorno de medición local
- Junction `node_modules` → raíz del repo (`mklink /J`), ignorado por git.
- Base: `servi_slt177_desechable` vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver la URL),
  ya migrada. Le corrí `pnpm run db:seed` por el mismo wrapper para que quede como la de CI
  (`gate.yml:180-187`): sin él faltaban los vehículos y `454/ayuda-evento` y `454/caracterizacion/traspaso`
  daban un rojo que CI no da.

### T5 — qué se sembró (13 archivos, 952 líneas de tests en el PR con baseline y guardia)
| archivo | siembra en la tx del caso | control positivo |
|---|---|---|
| `_picking-476.ts` | zona | `zona.count({id}) === 1` |
| `_informe-transito-475.ts` | tienda con `crearUsuarioDePrueba` | `usuario.count({id}) === 1` |
| `_whatsapp-envios-474.ts` | usuario modelo (inactivo) con `crearUsuarioDePrueba` | `usuario.count({id}) === 1` |
| `419/_escenario-419.ts` | empresa del escenario (como `enTransaccionRevertida459`) y zona central; geografía y `cedula` por clave | `zona.count({id, esCentral}) === 1` |
| `_fixtures/caja-459.ts` | zona central por empresa (`asegurarCentral459`); provincia/cantón por clave | 1 central en la empresa |
| `454/_escenario.ts` | zona central en `crearEscenario` (solo con el Mundo de `prepararMundo`); geografía y `cedula` por clave | `zona.count({id, esCentral}) === 1` |
| `_fixtures/libro-468.ts`, `detalle-en-lote-464.test.ts` | tarifa a la que apunta `cierre_detail.tarifa_id` | el `expect` existente, sobre la sembrada |
| `_fixtures/wallet-458.ts` | — (pasa `reglasPaisFijas()` a `EstadoCuentaService`, como `buildService()`; sin eso `leer` lanzaba, SLT-42) | — |
| `detalle-movimiento-cierre-postgres.test.ts` (D37) | `crearFksDeOrden` + tarifa | 3 `count === 1` |
| `premio-ranking-idempotencia.test.ts` | `crearFksDeOrden` por caso; rol y `cedula` por clave | 2 `count === 1` |

Ningún `it`, `expect` ni literal esperado cambió (R740); los `expect` de «la base no tiene…» siguen,
ahora sobre la fila sembrada.

### Resultado en la base desechable (JSON de vitest; 0 saltados en todos los verdes)
- **92 de los 124 archivos del lote, verdes** (G1 63/76, G2 13/29, G3 7/7, G4 5/5, G5 2/3, G6 1/2,
  D37 1/1, premio 0/1) → salen del baseline.
- **R738**: los 13 usuarios de los helpers tocados que NO están en el baseline (`caja-estado-459`,
  `caja-iva-aparte-sl39`, `deuda-plataforma-*`, `pago-plataforma-sl45`, `estado-cuenta-concurrencia-458`,
  `cobro-tienda-461-completar-migration`, `cierre-sin-gestion-confirmacion-sql-real`,
  `462/medir-462-hoy-cr`, `tope-intentos-caminos`, `tope-intentos-carreras`,
  `total-a-cobrar-sin-cerrado-sql-real`, `components/WalletCuentasPorPagarRefrescoP1`): 13/13 verdes.
  Los tres `tope-*`/`total-a-cobrar` cayeron con la primera versión (arman su Mundo con su propia
  central y la del escenario chocaba con el índice único por empresa); se arregló con `sembrarCentral`.
  Los usuarios de 474/475/476 fuera del baseline (9 archivos): verdes.

### Los 32 del lote que siguen rojos (causa medida tras sembrar; se quedan, decisión 3 de Carlos)
| causa | archivos | ficha |
|---|---|---|
| sin empresa en contexto: action/servicio fuera de la tx, o escenario CONFIRMADO sin empresa (`organizacion_id NOT NULL`) | `picking-resumen-tiendas`, `ajuste-caja-anulacion-461`, `premio-ranking-idempotencia` (16/17; falla 293/T2.5), `419/confirmar-entrega-lote` (9/11; bloque R8), `454/registro-gestion-concurrencia`, `454/senales-gestion-lectores`, `454/caracterizacion/corte-concurrencia`, `454/caracterizacion/no-doble-gestion` | SLT-185 (amplía su alcance: hay que confirmarlo) |
| índice único por empresa / columna nueva tras SL-17 | `wallet-461-idempotencia-clave`, `454/orden-evento-migration` | SLT-187 |
| base vacía propia del archivo | `455/caracterizacion/api-lectura` («distrito activo con zona», :124) | SLT-184 |
| **sin ficha**: escenario 459 cae en `repartoMensajero` con `sin_saldo` (`caja-459.ts:773`, ver D64) | `analitica-anulacion-rechazo-458`, `caja-caracterizacion-459`, `caja-invariante-tiendas`, `como-quedo`, `efecto-movimiento-predice`, `libro-caja-a-quien`, `libro-caja-filtro-a-quien`, `libro-caja-revision-458c`, `libro-caja-revision-458e`, `liquidacion-fechas-cr-461`, `wallet-anulacion-458`, `wallet-comprobante-alcance`, `wallet-documento-comprobante-458`, `wallet-registro-comprobante-458` | **falta** |
| **sin ficha**: aserción de dinero/estado del cierre de satélite que no cuadra (p. ej. `pago_satelite` donde se espera `pago_efectivo`) | `477-aprobacion-tras-correccion`, `454/registro-gestion-sin-transicion`, `454/caracterizacion/{cierre-rechazado,deshacer,dinero-aprobacion,multi-dia-271}`, `455/caracterizacion/dinero-aprobacion` | **falta** |

### T6 — mutaciones (una a una, restauradas con `git checkout --`, árbol limpio tras cada una)
| id | quitar la siembra en | test | resultado |
|---|---|---|---|
| M1 | `_picking-476.ts` (zona) | `picking-ordenes-en-preparacion` | 7/7 rojos: «476: la zona sembrada no esta en la base (0)» |
| M2 | `_informe-transito-475.ts` (tienda) | `informe-transito-zonas` | 3/3 rojos: «475: la tienda sembrada no esta en la base (0)» |
| M3 | `_whatsapp-envios-474.ts` (modelo) | `whatsapp-envio-historial` | 1 rojo (el otro caso no usa modelo): «474: el usuario modelo sembrado no esta en la base (0)» |
| M4 | `419/_escenario-419.ts` (central) | `419/confirmar-entrega-webhook` | suite roja: «419: la zona central sembrada no esta en la base (0)» |
| M5 | `_fixtures/caja-459.ts` (central) | `estado-cuenta-saldo-corrido` | 6/6 rojos: «459: la empresa del caso tiene 0 zonas centrales, no 1» |
| M6 | `454/_escenario.ts` (central) | `454/caracterizacion/tablero-dia` | suite roja: «454: la zona central sembrada no esta en la base (0)» (repetida tras `d20248aa`) |
| M7 | `_fixtures/libro-468.ts` (tarifa) | `libro-kardex-468` | 6/6 rojos: «la base no tiene ni una tarifa…» |
| M8 | `detalle-en-lote-464` (tarifa) | el mismo | 6/6 rojos: ídem |
| M9 | `detalle-movimiento-cierre-postgres` (tarifa) | el mismo | 14/14 rojos: ídem |

Guardia T3 (R742): con `FICHA = /SL-\d+/` el caso nuevo cae (1 rojo) y se restauró.

### T7 — baseline
- 243 → 151 entradas. Quedan 147 de SL-31: 126 con motivo nuevo (clase, mensaje, fecha, run
  43973243440 y ficha SLT-178…SLT-187; las 32 rojas del lote añaden la medición local tras sembrar) y
  **21 sin tocar** (las dos filas «sin ficha» de arriba). `desde` intacto; las 4 entradas ajenas, intactas.
- Motivos sin `en_fulfillment` ni «336»: los vigilan `censo-order-status-rename` y `rutas-336-retiradas`.
- **No** entra todavía la regla de R743 (rojo si un motivo cita SL-31): daría rojo con las 21.

### T8
- `progress/deudas.md`: D8 apunta a SLT-178…SLT-188; D37 cerrada; D64 con lo medido.
- `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`: vacío.
- `node scripts/tamano-pr.mjs`: 13/40 archivos, 0/1000 producción, 952/3000 tests.
- Sin hacer: `./init.sh` (requiere el `.env` del worktree, que no leo) y el CI del PR.

### Mapa R → test (T3-T8)
| R | evidencia |
|---|---|
| R734 | nada que podar (T1) |
| R735 | sin verdes sin datos (T1) |
| R736, R737 | los 92 archivos verdes (JSON de vitest en la desechable) |
| R738 | 13 usuarios externos de los helpers verdes + M1-M6 |
| R739 | controles positivos de la tabla T5 + M1-M9 |
| R740 | `git diff` de los archivos sembrados: sin `it`/`expect`/literales quitados |
| R741 | las 92 fuera; **incumplido** para `premio-ranking-idempotencia` (16/17, decisión 3 aplicada) |
| R742 | `gate-cableado-arnes-v2.guardia.test.ts` caso «SLT-177 R742» + mutación |
| R743 | **pendiente** (21 entradas sin ficha) |
| R744, R745 | 126 motivos nuevos; 21 pendientes |
| R746 | pendiente del CI del PR |
| R747, R748 | diff de producción vacío; `tamano-pr` 13/40, 952/3000 |
| R749 | `progress/deudas.md` D8, D37 |

### Salidas
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → exit 0.
- `pnpm exec eslint <archivos tocados>` → 0 errores, 1 aviso previo (`detalle-movimiento-cierre-postgres.test.ts:432 'pageSize'`, no es de este diff).
- `pnpm run test:guardias` → 352/353 archivos; el rojo es `dependencias-declaradas-presentes` (baseline, SL-29).
- Lote en la desechable: 124 archivos, 92 verdes, 32 rojos (tabla de arriba).

### Veredicto
T3-T6 hechas. T7 y T8 a medias: faltan una ficha para 21 entradas (escenarios de satélite) y el OK
de ampliar SLT-185 a «sin empresa en contexto» en general.

## Archivos creados o modificados (T1)

- `progress/medicion_SLT-177.md` (nuevo): fuente, método, resumen, grupos, otra causa, tabla de 239
  filas y reparto por destino.
- `progress/impl_SLT-177.md` (nuevo): esta bitácora.

## Mapa R → evidencia (hasta T1)

| R | evidencia |
|---|---|
| R730 | `progress/medicion_SLT-177.md > Tabla por archivo`: 239 filas con run, p/f/s, primer error y `archivo:línea`; suma por clase 239 |
| R731 | ídem: 0 archivos verdes, así que 0 «pasa» y 0 «verde sin datos» |
| R732 | ídem: columna «nace en» + `> Base vacía: agrupadas por punto de fallo` y `> Otra causa` |
| R733 | ídem `> Método` punto 2: las 239 están en `testResults` |
| R734-R749 | pendientes (T3-T8) |

## Salidas

T1 solo escribe dos archivos en `progress/`: no hay código ni tests tocados, así que typecheck, lint y
`vitest related` no tienen nada que comprobar. Las guardias no se corrieron: el worktree no tiene
`node_modules` (sin junction) y no lo creé. Que el leader las pase al montar el entorno para T3.

## Veredicto

T1 hecha: 239/239 medidas en el run 43973243440. 0 pasa, 0 verde sin datos, 227 base vacía, 12 otra
causa. Parado en la puerta T2.
