# SLT-54 — bitácora de implementación

## Tanda A — Activación e interruptor (backend)

**Veredicto:** hecha. Sin activar, los importes salen del modelo viejo aunque haya valores guardados, con literales iguales a los de una empresa sin valores. 23 de 23 mutaciones matadas por aserción.

### Lo que la tanda B tiene que recoger

- **`lib/tarifas/servicios.ts` falla cerrado.** `FALTANTES_SIN_ATAR` lanza: `activarTarifasNuevas` por la raíz de composición responde `error` sin escribir. **T2.3 lo cambia por los faltantes reales** y actualiza el caso «sin los faltantes atados» de `tests/unit/tarifas/servicios-composicion.test.ts`. Se eligió lanzar y no una lista vacía porque esta activaría sin la confirmación de R6.
- **`FaltantesPorZona`** (`lib/interfaces/services/ITarifaActivacionService.ts`) es el mínimo para decidir la confirmación. T2.1 puede ampliarlo con `usaZona` (R16).
- **`tarifa-valor-lectores.guardia`:** T2.3 y T2.6 añaden `TarifasPantallaRepository` y `CoberturaRepository` a su lista.
- **`activarTarifasNuevas`** lleva `@sin-superficie` hasta T4.2; la guardia exige quitarlo cuando la pantalla la monte.

### Desviaciones del spec, medidas

- **Timestamps:** `20261104140000` y `20261104140100`, porque tras integrar `dev` la última era `20261104130100`. `tasks.md` actualizado.
- **Índice extra:** `tarifa_activacion_organizacion_id_idx`, que design §2.1 no pide. Lo exige la guardia `organizacion-en-modelos` aunque el único ya empiece por esa columna; `organizacion_modulo` hace lo mismo.
- **Trigger en el mismo archivo** que la tabla, como dice design §2.3. El generador los sacaría aparte: se copiaron de su salida `--faltantes`.
- **`OrdenRepository`:** su tipo de cliente también ganó `tarifaActivacion`; design §3 solo citaba los dos `TxClient`.
- **La migración `20261104140100` se rehízo en la base local** al añadir el índice (`DROP TABLE` y borrar su fila de `_prisma_migrations`). No estaba aplicada en ninguna otra base.

### Archivos

**Nuevos**
- `db/migrations/20261104140000_historial_tarifa_activacion/{migration,down}.sql`
- `db/migrations/20261104140100_tarifa_activacion/{migration,down}.sql`
- `lib/interfaces/repositories/ITarifaActivacionRepository.ts`
- `lib/interfaces/services/ITarifaActivacionService.ts`
- `lib/repositories/TarifaActivacionRepository.ts`
- `lib/services/TarifaActivacionService.ts`
- `tests/integration/db/tarifa-activacion.test.ts`
- `tests/integration/db/tarifa-activacion-migration.test.ts`
- `tests/unit/services/tarifa-activacion-service.test.ts`
- `tests/unit/guards/tarifa-valor-lectores.guardia.test.ts`

**Código modificado**
- `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `scripts/verificar-rls-despliegue.ts`
- `lib/repositories/_shared/resolver-tarifas.ts` (`usaModeloNuevo` y comentarios)
- `lib/repositories/CierreDiaRepository.ts` (comentario de `asegurarMismoModelo`), `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`, `ITarifaZonaMensajeroRepository.ts`
- `lib/types/historial-accion.ts`, `historial-accion-etiquetas.ts`, `tarifa-flexible.ts`
- `lib/tarifas/servicios.ts`, `lib/actions/tarifas.ts`

**Tests y dobles modificados**
- Sembrado de activación: `tarifas-flexibles-{respaldo,resolver,snapshot,base-congelada,escritura}.test.ts`, `tests/fabricas/organizaciones.ts`
- Doble del interruptor (`sinValoresDelModeloNuevo` pasa a `empresaSinActivar`): `tests/fixtures/tarifa-tienda.ts` y sus usos
- Cifras y catálogos: `verificar-rls-despliegue.test.ts`, `rls-por-empresa.guardia`, `historial-accion-escrituras-cubiertas.guardia`, `catalogo-y-choke-point.test.ts`, `api-key-dependencias-usuario.ts`, `caja-459-migration.test.ts` y los siete `*-migration.test.ts` del historial que listan los tipos posteriores

### Mapa R → test (tanda A)

| R | Test |
|---|---|
| R1 | `tests/integration/db/tarifas-flexibles-respaldo.test.ts` › «empresa sin activar con valores nuevos calcula con el viejo» (cobro, listado, pago, hueco sin viejo); `tarifas-flexibles-snapshot.test.ts` › «SLT-54 R1 — con valores nuevos SIN activar…» (cierre, detalle y costo de API con los mismos literales); `tarifa-valor-lectores.guardia.test.ts` |
| R2 | `tarifas-flexibles-resolver.test.ts` › «activada sin valores: sin tarifa y sin leer el viejo»; `tarifas-flexibles-respaldo.test.ts` › «SLT-54 R2 · empresa activada…» |
| R3 | `tarifa-activacion.test.ts` › «fijar y quitar no cambian el modelo» |
| R4 | `tarifa-activacion.test.ts` › «activación con actor e historial en la misma transacción», «si el historial falla, la activación no queda» |
| R5 | `tarifa-activacion-service.test.ts` › «matriz de roles» |
| R6 | `tarifa-activacion-service.test.ts` › «con faltantes pide confirmación» |
| R7 | `tarifa-activacion.test.ts` › «dos activaciones simultáneas» (dos conexiones reales, con barrera); `tarifa-activacion-migration.test.ts` › «el unico por empresa» |
| R8 | `tarifa-activacion-migration.test.ts` › «la app no modifica ni borra». La mitad de pantalla va en `TarifasModulo.test.tsx` (tanda D) |
| R9 | `tarifa-activacion.test.ts` › «activar no toca valores, viejo, marca ni cierres» |
| R10 | `cierre-pago-congelado.test.ts` › «aborta al cambiar de modelo»; `tarifas-flexibles-snapshot.test.ts` › «activación entre pago y cobro» |
| R11 | `tarifa-activacion-migration.test.ts` › «relleno», «el relleno no deja historial…», «relleno y bajada» |
| R12 | `tarifa-activacion.test.ts` › «activar A no cambia B», «como A no se puede crear la activación de B»; `tarifa-activacion-migration.test.ts` › «RLS: cada empresa ve solo su fila» |

Ida y vuelta (`up/down/up`) contra Postgres: «relleno y bajada», en base propia; compara catálogos y conteos, y comprueba que el segundo `up` reactiva según los datos de ese momento.

### Mutaciones

Autocomprobación antes de mutar: 221 tests, 221 pasados, 0 fallados, 0 saltados. Cada mutación se aplicó, corrió y revirtió; `git status --porcelain` vacío después de cada una y al final. Todos los rojos son de aserción, ninguno de compilación.

| Mutación | Qué caso la mató | Rojo |
|---|---|---|
| M1 `usaModeloNuevo` vuelve a leer `tarifa_valor` (R1, R2) | «activada sin valores» y «sin activar con valores» (7 casos) | `expected { modelo: 'nuevo', valores: {…} } to deeply equal { modelo: 'viejo', tarifa: {…} }` |
| M2a nunca pide confirmación (R6) | «sin la confirmacion no activa» | `expected { status: 'ok' } to deeply equal {…}` |
| M2b confirmar no basta (R6) | «con la confirmacion activa» | `to deeply equal { status: 'ok' }` |
| M2c cuenta zonas completas (R6) | «sin la confirmacion…», «sin faltantes activa» | `to deeply equal` |
| M3 no traduce el `P2002` (R7) | «dos activaciones simultáneas» | `expected [ 'error', 'ok' ] to deeply equal [ 'ok', 'ya_activada' ]` |
| M3b sin único en la base (R7) | «el unico por empresa» | `expected { ok: true, filas: 1 } to deeply equal { ok: false, code: '23505' }` |
| M4 `admin` también activa (R5) | «matriz de roles» | `expected { status: 'ok' } to deeply equal { status: 'forbidden' }` |
| M4b el rol se mira tras leer (R5) | «matriz de roles» (9 casos) | `expected "vi.fn()" to not be called at all` |
| M5 política RLS abierta (R12) | «RLS: cada empresa ve solo su fila» | `expected 1 to be +0` |
| M5b sin `ENABLE RLS` (R12) | «RLS: cada empresa ve solo su fila» | `expected 1 to be +0` |
| M5c RLS apagada en la base, leyendo como `servi_app` (R12) | «activar A no cambia B», «como A no se puede crear…» | `expected true to be false`; `promise resolved "1" instead of rejecting` |
| M6 el historial traga su fallo (R4) | «si el historial falla» | `promise resolved "{ creada: true }" instead of rejecting` |
| M6b fila sin actor (R4) | «activación con actor…» | `expected null to be '<uuid>'` |
| M7 sin `REVOKE` (R8) | «la app no modifica ni borra» | `expected { ok: true, filas: 1 } to match { ok: false, code: '42501' }` |
| M9a sin relleno (R11) | «relleno» y 5 más | `expected [] to have a length of 1` |
| M9b relleno a todas (R11) | «relleno» y 3 más | `expected [ … ] to have a length of 1 but got 3` |
| M10 activar borra el viejo (R9) | «activar no toca…» | `expected {…} to deeply equal {…}` |
| M11 lector nuevo de `tarifa_valor` (T1.5) | guardia de lectores | `expected [ …(4) ] to deeply equal [ …(3) ]` |
| M12 el cierre no aborta (R10) | «aborta al cambiar de modelo», «activación entre pago y cobro» | `promise resolved … instead of rejecting` |
| M13 la fábrica activa sin faltantes (R6) | «sin los faltantes atados» | `expected [Function] to throw error including 'T2.3'` |
| M14 sin trigger de misma empresa | «trigger de misma empresa» | `expected { ok: true } to match { ok: false, code: 'SL017' }` |
| M15 la action da un `ok` falso | «un fallo inesperado es `error`» | `expected { status: 'ok' } to deeply equal { status: 'error' }` |
| M16 sin `appendAccion` (R4) | «activación con actor…», guardia `historial-accion-escrituras-cubiertas` | `expected [] to deeply equal [ {…} ]` |

M5c se hizo con `ALTER TABLE tarifa_activacion DISABLE ROW LEVEL SECURITY` en la base local y se restauró; con la RLS de vuelta, los mismos casos pasan.

### T1.6 — contraprueba en rojo

```
== M1 interruptor lee tarifa_valor (R1, R2)
   total=53 pass=46 fail=7 skip=0
   X SLT-54 R2 · activada sin valores: sin tarifa y sin leer el viejo
     AssertionError: expected { modelo: 'viejo', tarifa: { …(11) } } to deeply equal { modelo: 'nuevo', valores: {} }
   X SLT-54 R1 · empresa sin activar con valores nuevos calcula con el viejo · cobro
     AssertionError: expected { modelo: 'nuevo', valores: { …(4) } } to deeply equal { modelo: 'viejo', tarifa: { …(11) } }

== M5 politica RLS abierta en la migracion (R12)
   total=12 pass=11 fail=1 skip=0
   X R12 — RLS: cada empresa ve solo su fila y no crea la de otra
     AssertionError: expected 1 to be +0 // Object.is equality
```

### Salida de los comandos

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .   -> exit 0, 0 errores
$ pnpm exec eslint <archivos .ts del commit>                            -> exit 0
$ pnpm run test:guardias
  Test Files  1 failed | 329 passed (330)
       Tests  4 failed | 4590 passed | 1 skipped (4595)
  (los 4 rojos: dependencias-declaradas-presentes.guardia.test.ts, en el baseline)
$ pnpm exec vitest run <service, composicion, cierre-pago, convergencia, tarifa-vigente, verificar-rls,
    tarifa-activacion*, tarifas-flexibles*, historial-accion*, caja-459-migration, correccion-resultado-gestion-migration>
  Test Files  4 failed | 25 passed (29)
       Tests  42 failed | 323 passed (365)
  (los 42 rojos, en 4 archivos del baseline: historial-accion-atomicidad.test.ts, historial-accion-lectura.test.ts, historial-accion-migration.test.ts, historial-accion-q1-ubicacion.test.ts)
$ los 14 archivos propios de la tanda, solos (service, composicion, cierre-pago, convergencia, tarifa-vigente,
    verificar-rls, tarifa-activacion*, tarifas-flexibles*)
  Test Files  14 passed (14)
       Tests  181 passed (181), 0 saltados
$ tarifa-activacion-migration + catalogo-postgres-acota-esquema, tras el ultimo ajuste
       Tests  19 passed (19)
$ pnpm exec vitest related --run <16 archivos de lib y scripts>, sobre la base local, antes de los ajustes finales de tests
  Test Files  232 failed | 1212 passed | 2 skipped (1446)
       Tests  801 failed | 16798 passed | 643 skipped (18242)
  (217 archivos en el baseline; de los 15 de fuera, 8 eran mios y estan corregidos, y 7 se explican abajo)
```

### Rojos fuera del baseline

Ninguno lo causa esta tanda. Cuatro archivos salen rojos en `vitest related` y no están en `tests/baseline-rojos.json`. Se corrieron sobre una copia del commit base (`9124244a`) contra la misma base local y dan **los mismos 9 rojos**:

- `tests/integration/db/caja-backfill.test.ts` (5): `referencia a otra empresa: cierre_dia.destino_zona_id -> zona`
- `tests/integration/db/notificacion-evento-bloqueo-cierre-migration.test.ts` (1), `notificacion-evento-gasto-fijo-migration.test.ts` (1), `notificacion-evento-webhook-suscripcion-migration.test.ts` (2): `22P02 … notificacion_evento: «geocodificacion_caida»`

Tres más (`vehiculos-plataforma`, `plan-de-la-empresa`, `zona-central-guarda-y-rastro`) dieron timeout con toda la suite relacionada en paralelo y pasan en serie.

**En el baseline:** `dependencias-declaradas-presentes.guardia.test.ts` (4 rojos, en guardias) y otros 217 archivos en `vitest related`, en su mayoría por lo que le falta a la base local: catálogo `order_status` sin sembrar (`ayuda_tienda`, `devolucion_por_confirmar`) y `referencia a otra empresa`. Ninguno menciona el interruptor salvo `orden-traspaso-migration`, que lista migraciones y ya estaba en el baseline.

**Sin correr aquí:** E2E y `./init.sh`, por encargo. Los E2E que siembran `tarifa_valor` entran en la tanda F.
