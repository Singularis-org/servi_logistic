# Review — SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»

Ruta **ligera**, revisión acotada a `git diff origin/dev...HEAD` (HEAD `193e494c`). Reviewer, 2026-11-16.
Diff: solo `tests/`, `progress/` y el spec; 0 líneas de producción. No toca dinero/permisos/auth de
producto (cambia cómo corren tests de dinero, no el código), así que la ruta ligera vale.

## Checklist

- [x] **Trazabilidad** — R730-R733 (tabla de `progress/medicion_SLT-177.md`, 239 filas); R734/R735 (0 pasa,
  0 verde sin datos); R736/R737/R739 (siembra y control positivo en cada helper, abajo); R740 (casos y
  literales, abajo); R741 (91 fuera; `premio-ranking-idempotencia` se queda por decisión de Carlos,
  16/17, con su motivo medido); R742/R743 (guardia + casos en memoria + mi contraprueba); R744/R745
  (148 motivos validados por script); R747/R748 (`tamano-pr`); R749 (`progress/deudas.md` D8, D37 cerrada, D64).
- [~] **Tasks** — T1-T7 `[x]`; **T8 `[ ]`**: falta el `gate-completo` del PR (R746). Run 44002201134 en
  curso al revisar (shards de vitest `pending`). No es del implementer: lo marca el leader con CI verde.
- [x] **Tamaño** — `node scripts/tamano-pr.mjs`: 17/40 archivos, 0/1000 producción, 1068/3000 tests. Sin línea de aceptación, no hace falta.
- [x] **Lo que ya existe** — sección presente y con contenido; el diff reutiliza `crearFksDeOrden`,
  `crearUsuarioDePrueba`, `crearOrganizacion`/`fijarEmpresa`/`comoApp`; no crea `tests/fabricas/` nueva.
- [x] **R747** — `git diff --name-only origin/dev...HEAD` sin `lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`.
- [x] **Typecheck** — `tsc --noEmit -p .` limpio.
- [x] **Lint** de lo tocado — 0 errores; 1 aviso previo (`detalle-movimiento-cierre-postgres.test.ts:432 pageSize`, no de este diff).
- [x] **Guardia del baseline** — 7/7 verde sobre el archivo real.

## Verificación propia (base `servi_slt177_desechable`, migrada + `db:seed`, vía `con-desechable.cjs`)

**Muestra verde** (11 de los 91, 9 helpers distintos): `picking-ordenes-en-preparacion` (476),
`informe-transito-hitos` (475), `whatsapp-envio-resolver-destinatarios` (474),
`419/confirmar-entrega-sin-dinero-sql-real` (419), `libro-caja-busqueda-orden-463` (caja-459),
`libro-kardex-468` (libro-468), `detalle-en-lote-464`, `detalle-movimiento-cierre-postgres` (D37),
`484-puntero-aprobacion-sql-real` y `454/caracterizacion/kpi-portal` (454), `455/migracion` (454 sin rol).
→ **11/11 archivos, 80/80 casos, 0 saltados.**

**Mutaciones propias** (quitar la siembra: el `create` se cambia por `{ id: crypto.randomUUID() }`; restauradas con `git checkout --`, árbol limpio tras cada una):

| helper | test | resultado |
|---|---|---|
| `_picking-476.ts` (zona) | picking-ordenes-en-preparacion | 7/7 rojos «476: la zona sembrada…» |
| `_informe-transito-475.ts` (tienda) | informe-transito-hitos | 4/4 rojos «475: la tienda…» |
| `_whatsapp-envios-474.ts` (modelo) | whatsapp-envio-resolver-destinatarios | 3/4 rojos «474: el usuario modelo…» |
| `419/_escenario-419.ts` (central) | 419/confirmar-entrega-sin-dinero | suite roja «419: la zona…» |
| `_fixtures/caja-459.ts` (central) | libro-caja-busqueda-orden-463 | 9/9 rojos «459: la empresa del caso tiene…» |
| `454/_escenario.ts` (central) | 484-puntero-aprobacion + kpi-portal | 2 suites rojas «454: la zona…» |
| `_fixtures/libro-468.ts` (tarifa) | libro-kardex-468 | 6/6 rojos «la base no tiene ni una tarifa…» |
| `detalle-en-lote-464` (tarifa) | el mismo | 6/6 rojos |
| `detalle-movimiento-cierre-postgres` (tarifa) | el mismo | 14/14 rojos |

**Retornos tempranos / skips** en los 91: ninguno condicionado a datos. Los únicos `return;` son
`484-puntero-incidente-blst765.test.ts:123,135`, precedidos por `expect(status).toBe("ok")` (estrechan el tipo, no saltan).

**Rol `servi_app` (`454/_escenario.ts:263-281`)**: no relaja. Es más estricto (RLS de lectura y `WITH CHECK`
de escritura, como en producción). Ningún usuario de `conEscenario` del 454 estaba verde en `dev`
fuera del baseline (los 454 externos verdes, p. ej. `total-a-cobrar-sin-cerrado-sql-real`, tienen su propio
`conEscenario`), así que ninguna aserción que ya vigilaba pierde alcance. Contraprueba de los 4 con
`{ rolDeLaApp: false }` (cambiado a `true`): `455/migracion` rojo, `455/caracterizacion/rastreo` rojo,
`455/caracterizacion/webhook-estado` rojo («permiso de…»), `454/retiro-estados-migration` rojo. Los 4 lo necesitan.

**Literales (R740)**: `it`/`test` iguales en todos los archivos tocados; `expect(` iguales o más
(D37 78→81, premio 76→79). Las únicas líneas borradas con aserción o número son tres `throw` de «no hay
fila en la base». Ningún literal de dinero cambia. La tarifa sembrada (2000/2500/…) solo aporta el id: los
importes del caso salen de la constante `TARIFA` del archivo (`libro-468.ts:52-57, 263-270`).

**Baseline**: 243 → 152; salen 91, no entra ninguna; `desde` intacto en las 152; las entradas
sin SL-31 no cambian. Las 148 que venían de SL-31 llevan todas clase medida, run 43973243440 (y
medición local cuando aplica) y una ficha que existe en el board (SLT-178…SLT-188, SLT-195, todas `pending`).
Ninguna cita SL-31. **Contraprueba R743**: devolví «SL-31» al motivo de `aviso-agregado-repository` → la
guardia da rojo con «el `motivo` cita SL-31…». Restaurado desde copia.

**Fixtures fuera de la lista**: `_fixtures/wallet-458.ts:420` pasa `reglasPaisFijas()` como 5.º argumento
de `EstadoCuentaService`, igual que el composition root (`lib/actions/estado-cuenta.ts:78`). Es la firma de
SLT-42, no relaja nada. `_fixtures/libro-468.ts:166-181` hace la misma siembra de tarifa que 464 (mutación M7 arriba). Los dos están justificados.

## Hallazgos

1. **menor** — T8 sin marcar y R746 pendiente: el `gate-completo` del PR #189 (run 44002201134) no había
   terminado. Antes del aviso de merge, el leader tiene que confirmar «sin rojos nuevos» y 0 «por limpiar», anotarlo en
   `progress/impl_SLT-177.md` y marcar T8.
2. **menor** — `progress/deudas.md` (D8) dice «sacó 92»; tras la tanda de `retiro-estados-migration`
   salen **91** (`progress/impl_SLT-177.md:290`). También quedan «92» en la sección T3-T8 de la bitácora (`:140, :193`).
3. **menor** — `detalle-movimiento-cierre-postgres.test.ts:690-694`: el `expect(fk).not.toBeNull()`
   ya no puede fallar, porque `fk` es un objeto literal. Se conserva por R740 y el control positivo real son los tres `count` de
   `:719-721`. Queda una aserción vacía.
4. **menor** — El bloque de siembra de tarifa está copiado tres veces (`libro-468.ts:166`,
   `detalle-en-lote-464.test.ts:188`, `detalle-movimiento-cierre-postgres.test.ts:702`). Debería ir a
   `_fixtures/orden-minima.ts` como `crearTarifaDePrueba(tx)` en la próxima rebanada (SLT-178…).
5. **menor** — `454/_escenario.ts:204,214` y `caja-459.ts:431,459`: `centralZonaId` pasa a ser un getter sobre
   estado de módulo (la última central sembrada). Es correcto con casos secuenciales por archivo, pero
   leerlo fuera de un escenario lanza. Está documentado en el error; solo se anota.

Sin hallazgos BLOQUEANTES.

## Veredicto

**OK**, condicionado a que el `gate-completo` del PR #189 termine en verde (R746, T8). Si sale en rojo, vuelve.
