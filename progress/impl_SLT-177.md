# SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31» — bitácora

Ruta ligera. Spec: `specs/SLT-177-remedir-baseline-sl31/requirements.md` (R730-R749).

## Tareas

- [x] **T1 — Medir** (R730-R733). 2026-11-16, backend_dev. Detalle y tabla de 239 filas en
  `progress/medicion_SLT-177.md`.
- [x] T2 — Puerta: lote aprobado con la excepción D37/premio; fichas SLT-178…SLT-188 creadas (`progress/features/SLT-177.md > Decisiones`).
- [ ] T3 — Guardia de forma del baseline: `SLT-<n>` (R742).
- [ ] T4 — Podar (R734, R735). Con T1 no hay nada que podar (0 pasa, 0 verde sin datos).
- [ ] T5 — Sembrar el lote. · [ ] T6 — Mutaciones. · [ ] T7 — Baseline. · [ ] T8 — Cierre.

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
