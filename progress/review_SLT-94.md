# Revisión SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»»

Reviewer · 2026-11-08 · rama `feature/SLT-94-fulfillment-cobro-por-paquete` · diff `origin/dev...HEAD`
(merge-base `7a42c6b3`, `origin/dev` sin commits nuevos por delante).

## Verificación ejecutada por el reviewer

- `vitest run` contra la base desechable `slt94_t1` (`prisma migrate status` → «Database schema is up to
  date»): `slt94-fulfillment-cobro`, `slt94-fulfillment-cancelacion-api`, `slt94-iva-equivalencia`,
  `slt94-marca-y-vias`, `migracion-slt94-ida-y-vuelta`, guardia `fulfillment-solo-al-crear`,
  `slt94-fulfillment-caja`, `niveles`, `precedencia`, `TarifasFulfillmentSoloTienda`, `usuario-form`,
  `usuario-service`, `tarifa-valor-service` → **«Test Files 13 passed (13) · Tests 338 passed (338)»,
  VT_EXIT=0, ninguno saltado**.
- Gate local: no se re-corrió entero (instrucción del leader). Leído `progress/logs/init-slt94-t6.log`:
  `== init OK ==`, `INIT_EXIT=0` (typecheck, lint, guardias, down.sql, rápido).
- Comparación mecánica de los CHECK `tipo↔categoria` de `wallet_movimiento` y
  `wallet_tienda_movimiento` (M3) contra su última definición en dev: la nueva = la vieja + exactamente
  las 4 categorías de SLT-94 en cada una. No se pierde ninguna.
- Búsqueda de escritores de `orden`: solo `createManyOrdenes` / `createManyOrdenesConGuia`
  (`OrdenRepository.ts:3005`, `:3125`); sin borrado físico de órdenes ni desactivación de
  `tarifa_activacion` en `lib/`/`app/`/`scripts/`.

## Checklist

### CHECKPOINTS.md
- [x] Ruta completa (dinero, `high`): requirements EARS R1–R40, design con alternativas descartadas, tasks.
- [ ] **tasks.md con todas las tasks `[x]`**: NO. Las 21 están en `[ ]` aunque T1–T6 están hechas (ver menor m1).
- [x] `design.md` abre con `## Lo que ya existe`, no vacía; el diff no re-crea nada de la lista
      (reutiliza `tienda_fulfillment`, `resolverDestinoCreacion`, copia el molde SL-40 sin tocarlo).
- [x] Tamaño del PR: aceptación humana en `progress/features/SLT-94.md` (`tamano-pr-aceptado: 2026-11-08`).
- [x] Trazabilidad: R1–R40 → test concreto; mapa consolidado en `progress/impl_SLT-94.md > Mapa R→test`.
- [x] Typecheck y lint: verdes en el gate (log T6).
- [ ] `gate-completo` en CI: pendiente (se abre con el PR).
- [x] Flujo crítico «dinero/wallet/mi-wallet» con E2E: `e2e/fulfillment-cobro-por-paquete.spec.ts` (grupo `dinero`), salida local en la bitácora (21 passed, con `dos-empresas-humo`), y matado con el trigger apagado.
- [x] Sin dependencias nuevas. Sin secretos ni configuración hardcodeada en el diff.

### docs/checkpoints-proyecto.md
- [x] Tabla nueva `orden_fulfillment_movimiento` con `organizacion_id`, RLS, política `servi_app`, triggers de misma empresa e `impedir_cambio_de_empresa`; `rls-por-empresa` 87→88.
- [x] Lecturas nuevas filtran por empresa (RLS + `organizacion_id` explícito en los triggers SECURITY DEFINER); test con dos empresas (R38, ambos casos).
- [x] Las 4 migraciones traen `down.sql`; ninguna migración aplicada se edita.
- [x] Sin recursos de Ordenex; sin literales de país/moneda nuevos; sin `console.log` de PII.
- [x] Capas: decisión de nacimiento en service; dinero en la base (trigger, design §7/§8); zod en el borde (`seRecogeEnTienda`, `fulfillmentSoloMonto`).
- [x] Permisos en el servidor: invariante de la marca en `UsuarioService`, no en la UI.

## Revisión del dinero (foco del leader)

- **Cobro al crear** (`fulfillment_al_crear_orden`): solo con `tarifa_activacion` de **la empresa de la orden** (D8/R16/R38); solo `tienda_fulfillment` de esa tienda, sin zona/grupo/mensajero/vehículo y `modo = 'monto'` (R14); `NOT FOUND OR valor <= 0` → nada (R17); IVA `round(round(valor,2) × pct / 100, 2)` = HALF_UP para positivos, y `iva_pct` no puede ser NULL para `tienda_%` por el CHECK de `20261103120100` (si no, el INSERT fallaría y tumbaría la creación). Fecha = `NEW.created_at` de la orden. `AFTER INSERT … WHEN deleted_at IS NULL`, FOR EACH ROW: `skipDuplicates` no cobra omitidas (R23). Correcto.
- **Reverso al eliminar / re-cobro al restaurar** (`fulfillment_al_cambiar_borrado`): decide por el ÚLTIMO movimiento, no por `OLD.deleted_at` (R27); reverso a la tienda CONGELADA con monto/IVA/% congelados y fecha `deleted_at` (R26/R31); re-cobro solo si el último es reverso por `eliminacion` (R29/R39), con la tienda congelada (decisión R29) y `now() AT TIME ZONE 'UTC'`. Concurrencia: la fila de `orden` queda bloqueada por el UPDATE y el único `(organizacion_id, orden_id, secuencia)` es el cerrojo final. Correcto.
- **Reverso en cancelación por API** (`fulfillment_al_cancelar_por_api`): disparado por la fila de bitácora `origen_tipo = 'cancelacion_api'` (no por el estado, que comparte #42); `FOR UPDATE` sobre la orden; solo si el último es cargo. La guardia R40 fija que ese literal solo lo produce `cancelarViaApi`. Correcto.
- **Máximo un reverso por cobro**: alternancia forzada por CHECK (impar ⇔ cargo), causa↔tipo, `creacion ⇔ secuencia 1`, único por secuencia. Correcto.
- **R21 (FK SET NULL)**: implementado como se decidió: borrar el valor deja `tarifa_valor_id` NULL; monto, % IVA, IVA y tienda congelados intactos.
- **Clasificación contable**: `ingreso_fulfillment`/`ingreso_iva_fulfillment` «propio» + «cargo_a_tienda» (no suben «Entró»), ganancia vs IVA separados, pares tienda↔caja en `CONTRAPARTIDA_EN_CAJA` (459 R8 sin excepción), métricas de ganancia/IVA/caja/cuenta por pagar actualizadas. Correcto.
- **Nada retroactivo**: sin backfill de movimientos; orden anterior sin movimientos → eliminar/restaurar/cancelar no escriben (R28/R34, con test).

## Migraciones

- M1 enums: carpeta propia (los valores nuevos no se usan en la misma transacción). Down con la función dinámica de SLT-73.
- M2: `ADD COLUMN … NOT NULL DEFAULT true` + `UPDATE … = false WHERE fulfillment = true` (en prod 0 filas → todos «sí», nadie cambia de estado de nacimiento). Down copia a la vieja antes del DROP (R35, con test y mutación).
- M3: CHECK de `tarifa_valor` `NOT VALID` (no valida filas existentes; prod tiene 0). `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (R25, con test 42501). Down borra solo filas `origen_tipo = 'orden_fulfillment'` (test).
- M4: SECURITY DEFINER con `search_path` fijo y `EXECUTE` revocado a PUBLIC.

## Marca de nacimiento y UI

- Vías: `cargarMasiva` y `cargarViaApi` llaman `resolverDestinoCreacion(!seRecogeEnTienda)` de la tienda dueña; se retira el predicado por tarifa (`tieneFulfillment`). La pantalla entra por `cargarMasiva` (test de route handler en `slt94-marca-y-vias`). `ApiKeyRepository` crea la cuenta dedicada con `seRecogeEnTienda: true` y `resolverSeRecogeEnTienda` fuerza «sí» a todo rol ≠ `adminTienda` (D13).
- `UsuarioForm` manda `seRecogeEnTienda` (nunca `fulfillment`, que el zod `.strict()` rechazaría): alta y edición no rotas (6 casos + mutación M1 de T5).
- Tarifas: fulfillment solo en tienda/todas sus zonas, sin selector de modo, envío forzado a `monto`.
- Rótulos de wallet (tienda, empresa, caja) y origen legible con guía/remisión.

## Tests que pasan sin comprobar nada

- Los `if (base === undefined) return;` de `slt94-fulfillment-cobro.test.ts:121`, `slt94-fulfillment-cancelacion-api.test.ts:109` y `slt94-marca-y-vias.test.ts:165` están en `afterAll` (limpieza), no en un `it`. `fulfillment-94.ts:276` es la limpieza del fixture. Sin `if (!x) return` en aserciones.
- `describe.skip` sin base: patrón del repo; en mi corrida no hubo ningún saltado.
- Las cifras de dinero de los tests y del E2E son literales escritos a mano (1000.00/130.00/1130), no derivadas de la función bajo prueba. La bitácora documenta mutaciones que ponen rojo cada test de dinero (13 sobre M4, 7 sobre M2/M3, 19 en T2–T4, 10 en T5, 4 reales en T6 + E2E con el trigger apagado).

## Hallazgos

Ninguno BLOQUEANTE.

- **m1 · menor (proceso) — `specs/SLT-94-fulfillment-cobro-por-paquete/tasks.md:10-107`.** Las 21 tasks siguen en `[ ]`; `CHECKPOINTS.md > Completa` exige `[x]` para pasar a `done`. T1.1–T6.2 están hechas y verificadas (bitácora + mi corrida): hay que marcarlas. T0.1 (re-medir producción con las consultas de `design.md > §9` justo antes del merge a producción) es del humano y **sigue pendiente**: no se debe promover a prod sin ella (memoria «re-medir prod antes del PR»). T7.1 se cierra con este OK. No es un defecto del producto.
- **m2 · menor — carrera cancelación API / eliminación, `lib/repositories/OrdenRepository.ts` `cancelarViaApi` (~l. 3678-3697).** Lee la orden con `deletedAt: null` sin bloquearla y luego hace `update({ where: { id } })`. Si una eliminación se confirma entre la lectura y el UPDATE, la cancelación sigue sobre una orden ya eliminada: el trigger no escribe (último = reverso por eliminación), pero si luego un `maestro` la restaura, `fulfillment_al_cambiar_borrado` re-cobra a una orden que está cancelada (contra el espíritu de R39). Ventana de milisegundos, comportamiento de la cancelación previo a SLT-94; el dinero queda coherente (cobro re-cobrado = cobro que se podría devolver eliminándola otra vez). Arreglo posible a futuro: `SELECT … FOR UPDATE` o `updateMany({ where: { id, deletedAt: null } })` con conteo.
- **m3 · menor — `lib/tarifas/precedencia.ts` `rangoFulfillment`.** Trata `modo === undefined` como monto. Hoy el único constructor de `FilaValor` (`resolver-tarifas.ts:159/197/213`) trae siempre `modo`, y el CHECK M3 impide filas nuevas en %, así que no hay camino real. Si mañana otro lector arma `FilaValor` sin `modo`, un % viejo se colaría. Sugerencia: `modo !== "monto"` → null.
- **m4 · menor (UX, ya anotado en la bitácora T5 hueco 2)** — las pistas `cargosHint` de Mi wallet y `/wallet/tiendas` no nombran el fulfillment. Literales aprobados (HD3); queda para SLT-95 o una ficha de textos.
- **m5 · menor (UX, bitácora T5 hueco 3)** — en solo lectura, un % viejo de fulfillment se pinta con modo «%». Producción: 0 filas.

## Incidente del reviewer

Al construir la URL de la base desechable, un primer intento con `new URL` falló y el error imprimió en
mi salida de herramienta la `DATABASE_URL` del `.env` local (localhost, base de desarrollo). No salió de
la sesión ni se escribió en ningún archivo; no es producción. Lo dejo dicho por la regla «verificar .env
sin imprimir»; si se quiere ser estricto, rotar la contraseña local de `postgres`.

## Veredicto

**OK.** Sin bloqueantes. Antes de cerrar la feature: marcar T1–T6 en `tasks.md` (m1) y, antes de
promover a producción, correr T0.1 (re-medición en prod) y anotar el resultado en
`progress/features/SLT-94.md`. `gate-completo` en CI debe quedar verde en el PR.
