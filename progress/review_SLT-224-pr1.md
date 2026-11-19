# Review SLT-224 «Retiro a central: recalcular la zona de la orden (quedan con la zona vieja tras mover distritos)» — PR 1 (#253)

Reviewer, 2026-11-19. Rama `feature/SLT-224-zona-al-retirar-a-central`, HEAD revisado `9871d4f2`
(con `origin/dev` mergeado; head del PR en GitHub = `9871d4f2`). Alcance de este PR: R1700-R1712 y
R1714-R1719 (T1-T6, T8). T9 (R1713, R1716 y la parte de pantalla de R1715/R1718) y el cambio de corte
de P2 van en el PR 2 (`design.md §6`, `tasks.md > T9`).

Base: desechable nueva `servi_slt224_review` (Postgres local, `migrate deploy` + `db:seed`), exportada
como `DATABASE_URL`/`DIRECT_URL`; ninguna URL impresa. Sin `migrate reset`, sin `prisma generate`, sin
tocar `.env.prod`. MCP del grafo no usado (worktree sin indexar); todo por Grep/Read.

## Veredicto: RECHAZADO

Un bloqueante, de test y no de código: el JOIN por empresa de la migración no lo prueba ningún test
(B1). El código del PR está bien: lo que se movió no cambia el comportamiento, y el corte, la migración
y la autorización son correctos. Con B1 arreglado (un fixture y una aserción) pasa a APROBADO.

## Checklist

- [x] **Trazabilidad** R1700-R1712, R1714-R1719 → tests reales (mapa en `progress/impl_SLT-224.md`,
  comprobado). R1713/R1716 declarados para el PR 2. Pero «en su empresa» de R1708 no lo mata ningún
  test (B1).
- [~] **Tasks**: T1-T6 y T8 en `[x]`. T9 se aplaza al PR 2 por decisión escrita del leader. T0 y T7 siguen
  en `[ ]` aunque están hechos (m3).
- [x] **Tamaño** (`node scripts/tamano-pr.mjs`): aviso, sin pasar del tope (27/40 archivos, 936/1000
  líneas de producción, 1532/3000 de tests).
- [x] **`design.md > Lo que ya existe`**: está y tiene contenido. El diff no re-crea nada; reutiliza la
  regla de 366/377 moviéndola a un helper.
- [x] **typecheck**: exit 0. **lint** de los archivos del diff: 0 errores (1 warning).
- [x] **Guardias**: `pnpm run test:guardias`: 360 archivos, 5416 passed, 1 skipped.
- [x] **Tests del diff contra Postgres real**: 15 archivos y 325 tests en verde, 0 skipped
  (recepcion-central-reconcilia-zona, zona-desalineada-central-migration, actualizacion-zonas,
  retiro-satelite-central, zona-sin-distritos, zona-reconciliacion-ordenes,
  zona-central-guarda-y-rastro, zona-pago-mensajero-rastro, recoleccion-recibida-libera-mensajero, las
  2 guardias tocadas y los 4 unit tocados).
- [x] **Migraciones**: slt76-retirar-respaldos, zona-distrito-unica, orden-traspaso-migration e
  historial-accion-orden-zona-reconciliada en verde (53/53) con la migración aplicada. `db:rollback` →
  `migrate deploy` corre sin error.
- [x] **Multi-tenant**: el código de la migración, el helper y la action es correcto. Ver B1 y m1 para los
  tests.
- [x] **Autorización en servidor**: las dos actions hacen `resolveActorFromSession` + `esAccesoTotal`
  antes de instanciar el servicio, y `actualizar` lo vuelve a comprobar en el servicio.
- [x] **R1705**: ni el retiro ni el manifiesto cambian. El diff de `OrdenRepository` solo toca
  `recibirEnBodegaCentral`; `ManifiestoService` y `retirarSateliteLote` no aparecen en el diff.
- [x] **Sin literales de país ni recursos de Ordenex. No entra ninguna dependencia.**
- [x] **E2E en local**: el implementer dejó constancia de retiro-satelite-central 3/3, recibir-paquetes
  2/2 y zona-sin-distritos 1/1. No los repetí.
- [x] **Comentarios**: explican el porqué.

## Foco pedido por el leader

**El guardado de zona no cambia (366/377).** Comparé byte a byte el bloque `ZonaRepository.update:613-719` y
`whereBaseElegible` de `origin/dev` con `reconciliarZonaDeOrdenes`. La lógica es idéntica: la misma
lectura de `zona_distrito`, el mismo colapso, un solo `randomUUID` y un solo `resolverActorCongelado`
cuando hay zona resuelta, el mismo `count` del estante, el `findMany` con `notIn` y el `updateMany`
de solo `zonaId` con `appendAccion`. Sin `ordenIds` ni `excluirEstados`, el `where` no gana campos (un
spread condicional). `zona-reconciliacion-ordenes.test.ts`, `zona-repository.test.ts`,
`zona-central-guarda-y-rastro.test.ts` y `zona-pago-mensajero-rastro.test.ts` no tienen diff y están en
verde.

**Mutaciones que corrí yo** (script: aplica, corre vitest, restaura y comprueba con `git diff` que restauró;
el árbol quedó limpio):

| # | Mutación | Resultado |
|---|---|---|
| A | helper sin `cierreDetalles: { none: {} }` | 5 rojos (R1701 de la recepción, 2 del botón, 2 de la 366/377) |
| B | helper sin el estante en `noSeMueven` | 8 rojos (377/R1, R2, R6, R7, R9, R12, R986 de SLT-197 y el botón) |
| C1 | migración con `en_bodega_satelite` en los estados | 3 rojos |
| C2 | migración con `por_devolver_a_bodega_central` | 3 rojos |
| C3 | migración con `entregado` | 3 rojos |
| D | migración sin `zd.organizacion_id = o.organizacion_id` | **sobrevive, 5/5 verdes** → B1 |
| E | el `down.sql` pisa una zona cambiada después | 1 rojo |
| F | la migración invierte el corte de gestión | 4 rojos |
| G | el SQL del botón sin `zd.organizacion_id = o.organizacion_id` | **sobrevive, 4/4 verdes** → m1 |
| H | el SQL del botón sin `o.organizacion_id = current_setting(...)` | 3 rojos |
| I | la recepción sin `ordenIds: [ordenId]` | 1 rojo |
| J | `reconciliaZona: false` en la arista 138 | 6 rojos |

**La migración `20261121120000_slt224_zona_de_ordenes_en_central`:**
- la regla es genérica, sin ids fijos, y solo toca `en_bodega_central`/`en_ruta_bodega_central`, con el
  corte de `whereBaseElegible`;
- un lote por empresa y `organizacion_id` explícito en `historial_accion`;
- el UPDATE solo escribe `zona_id`/`updated_at`;
- el respaldo va en el esquema propio `respaldo_slt224` con `REVOKE` sobre el esquema y la tabla;
- el `down.sql` solo revierte lo suyo: restaura si la zona sigue siendo la que puso la corrección y la
  anterior existe, borra por lote y por acción, y borra su tabla y su esquema;
- su marca de tiempo es posterior a todas las de `dev` (`20261120120000_plan_beneficio`) y a las de los PR
  abiertos (#251 `20261120120000`, #250 `20261120130000`);
- no choca con SLT-76: no usa el esquema `respaldo`, y las pruebas de SLT-76 y de SLT-75 dan verde con la
  migración aplicada.

**Desvíos declarados, todos legítimos:**
1. El esquema `respaldo_slt224`: correcto, por SLT-76. El design quedó atrás (m4).
2. `reconciliaZona?` es opcional y su ausencia equivale a `false`, lo seguro; el servicio siempre lo pasa
   (lo matan la mutación J y M4 del implementer).
3. La guardia R1706 se acota al cuerpo de los tres métodos para el corte y mira el archivo entero para el
   literal de la acción: está bien razonado (`contarOrdenesVivasPorZona` usa el corte para contar).
4. `zona-sin-distritos.test.ts` es una enmienda legítima y no un test silenciado: cambia la aserción al
   comportamiento nuevo (`zonaTrasRecepcion` = GAM, re-guardado con 0 reconciliadas) y mantiene
   `zonaFinal` = GAM, así que es más estricto. R1228 de SLT-198 sigue cubierto por R986 de
   `retiro-satelite-central` (lo rompe la mutación B). Ver m5.
5. Pasar al helper los distritos de todas las desalineadas da el mismo resultado: el `WHERE` del helper
   decide (lo matan A y B).
6. El mutante «no releer» es equivalente según el argumento del implementer: la primera lectura está
   dentro de la misma tx y las saltadas salen de clasificar las filas. Lo acepto.

## Hallazgos

### BLOQUEANTE

- **B1 — El JOIN por empresa de la migración no lo prueba ningún test (R1708 «en su empresa»,
  `docs/checkpoints-proyecto.md > Datos y seguridad`: «hay un test de integración que lo prueba con dos
  empresas»).** La migración corre como dueño, sin RLS, así que `zd.organizacion_id = o.organizacion_id`
  es la ÚNICA defensa. Si se quita, una orden de la empresa A cuyo distrito también mapea la empresa B
  toma la zona de B: escritura entre empresas, y además filas duplicadas en el respaldo. La mutación D
  queda 5/5 en verde porque `sembrar` crea distritos propios por empresa y ninguno se comparte.
  **Qué falta:** en `tests/integration/db/zona-desalineada-central-migration.test.ts`, que la empresa 2
  mapee a una zona suya el mismo distrito de una orden de la empresa 1 (una alineada y una desalineada
  en `en_bodega_central`). Hay que afirmar que la alineada no cambia, que la desalineada toma la zona de
  su propia empresa y que el respaldo tiene una fila por orden. Después, comprobar que D da rojo. La
  geografía es de la plataforma y compartida, así que en producción dos empresas que mapean el mismo
  distrito es lo normal.

### menor

- **m1 — El JOIN por empresa del SQL del botón (`ActualizacionZonasRepository.sqlZonaErrada`) sobrevive
  a su mutación (G, 4/4 en verde).** En producción lo respalda la RLS de `zona_distrito`; en el test no,
  porque la mutación H muere, señal de que ahí no actúa la RLS. El mismo fixture de distrito compartido
  de B1, llevado a `actualizacion-zonas.int.test.ts`, lo mata.
- **m2 — `docs/ayuda/oficina/ordenes.md` ya trae la sección «Actualizar zonas» y el botón no se monta
  hasta el PR 2.** Si esto sale a producción esta noche, la ayuda describe un botón que no existe. Además,
  la decisión de Carlos sobre P2 cambia el texto de «se saltan … las que ya tienen un cierre». Lo
  coherente es llevar la sección al PR 2. El párrafo de la recepción sí es de este PR.
- **m3 — En `tasks.md`, T0 y T7 siguen en `[ ]` aunque están hechos** (T0 re-medido en `design.md §6`;
  `init.sh`, E2E y mapa en la bitácora). Además, T0 pide anotar los números en
  `progress/features/SLT-224.md`, y ese archivo no existe ni aquí ni en el checkout principal.
- **m4 — El design sigue nombrando `respaldo.slt224_orden_zona`** (§5.1 pasos 2-3, §5.3 y, sobre todo, el
  **T11 de §6**, `:393`). La tabla real es `respaldo_slt224.orden_zona`. Si el leader corre el T11 tal
  como está escrito tras el deploy, consultará una tabla que no existe. Hay que actualizar el design al
  desvío 1.
- **m5 — `requirements.md` declara la enmienda a SLT-197/R977, pero no el cambio que R1700 introduce en
  el camino de SLT-198/R1228** (la orden ya llega con GAM y el re-guardado no mueve nada). Basta una línea
  junto a la enmienda a R977.
- **m6 — No hay constancia de `e2e/dos-empresas-humo.spec.ts` en local** (checkpoint «Aislamiento entre
  empresas»: una feature que toca datos de negocio lo corre). El check `e2e (aislamiento)` del CI lo
  cubre en este PR. Que quede verde antes del aviso de merge.

## Recuento

B = 1, m = 6.
