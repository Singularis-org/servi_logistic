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


## Tanda B — Lecturas, referencia y vías viejas (backend)

**Veredicto:** hecha. `activarTarifasNuevas` ya no falla cerrado: la raíz de composición le pasa el mismo service que la pantalla, y un test mide la lista hasta el cliente. 66 de 66 mutaciones matadas por aserción. La UI vieja tuvo que cambiar, lo mínimo (abajo).

### Lo que la tanda D tiene que recoger

- **`_components/tarifas-retiradas.ts` es provisional.** Sustituye las cuatro actions retiradas en `TiendasModule` y `CrearTiendaForm`: todo responde `forbidden`, así que la pantalla vieja compila, enseña su aviso de carga y no lee ni escribe precios. Sale en T4.1 con esos dos archivos; `tests/components/CrearTiendaForm.test.tsx` lo mockea y sale con ellos. Está en `tasks.md > Pantalla vieja, salen`.
- **Siete actions con `@sin-superficie`:** `cargarPantallaTarifas`, `cargarZonaTarifas`, `guardarValoresTarifa` y las cuatro de grupos, además de `activarTarifasNuevas` de la tanda A. La guardia exige quitarlas cuando la pantalla las monte.
- **`guardarValoresTarifa` responde siempre `{ status: "ok", resultados }` si hay sesión y la entrada es válida:** un `admin` recibe `forbidden` fila por fila. La pantalla pinta por `clave`.
- **Lista de precios de tienda (R41):** `cargarPantallaTarifas` trae `preciosTienda`, todos los valores con tienda de la empresa.

### Decisiones y desviaciones del spec, medidas

- **`cargarZonaTarifas({ zonaId, tiendaId? })`.** Design §7 solo cita `zonaId`. La referencia de una tienda necesita saber cuál: sin `tiendaId`, sería una lectura por cada tienda en cada zona abierta. El selector de nivel la pide al elegirla.
- **Nivel «Toda la zona» con distritos marcados y sin marcar: da «Varía».** R23 cita los distritos de un grupo; la zona es el conjunto de sus distritos y el cálculo real les cobra importes distintos. Mostrar solo el normal escondería el pacto.
- **`ParModeloViejo` en vez de `ParTarifa`** en `leerModeloViejoCon`. La guardia `tarifas-distrito-pasado` rechaza con razón un `distritoId: null` a mano. La cascada vieja no mira el distrito, así que el tipo no lo lleva. La guardia no cambió.
- **Catálogo sin vehículos activos:** el pago por entregado solo lo cubre el valor para todos. Un `every` sobre lista vacía lo daría por cubierto sin ningún valor.
- **Mensaje de R52:** `existeVehiculo` da paso a `vehiculoEsElegibleONivelOcupado`, que responde `false` tanto si no existe como si está inactivo, con un solo mensaje.
- **`CoberturaRepository`:** se quitó el `zonaId: { not: null }` que puse primero: sobrevivía a su mutación porque el CHECK de niveles ya lo impide, y design §8 no lo pide.
- **Sin tocar `distritosEspecialesSchema` ni `DistritoZonaEspecialService`:** los usa `scripts/demo-qa/receta.ts`.
- **R53** ya estaba en el mapa sin test; se añadió en `tarifas-flexibles-resolver.test.ts`.

### Archivos

**Nuevos**
- `lib/tarifas/faltantes.ts`, `lib/tarifas/referencia-vigente.ts`
- `lib/interfaces/repositories/ITarifasPantallaRepository.ts`, `lib/repositories/TarifasPantallaRepository.ts`
- `lib/interfaces/services/ITarifasPantallaService.ts`, `lib/services/TarifasPantallaService.ts`
- `app/(app)/configuracion/tarifas/_components/tarifas-retiradas.ts` (provisional)
- `tests/unit/tarifas/faltantes.test.ts`, `tests/unit/tarifas/referencia-vigente.test.ts`, `tests/unit/services/tarifas-pantalla-service.test.ts`
- `tests/integration/db/tarifas-referencia.test.ts`, `tests/unit/guards/tarifas-sin-escritura-vieja.guardia.test.ts`

**Código modificado**
- `lib/actions/tarifas.ts` (salen cuatro; entran las de lectura, guardado y grupos), `lib/actions/zonas.ts` (R27), `lib/actions/geografia.ts` (sale `actualizarDistritosEspeciales`)
- `lib/tarifas/servicios.ts` (T2.3), `lib/repositories/_shared/resolver-tarifas.ts` (`leerModeloViejoCon`), `lib/repositories/CoberturaRepository.ts` (R30)
- `lib/repositories/TarifaValorRepository.ts`, `lib/services/TarifaValorService.ts`, `lib/interfaces/repositories/ITarifaValorRepository.ts` (R52), `lib/services/GrupoDistritosService.ts` (mensajes)
- `lib/interfaces/services/ITarifaActivacionService.ts` (`usaZona`), `lib/types/tarifa-flexible.ts` (esquemas del borde), `lib/types/historial-accion.ts` (comentarios)
- `TiendasModule.tsx`, `CrearTiendaForm.tsx`: solo la línea del import

**Tests modificados o retirados**
- Reescrito: `tests/integration/actions/tarifas-action.test.ts`. Retirado: `tests/unit/actions/distritos-especiales-action.test.ts`
- Ampliados: `servicios-composicion.test.ts`, `tarifa-activacion.test.ts`, `cobertura-repository.test.ts`, `tarifas-flexibles-escritura.test.ts`, `tarifas-flexibles-resolver.test.ts`, `zonas-action.test.ts`, `tarifa-valor-service.test.ts`, `zona-guardado-conserva-costos.test.ts`
- Ajustados: `grupo-distritos-service.test.ts`, `tarifa-activacion-service.test.ts`, `geografia-action.test.ts`, `cobertura.composition-root.test.ts`, `tarifa-valor-lectores.guardia.test.ts`, `distrito-zona-especial-por-empresa.test.ts`, `zona-especial-dos-empresas.test.ts`, `tests/fabricas/escenarios/reparto.ts` (comentario) y los mocks de `Zona*` y `CrearZonaFormReconciliacion`

### Mapa R → test (tanda B)

| R | Test |
|---|---|
| R13-R16 | `tests/unit/tarifas/faltantes.test.ts`; R14 también `tarifas-referencia.test.ts` › «lo que juzgan los faltantes…» |
| R17 | `faltantes.test.ts` › «estados»; `tarifas-pantalla-service.test.ts` › «la pantalla da los mismos estados» |
| R6 por la raíz | `servicios-composicion.test.ts` › «activar por la fabrica pide confirmacion…»; `tarifa-activacion.test.ts` › «con faltantes reales pide confirmación» |
| R21-R23 | `tests/unit/tarifas/referencia-vigente.test.ts` (literales); `tests/integration/db/tarifas-referencia.test.ts` › «la referencia sale de la fila…», «la referencia dice lo mismo que cobra el cálculo real» |
| R24, R45 | `tarifas-referencia.test.ts` › «activada no lee el viejo» (cuenta los accesos a los delegados, con control positivo) |
| R12 | `tarifas-referencia.test.ts` › «la empresa A no ve nada de B», como `servi_app` |
| R26 | `tests/integration/actions/tarifas-action.test.ts` › «las acciones viejas ya no existen»; `tarifas-sin-escritura-vieja.guardia.test.ts` |
| R27 | `zonas-action.test.ts` › «la action rechaza costos»; `zona-guardado-conserva-costos.test.ts` › «SLT-54 R27» (Postgres) |
| R28 | `superficie-de-uso.guardia`; `tarifas-sin-escritura-vieja.guardia`; `geografia-action.test.ts` |
| R29 | `tarifa-activacion.test.ts` › «guardar no escribe en el viejo» |
| R30 | `cobertura-repository.test.ts` › «tarifa general por modelo», «dos empresas», «la marca sigue en el Excel tras activar» |
| R35, R38 | `tarifas-action.test.ts` › «guardar valores» |
| R36, R37 | `tarifas-action.test.ts` › «`ivaPct` en un pago», «dos cambios del mismo concepto y nivel» |
| R42 (servidor) | `tarifas-action.test.ts` › «las cuatro actions de grupos» |
| R46 | `tarifas-referencia.test.ts` › «marca y grupo por separado» |
| R48 | `tarifas-referencia.test.ts` › «un vehículo dado de alta aparece» |
| R52 | `tarifa-valor-service.test.ts` › «vehículo inactivo»; `tarifas-flexibles-escritura.test.ts` › «inactivo» (5 casos más empresa ajena) |
| R53 | `tarifas-flexibles-resolver.test.ts` › «vehículo inactivo sigue pagando» |
| R55 (servidor) | `tarifas-pantalla-service.test.ts` › «matriz de roles»; `tarifas-referencia.test.ts` › «admin lee lo mismo que maestro» |
| R57 (servidor) | `tarifas-pantalla-service.test.ts` › «un fallo de lectura es `error`» |

R20, R25, R33, R34, R39-R41, R43-R45 de pantalla, R47, R49-R51, R54-R61 de pantalla: tanda D.

### Mutaciones

Autocomprobación antes de mutar: cada conjunto de tests corrió sin mutar y dio su total (24, 39, 27, 13, 27, 32, 12, 37, 21, 14 tests), 0 saltados. Cada mutación se aplicó, corrió y revirtió; `git status --porcelain` vacío al final de cada tanda. Una mutación cuenta como matada solo con un rojo nuevo por aserción. Salvo donde se indica, en la primera pasada: 4 sobrevivieron y se resolvieron (abajo).

| Mutación | Primer caso que la mató | Rojo |
|---|---|---|
| F1 cuenta faltante un 0 escrito (filtra por importe) -> precio de tienda cubre (R14) | un precio de tienda no cubre a la zona, ni en la zona ni en un g | `expected [ 'tienda_flete_rechazo' ] to deeply equal [ 'tienda_flete_entregado', ...(1) ]` |
| F2 valor propio del mensajero cubre (R14) | un valor propio del mensajero no cubre a la zona | `expected [] to deeply equal [ 'mensajero_entregado' ]` |
| F3 el grupo cubre a la zona (zona con solo grupos, R14) | zona con solo grupos: un esencial que solo tiene el grupo falta  | `expected [] to deeply equal [ Array(1) ]` |
| F4 grupo sin valor cuenta como faltante (R16) | un precio de tienda no cubre a la zona, ni en la zona ni en un g | `expected [ 'tienda_flete_entregado', ...(2) ] to deeply equal [ 'tienda_flete_entregado', ` |
| F5 no informa usaZona (R16) | no suma faltante y se informa, un aviso por esencial | `expected [] to deeply equal [ { grupoId: 'g1', ...(2) }, ...(2) ]` |
| F6 un vehiculo basta en vez de todos los activos (R15) | le falta si queda un vehculo activo sin valor | `expected [] to deeply equal [ 'mensajero_entregado' ]` |
| F7 catalogo vacio da por cubierto (every vacio, R15) | sin vehculos activos en el catlogo, solo lo cubre el valor para  | `expected [] to deeply equal [ 'mensajero_entregado' ]` |
| F8 cualquier fila por vehiculo cubre (inactivo suple, R15) | le falta si queda un vehculo activo sin valor | `expected [] to deeply equal [ 'mensajero_entregado' ]` |
| F9 sin_empezar por faltantes=3 en vez de por valores (R17) | Faltan: un valor que no es esencial ya la saca de Sin empezar | `expected 'sin_empezar' to be 'faltan' // Object.is equality` |
| F10 comision COD es esencial (R13) | son exactamente tres: flete por entregado, flete por devolucin a | `expected [ 'tienda_flete_entregado', ...(3) ] to deeply equal [ 'tienda_flete_entregado', ` |
| F11 M de T cuenta tambien las que faltan (R17) | M de T: cuenta solo las completas | `expected 3 to be 2 // Object.is equality` |
| R1 sonda rota: no distingue No paga (T2.2) | mensajero por entregado: su importe, sin IVA | `expected { tipo: 'no_paga' } to deeply equal { Object (tipo, valor, ...) }` |
| R2 sin sonda: el 0 configurado y el No paga se confunden (R22) | un 0 configurado es un importe en 0, no No paga | `expected { tipo: 'no_paga' } to deeply equal { tipo: 'monto', valor: '0.00', ...(1) }` |
| R3 ignora la marca en las variantes (pacto, R21) | nivel zona: la fila general, con la marca de sus distritos y el  | `expected { tipo: 'monto', ...(2) } to deeply equal { tipo: 'varia', ...(2) }` |
| R4 ignora la bodega principal de la zona (R21) | bodega principal: la variante de la zona central, y el pacto la  | `expected { tipo: 'monto', ...(2) } to deeply equal { tipo: 'monto', ...(2) }` |
| R5 Varia ordena como texto (R23) | el orden es numrico: 900 es menor que 10000 aunque como texto no | `expected { tipo: 'varia', ...(2) } to deeply equal { Object (tipo, desde, ...) }` |
| R6 grupo con las marcas de toda la zona (R23) | nivel grupo: vara entre los distritos de ESE grupo | `expected { tipo: 'varia', ...(2) } to deeply equal { tipo: 'monto', ...(2) }` |
| R7 tienda en todas sus zonas sin la variante principal (R23) | en todas sus zonas: vara entre la bodega principal y las dems | `expected { tipo: 'monto', ...(2) } to deeply equal { tipo: 'varia', ...(2) }` |
| R8 Todos los vehiculos solo lee la por defecto (R23) | nivel zona: la fila general, con la marca de sus distritos y el  | `expected { Object (tipo, valor, ...) } to deeply equal { Object (tipo, desde, ...) }` |
| R9 cascada: el par de zona lleva una tienda real (R21) | pedir una tienda no cambia lo que dice el nivel zona | `expected { tipo: 'monto', ...(2) } to deeply equal { tipo: 'varia', ...(2) }` |
| R10 pago: sin caida por vehiculo (lee solo la general, R21) | nivel zona: la fila general, con la marca de sus distritos y el  | `expected { Object (tipo, valor, ...) } to deeply equal { Object (tipo, desde, ...) }` |
| R11 sin_tarifa pierde frente a No cobra (R22) | sin fila, Sin tarifa, tambin en lo que el viejo nunca cobra | `expected { tipo: 'no_cobra' } to deeply equal { tipo: 'sin_tarifa' }` |
| R12 pago general en la clave de un vehiculo (lectura, R21) | nivel zona: la fila general, con la marca de sus distritos y el  | `expected { Object (tipo, valor, ...) } to deeply equal { Object (tipo, desde, ...) }` |
| E1 sin referencia nula tras activar (lee el viejo, R24) | activada no lee el viejo: sin referencia, sin marca y sin tocar  | `expected { zona: { ...(17) }, ...(3) } to be null` |
| E2 activada sigue leyendo la marca (R45) | activada no lee el viejo: sin referencia, sin marca y sin tocar  | `expected [ false, true, true, false ] to deeply equal [ false, false, false, false ]` |
| E3 no hay not_found por empresa: zona leida sin filtro (R12) | una zona de B es not_found para A, con todos sus datos | `expected { status: 'ok', grupos: [], ...(3) } to deeply equal { status: 'not_found' }` |
| E4 faltantes leen los precios de tienda (WHERE, R14) | R14: lo que juzgan los faltantes no trae precios de tienda, ni v | `expected [ [ 'satelite_rechazo', ...(2) ], ...(2) ] to deeply equal [ [ 'satelite_rechazo'` |
| E5 lista de tiendas sin filtro de rol (R41) | la pantalla de A trae sus zonas, sus tiendas, sus precios y sus  | `expected [ ...(6) ] to deeply equal [ ...(3) ]` |
| E6 precios de tienda sin WHERE (R41) | los precios de tienda son solo los que llevan tienda | `expected [ ...(2) ] to deeply equal [ Array(1) ]` |
| W1 el admin escribe valores (R55/R13) | escritura por rol: el admin no escribe, fila por fila | `expected { status: 'ok', resultados: [ ...(2) ] } to deeply equal { status: 'ok', resultad` |
| W2 el admin no lee la pantalla (R55) | el admin lee los mismos datos en solo lectura | `expected { status: 'forbidden' } to match object { status: 'ok', puedeEscribir: false }` |
| W3 otro rol lee la pantalla (R55) | 'adminTienda' recibe forbidden en la pantalla, sin leer nada | `expected { Object (status, activacion, ...) } to deeply equal { status: 'forbidden' }` |
| W4 puedeEscribir para cualquiera (R55) | el admin lee los mismos datos en solo lectura | `expected { Object (status, activacion, ...) } to match object { status: 'ok', puedeEscribi` |
| W5 el admin escribe grupos (R55) | escritura por rol: el admin recibe forbidden en las cuatro, sin  | `expected { status: 'ok', id: 'g1' } to deeply equal { status: 'forbidden' }` |
| W6 inactivo admite valor nuevo (R52) | inactivo: un valor nuevo se rechaza en vehiculoId, sin escribir | `expected { status: 'ok', ...(1) } to deeply equal { status: 'validation_error', ...(1) }` |
| W7 inactivo: reemplazar ya no vale (R52) | inactivo: reemplazar el valor que ya tiene sigue valiendo y cons | `expected { status: 'validation_error', ...(1) } to deeply equal { status: 'ok', ...(1) }` |
| W8 inactivo: el nivel exacto no cuenta, basta otro concepto (R52) | inactivo: el nivel exacto cuenta: otro concepto u otro grupo del | `expected { status: 'ok', ...(1) } to deeply equal { status: 'validation_error', ...(1) }` |
| W9 una excepcion tira el guardado (R38) | R38: una excepcin en una fila se queda en esa fila y las siguien | `expected { status: 'error' } to deeply equal { status: 'ok', resultados: [ ...(2) ] }` |
| W10 se pierde el fieldErrors de la fila (R37, R38) | R38: un concepto con error conserva los dems y dice su campo | `expected [] to deeply equal [ 'valor' ]` |
| W11 tope de cambios sin aplicar (design 7) | el tope es 200 entradas: una ms se rechaza entera | `expected 'ok' to be 'validation_error' // Object.is equality` |
| W12 mensaje de grupo con la palabra del nivel (T2.4) | un rechazo de SLT-52 R11 nombra el distrito sin la palabra del n | `expected { status: 'validation_error', ...(1) } to deeply equal { status: 'validation_erro` |
| A1 la fabrica pasa una lista vacia (R6) | SLT-54 T2.3  TarifaActivacionService recibe su repositorio real  | `expected { ...(1) } to be TarifasPantallaService{ ...(1) } // Object.is equality` |
| A2 la fabrica falla cerrado de nuevo (T2.3) | con faltantes reales pide confirmacin, con la lista leda de la b | `expected 'error' to be 'confirmacion_requerida' // Object.is equality` |
| A3 faltantesPorZona devuelve vacio aunque calcule (R6) | SLT-54 T2.3  activar por la fabrica pide confirmacion con los fa | `expected { status: 'ok', ...(1) } to deeply equal { ...(2) }` |
| A4 usa los vehiculos inactivos como exigibles (R15, en servicio) | reparte los valores por zona y solo exige los vehculos activos | `expected [ { zonaId: 'z1', ...(3) }, ...(1) ] to deeply equal [ { zonaId: 'z1', ...(3) }, ` |
| V1 crearZona acepta cobroVehiculo (R27) | crearZona con cobroVehiculo verdadero | `expected { status: 'validation_error', ...(1) } to deeply equal { status: 'validation_erro` |
| V2 crearZona acepta tarifas (R27) | crearZona con cobroVehiculo verdadero | `expected { status: 'validation_error', ...(1) } to deeply equal { status: 'validation_erro` |
| V3 actualizarZona sin guarda (R27) | actualizarZona con los dos, en falso y sin filas | `expected 2 to be +0 // Object.is equality` |
| V4 crearZona rechaza un payload sin costos (R27) | forbidden se propaga | `expected 'validation_error' to be 'forbidden' // Object.is equality` |
| V5 vuelve crearTarifa (R26) | crearTarifa no se exporta | `expected [ 'crearTarifa', ...(8) ] to not include 'crearTarifa'` |
| V6 vuelve la accion de la marca (R28) | ninguna Server Action retirada ha vuelto | `expected [ 'lib/actions/geografia.ts' ] to deeply equal []` |
| V7 una action importa TarifaService (R26) | ninguna action ni nada de `app/` importa una via de escritura ni | `expected [ [ 'lib/actions/tarifas.ts', ...(1) ] ] to deeply equal []` |
| C1 cobertura ignora el modelo (R30) | tarifa general por modelo: sin activar la de `tarifas`, activada | `expected [ Array(1) ] to deeply equal [ ...(2) ]` |
| C2 cobertura sin grupoId en el WHERE (R30) | tarifa general por modelo: sin activar la de `tarifas`, activada | `expected [ ...(3) ] to deeply equal [ ...(2) ]` |
| C3 cobertura sin tiendaId en el WHERE (R30) | tarifa general por modelo: sin activar la de `tarifas`, activada | `expected [ ...(4) ] to deeply equal [ ...(2) ]` |
| C4 cobertura sin concepto en el WHERE (R30) | tarifa general por modelo: sin activar la de `tarifas`, activada | `expected [ ...(3) ] to deeply equal [ ...(2) ]` |
| L1 pantalla fuera de la lista de lectores (T1.5) | solo leen la tabla los archivos de la lista, y todos los de la l | `expected [ ...(5) ] to deeply equal [ ...(4) ]` |
| E4b faltantes leen el valor propio del mensajero (WHERE, R14) | R14: lo que juzgan los faltantes no trae precios de tienda, ni v | `expected [ ...(3) ] to deeply equal [ [ 'satelite_rechazo', ...(2) ], ...(1) ]` |
| V8 guardar escribe en tarifas (R29) | guardar no escribe en el viejo, ni antes ni despus de activar | `expected { ...(4) } to deeply equal { ...(4) }` |
| V9 guardar pisa zona.cobro_vehiculo (R29) | guardar no escribe en el viejo, ni antes ni despus de activar | `expected { ...(4) } to deeply equal { ...(4) }` |

**Lectura por empresa, apagando la RLS tabla por tabla en la base local y leyendo como `servi_app`** (se restauró y comprobó cada una; con todas de vuelta, 27 de 27):

| Tabla | Rojos | Caso |
|---|---|---|
| `zona` | 4 | «una zona de B es not_found para A» |
| `tarifas` | 2 | «una tienda de B pedida desde A», «el repositorio, pidiendo por los ids de B» |
| `tarifa_zona_mensajero` | 1 | «el repositorio, pidiendo por los ids de B» |
| `distrito_zona_especial` | 6 | «nivel grupo: varía entre los distritos de ESE grupo» |
| `tarifa_valor` | 2 | «lo que juzgan los faltantes…» |
| `grupo_distritos` | 1 | «el repositorio, pidiendo por los ids de B» |

**Supervivientes de la primera pasada, y qué se hizo:**
- R9 (el par de zona lleva la tienda pedida): faltaba mirar el nivel zona con una tienda pedida. Test añadido.
- E4 y E6 (`WHERE` de faltantes y de precios de tienda): la primera se filtraba después en memoria y en la segunda A solo tenía un valor. Tests añadidos contra el repositorio; se sumó E4b.
- C5 (`zonaId: { not: null }` en cobertura): equivalente, lo impide el CHECK. Se quitó del código y deja de contarse.
- La RLS de `tarifas`, `tarifa_zona_mensajero` y `grupo_distritos` sobrevivía: las zonas de A ya filtraban. Test añadido que pide por los ids de B, con su control positivo desde B.

### Salida de los comandos

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .    -> exit 0, 0 errores
$ pnpm exec eslint <archivos .ts y .tsx de la tanda>                     -> exit 0, 0 errores, 2 avisos
$ pnpm run test:guardias
  Test Files  1 failed | 330 passed (331)
       Tests  4 failed | 4612 passed | 1 skipped (4617)
  (los 4 rojos: dependencias-declaradas-presentes.guardia.test.ts, en el baseline)
$ los 81 archivos que importan lo tocado, mas los rojos conocidos, en tandas de 15 (sin `vitest related`)
  total 1444 | ok 1432 | ko 12 | skip 0
  (incluye el arreglo de cobertura.composition-root, re-corrido aparte: 6 de 6 con zona-guardado-conserva-costos)
```

### Rojos fuera del baseline

Ninguno nuevo. Los 10 esperados, sobre la base local: `caja-backfill` (5), `notificacion-evento-bloqueo-cierre-migration` (1), `-gasto-fijo-migration` (1), `-webhook-suscripcion-migration` (2), `whatsapp-envios-migration` (1).

**En el baseline:** `cobertura-repository.test.ts` (2, los de la ficha 465: `referencia a otra empresa: tarifas.tienda_id -> usuario`). Los tres casos nuevos de R30 de ese archivo pasan.

**Sin correr aquí:** `vitest related`, `./init.sh` y E2E, por encargo.

## Tanda C — Huecos del lado servidor

T3.1 a T3.4 hechas. Sin migraciones ni dependencias.

### Decisiones

- **R64, `ingreso_flete_devolucion` en el nuevo.** El design pide exigir el concepto «por resultado de la gestión». En el nuevo ese movimiento suma rechazo, reprogramado, novedad e incidente (SLT-52 R29), cada uno con su concepto, y la lista `resultados` solo traía el rechazo: una orden con novedad cobrada entraba en el importe y no en el detalle. Por eso `CriterioDeAporte` gana `conceptoCongeladoPorResultado`, y la rama nueva del `WHERE` lleva una rama por resultado que ata gestión y concepto. `resultados` sigue siendo solo del viejo. La equivalencia contra `derivarIngresoOrden` en las 7680 celdas lo exige: con la lista vieja se pone roja.
- **`fulfillment` en el listado es opcional y lo retira el recorte de zona.** Es el mismo dato que `relaciones.tienda.tarifa.fulfillment`, que ya se retiraba (feature 260). Si no entra en `CAMPOS_SOLO_ALCANCE_GLOBAL` viaja a un alcance de zona por el campo nuevo. Hay un centinela propio en `tests/fixtures/orden-detalle-dia.ts`. La bodega satélite no lo recibe: lo que diga R66 para «recibidas» solo aplica al alcance global.
- **T3.4 no cambió código:** R31 y R32 ya se cumplían. La tanda deja el test con el alta real.

### Para la Tanda E

- `IngresoEmpresaDTO.tarifaModelo` e `item.fulfillment` ya están. Las columnas siguen leyendo `relaciones.tienda.tarifa.fulfillment` hasta T5.3; al cambiarlas, `recorte-por-alcance.guardia` buscará en el marcado `CENTINELAS.fulfillment` en vez de `CENTINELAS.tarifa`.

### Archivos

**Nuevos:** `tests/integration/db/cierre-aporte-modelo-nuevo.test.ts`, `tests/integration/db/tarifa-empresa-nueva.test.ts`

**Código modificado:** `lib/interfaces/services/ICierreDiaService.ts`, `lib/repositories/CierresAdminRepository.ts` (T3.1); `lib/repositories/CierreAporteRepository.ts`, `lib/utils/aporte-por-orden.ts`, `lib/utils/dinero-por-producto.ts` (T3.2); `lib/repositories/OrdenRepository.ts`, `lib/types/orden.ts`, `lib/types/recorte-alcance-orden.ts`, `lib/interfaces/services/IRecepcionSateliteService.ts` (T3.3)

**Tests con cambio de fondo:** `cierre-aporte-repository.test.ts`, `aporte-por-orden-equivalencia.test.ts`, `convergencia-tarifa-listado-cierre.test.ts`, `cierres-admin-repository.test.ts`, `tarifas-flexibles-snapshot.test.ts` (la orden sin flete sale del aporte, que es R64), `detalle-contrato.test.ts`, `recorte-por-alcance*.test.ts`, `tests/fixtures/orden-detalle-dia.ts`

**Fixtures:** 17 archivos con dobles de `IngresoEmpresaDTO` ganan `tarifaModelo`, sin otro cambio. La lista completa está en `tasks.md > Archivos esperados`.

### Mapa R → test (tanda C)

| R | Test |
|---|---|
| R62 (DTO), R63 (DTO) | `cierres-admin-repository.test.ts` › «una fila del modelo viejo dice `viejo`…», «una fila del modelo nuevo dice `nuevo`…», «R9: sin tarifa congelada…». La pantalla es la tanda E |
| R64 | `cierre-aporte-modelo-nuevo.test.ts` (Postgres, 6 casos): «una orden sin el concepto queda fuera…», «lo listado suma… lo que el feed real escribe», «los otros caminos del mismo `WHERE`», «otra tienda no ve ninguna», «R12: como `servi_app`», «en el modelo viejo no cambia nada»; `aporte-por-orden-equivalencia.test.ts` › «SLT-54 R64» (4 casos); `cierre-aporte-repository.test.ts` (forma) |
| R66 (dato) | `convergencia-tarifa-listado-cierre.test.ts` › «SLT-54 R66» (viejo, sin tarifa, porcentaje) y «el LISTADO cobra con esos mismos valores»; `recorte-por-alcance.test.ts`. Las columnas son la tanda E |
| R31 | `tarifa-empresa-nueva.test.ts` › «R31: el alta no le crea activación ni tarifas» |
| R32 | `tarifa-empresa-nueva.test.ts` › «R32, sin activar…», «R32, activada…», «un valor que no cubre el cobro…», «CONTRAPRUEBA» |

### Mutaciones

Autocomprobación: sin mutar, los seis archivos de medida dieron 104 de 104, 0 saltados. Cada mutación se aplicó, corrió y revirtió por script, y `git diff --stat -- lib` quedó igual al final. Todas las matadas son rojo por aserción, sin `TypeError` ni error de compilación.

| Mutación | Primer caso que la mató | Rojo |
|---|---|---|
| A1 `WHERE`: la rama nueva no exige el concepto (R64) | una orden sin el concepto queda fuera… | `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| A2 `WHERE`: cualquier flete vale, sin atarlo al resultado | ídem | `expected [ …(3) ] to deeply equal [ …(2) ]` |
| A3 `WHERE`: la gestión acepta cualquier resultado del concepto | ídem | `expected [ …(3) ] to deeply equal [ …(2) ]` |
| A4 `WHERE`: en el nuevo solo los `resultados` del viejo | ídem | `expected [ Array(1) ] to deeply equal [ …(2) ]` |
| A5 `WHERE`: la rama vieja pierde `tarifaId` | ídem | `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| A6 `WHERE`: la rama vieja admite la novedad (el viejo cambiaría) | en el modelo viejo no cambia nada | `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| A7 `count` con otro `where` que la lista | una orden sin el concepto queda fuera… | `expected 6 to be 1` |
| A8 conteo por cierre sin el `where` del lote | los otros caminos del mismo `WHERE` | `expected 6 to be 2` |
| S1 `satisfaceCriterio` sin la rama del nuevo | las 7680 combinaciones | `celda ingreso_flete / entregado / cobraComision=true / : expected true to be false` |
| S2 `satisfaceCriterio` no mira si está congelado | ídem | `celda ingreso_flete / entregado / cobraComision=true / : expected true to be false` |
| S3 la tabla pierde el flete de novedad | ídem | `celda ingreso_flete_devolucion / novedad / … : expected false to be true` |
| S4 la comisión se apoya en el flete | ídem | `celda ingreso_comision_cod / entregado / … : expected true to be false` |
| S5 la rama nueva también en criterios sin tarifa | los criterios sin tarifa no miran los conceptos | `expected false to be true` |
| D1 `tarifaModelo` siempre viejo en el DTO (R63) | una fila del modelo nuevo dice `nuevo` | `expected { montoCobrar: '25000.00', …(19) } to match object { tarifaModelo: 'nuevo', …(8) }` |
| D2 sin tarifa dice viejo, no `null` (R63) | R9: sin tarifa congelada | `expected 'viejo' to be null` |
| L1 fulfillment de la fila mostrada: en el nuevo, 0 (R66) | el LISTADO cobra con esos mismos valores | `expected '0.00' to be '100.00'` |
| L2 fulfillment en % sin la base del pedido (R66) | el fulfillment en porcentaje | `expected '0.00' to be '375.00'` |
| L3 fulfillment fuera del ítem (R66) | en el viejo, `fulfillment` es el de la fila | `expected undefined to be '696.40'` |
| L4 el recorte de zona deja pasar el fulfillment | no deja NINGUNO de los seis centinelas | `el centinela 9999993 sobrevivio al recorte` |
| N1 el alta crea la activación (R31) | R31: el alta no le crea activación | `expected { activacion: 1, … } to deeply equal { activacion: +0, … }` |
| N2 activada sin flete ya no da 409 (R32) | R32, activada | `expected 200 to be 409` |
| N3b la cotización sin fila no responde `sin_tarifa` (R32) | R32, sin activar | `expected 200 to be 409` |
| N3c la carga sin fila no aparta la orden (R32) | R32, sin activar | `expected 200 to be 409` |
| N4 la comisión sola deja cotizar (R32) | un valor que no cubre el cobro | `expected 200 to be 409` |
| N5 la activación no enciende el modelo nuevo (R32) | R32, activada | `expected { activacion: 1, … } to deeply equal { activacion: 1, … }` |
| RLS: `cierre_detail` apagada en la base local, leyendo como `servi_app` (R12) | R12: como `servi_app` | `expected 6 to be +0` |

**Matadas: 26 de 27.** Superviviente, y qué se hizo:
- **N3** (`fleteEntregadoSinTarifa(null)` da `false`): equivalente. Los dos llamadores que deciden el 409 ya tratan el `null` por su cuenta, así que no cambia la respuesta. Se sustituyó por N3b y N3c, que rompen la decisión donde se toma.
- **RLS en primera pasada:** apagar `cierre_detail` sola no ponía rojo el caso R12, porque la lista también pasa por la RLS de `orden`, `gestion_orden` y `cierre_detail_concepto`. Se añadió `contarOrdenesDelCierre`, que solo lee `cierre_detail`; ya está contada arriba como matada. La RLS se restauró y comprobó, tabla por tabla (`cierre_detail`, `orden`, `gestion_orden`), y el archivo volvió a 6 de 6.

### Salida de los comandos

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .   -> 0 errores
$ pnpm exec eslint <archivos .ts y .tsx de la tanda>                    -> 0 errores, 3 avisos (los `_args` de un doble ya existente)
$ pnpm run test:guardias
  Test Files  1 failed | 330 passed (331)
       Tests  4 failed | 4612 passed | 1 skipped (4617)
  (los 4 rojos: dependencias-declaradas-presentes.guardia.test.ts, en el baseline)
$ los seis archivos de medida de la tanda
  Test Files  6 passed (6)
       Tests  104 passed (104)
$ los 288 archivos que importan lo tocado, en tandas de 15 (sin `vitest related`)
  total 4049 | ok 3610 | ko 271 | skip 168
```

### Rojos fuera del baseline

Ninguno: los 271 rojos caen en 50 archivos, los 50 en `tests/baseline-rojos.json`. Son de la siembra sobre la base local: `referencia a otra empresa`, y el catálogo sin `ayuda_tienda` o `devolucion_por_confirmar`. Solo un rojo es de aserción, y compara ese mismo error de siembra (`historial-accion-atomicidad`). Los 168 saltados caen en 16 de esos archivos, cuyo arranque falla por el catálogo; ninguno en los archivos de esta tanda.

**Lo que eso deja sin medir aquí:** `detalle-movimiento-cierre-postgres` y `detalle-en-lote-464`, que prueban el `WHERE` del modelo viejo contra Postgres, están en rojo por su siembra. El viejo lo cubre aquí «en el modelo viejo no cambia nada» y la forma en `cierre-aporte-repository.test.ts`; esos dos hay que mirarlos en el `gate-completo` de CI.

**Sin correr aquí:** `vitest related`, `./init.sh` y E2E, por encargo.

## Tanda D — Pantalla

**Veredicto:** hecha. La pantalla nueva sirve `/configuracion/tarifas` con los 4 tableros de la maqueta, y la vieja salió entera. Mutaciones 42 de 42 por aserción. Lo que no se pudo ver y las diferencias con la maqueta están abajo, dichas.

### Archivos

**Nuevos**
- `app/(app)/configuracion/tarifas/_components/`: `TarifasModule`, `TarifasEstado`, `TarifasZonas`, `TarifasValores`, `TarifasVehiculo`, `TarifasGrupos`, `TarifasTiendas`, `TarifasActivarDialog`, `tarifas-textos.ts`, `tarifas-borrador.ts` (fuera de la lista original: lo puro que decide el payload; añadido a `tasks.md`)
- `tests/components/`: `TarifasModulo`, `TarifasActivar`, `TarifasValores`, `TarifasGrupos`, `TarifasTiendas`, `TarifasVehiculo`, `TarifasDisposicion`; `tests/fixtures/tarifas-pantalla.ts`

**Modificados**
- `app/(app)/configuracion/tarifas/page.tsx`, `lib/auth/menu-visibility.ts` (R56), `lib/actions/tarifas.ts` (salen los `@sin-superficie`), `app/globals.css` (salen las animaciones de `useDestinoAnimado`), comentarios de `cierre-detalle-shared.tsx` y `RegistrarPagoDialog.tsx`
- Tests: `TarifasPage` (reescrito), `menu-visibility`, `menu-historial-acciones`, `Sidebar`, `rechazo-nombre-466-app`, guardias `rechazo-nombre-466`, `estado-con-info`, `pwa-manifiesto-atajos`, `cobertura-tablas` y `censo-tablas.ts` (la tabla de tiendas se censa `fuera`, con motivo)

**Salen:** `TiendasModule`, `CrearTiendaForm`, `TarifaCampos`, `CobroVehiculoTarifas`, `tarifas-labels.ts`, `useDestinoAnimado.ts`, `tarifas-retiradas.ts`, y los tests `CrearTiendaForm`, `TarifasClaridadMontos`, `TarifasAlineacionRejilla`.

### Decisiones de pantalla, por revisar

- **Modo en la tabla por vehículo.** La maqueta `Vehiculo` no dibuja modo y R34 lo pide por concepto. Va un selector bajo el nombre del concepto, sin columna nueva (siguen 10 con 8 vehículos). Una celda guardada con otro modo lo conserva y lo dice («En %»): nada se convierte a escondidas.
- **Comisión COD nace en %,** como la maqueta. Es fijo por concepto, no sale de «Hoy rige».
- **IVA obligatorio, por fila.** La fila sin IVA no se envía y se marca; las demás se guardan.
- **Cambiar de zona o de nivel con algo sin guardar pregunta antes.** R38 pide conservar lo digitado y el spec no decía nada de esto; perderlo en silencio era peor.
- **Añadir y Editar precio de tienda usan el panel de valores,** nivel «Tienda con precio propio…»: no hay un segundo formulario. «Quitar» pide confirmación con cuántos valores caen.
- **Apagar «Pagar distinto» con valores** los quita al confirmar, sin pasar por «Guardar»: el diálogo ya dijo cuántos.
- **Nombres de grupo de otras zonas en la lista de tiendas:** `cargarPantallaTarifas` no los trae; `page.tsx` llama a `cargarZonaTarifas` solo por las zonas con precio de tienda en un grupo.
- **`admin` sin CTA a Zonas:** no puede entrar; ve el vacío con su texto.
- **Menú del `admin`:** «Tarifas» va tras «Mi plan» y antes de «Ayuda», que cierra la barra por contrato (`menu-ayuda`), no literalmente al final. Icono `settings`, ya existente.

### Mapa R → test (tanda D)

| R | Test |
|---|---|
| R8 | `TarifasModulo` › «sin desactivar» |
| R17 | `TarifasModulo` › «Completa, Faltan N, Sin empezar y M de T» |
| R18, R19 | `TarifasActivar` (casilla, sin casilla, «Completar», lista y aviso literales, `usaZona` sin aviso) |
| R6, R7 | `TarifasActivar` › «otra lista», «una casilla marcada para otra lista», «`ya_activada`» |
| R20 | `TarifasValores` › «la referencia no entra en el campo»; `TarifasVehiculo` › «una línea bajo cada campo» |
| R24 | `TarifasValores` › «sin Hoy rige» |
| R25, R55 | `tests/unit/app/tarifas/TarifasPage.test.tsx`; `TarifasModulo` › permisos; «solo lectura» en cada componente |
| R33 | `TarifasModulo` › selector de nivel; `TarifasValores` › «las filas salen del catálogo» y «un concepto nuevo» |
| R34-R36 | `TarifasValores` › guardar (payload espiado, sin `ivaPct`, vacío quita, 0 escrito, sin cambios) |
| R37, R38 | `TarifasValores` › «la carrera se pinta en su fila», «fallo entero no borra» |
| R39 | `TarifasValores` › «qué significa vacío» |
| R40 | `TarifasModulo` › «en vigor»; `TarifasValores` › toast |
| R41 | `TarifasTiendas`; `TarifasModulo` › «solo se ofrecen las cuentas que llegan» |
| R42-R46 | `TarifasGrupos` |
| R47-R51, R54 | `TarifasVehiculo` (1, 2 y 8; alta sin tocar nada; inactivo con y sin valor; apagar; catálogo vacío; `sticky`) |
| R56 | `menu-visibility` › «Tarifas para admin»; `destino-post-login` sin cambios |
| R57, R58 | `TarifasModulo` › estados de carga; `TarifasPage` › error; `TarifasValores` y `TarifasActivar` › segundo envío |
| R59, R60, R70 | `TarifasDisposicion` (clases de §12, tokens, foco opaco, sin hex) |
| R61 | `TarifasValores` › «el IVA nace vacío»; `TarifasGrupos` › etiquetas del país; `TarifasDisposicion` › sin símbolo de moneda ni IVA escrito; guardia `etiquetas-geograficas-sin-literal` |

### Mutaciones

Aplicadas, corridas y revertidas por script sobre los archivos reales; todas rojas por aserción, ninguna por `TypeError` o compilación. **Matadas: 42 de 42**, con una vuelta: A7 sobrevivió a la primera y se añadió el test «una casilla marcada para otra lista». Tras revertir, el árbol solo difería en `tasks.md`, editado aparte.

| Grupo | Mutación | Primer rojo |
|---|---|---|
| Activar | A1 confirmar habilitado sin casilla | `expect(element).toBeDisabled()` |
| | A2 confirma siempre / A3 nunca confirma | `expected "vi.fn()" to be called with…` |
| | A4 casilla sin faltantes / A5 `usaZona` cuenta | `expected <span…> to be null` |
| | A6 ignora la lista del servidor / A7 casilla sigue marcada | `Unable to find role="button"…` / `not.toBeChecked()` |
| `admin` | P1-P9 Activar, Guardar, campos, interruptor, celdas de vehículo, Crear, borrar y renombrar grupo, editar y quitar tienda, Añadir | `expected <button…> to be null` y `Found multiple…` |
| Hoy rige | H1 se copia al campo / H2 IVA prellenado / H3 sigue tras activar | `toHaveValue()`, `to be null` |
| `ivaPct` | I1 `null` / I2 `"0"` / I3 el pago usa la rama de cobro | `to not have property "ivaPct"` |
| Vacío | V1 guardado se fija en 0 / V2 sin guardar se fija en 0 / V3 el 0 no se manda / V4 sin IVA / V5 sin cambio escribe / V6 fallo borra lo digitado | `to deeply equal`, `toBeDisabled()`, `toHaveValue(700)` |
| Nivel | N1 no filtra grupo / N2 tienda en todas lleva zona | `toHaveValue(1000)`, `to match object` |
| Vehículo | W1-W7 apagar sin preguntar, otra pestaña, inactivo sin valor aparece, con valor no, celda vacía editable, sin marca, interruptor sin catálogo | `Unable to find…`, `to deeply equal`, `toBeDisabled()` |
| Grupos | G1 marca tras activar / G2 borrar sin contar los de tienda | `Found multiple…`, `Unable to find…` |
| Marco | Z1 carga vieja pisa / Z2 sin preguntar / Z3 error como vacío | `toHaveValue(333)`, `Unable to find…` |

### Comparación con la maqueta, medida

Con Playwright sobre `next build` + `next start`, en una empresa de prueba (borrada después), 1360 × 980 salvo donde se dice. Los campos son lo que da `boundingBox()`.

| Elemento | Maqueta | Medido |
|---|---|---|
| Lista de zonas | 250-280 | 250 |
| Separación lista-panel | 24 | 554 − (280 + 250) = 24 |
| Fila de zona | ≥ 58 | 60 |
| Panel | ≥ 560, misma `y` | 782, `y` 193 las dos |
| Pestañas | 3, ≥ 44 | 3, 44 |
| Filas por pestaña | 7, 5, 5 | 7, 5, 5 |
| Columnas | Concepto, Modo, Valor, IVA, Hoy rige | Las mismas 5; 4 en pago; tras activar 4 en cobro, sin «Hoy rige» |
| Orden de filas | Entregado, devolución, reprogramado, novedad, incidente, fulfillment, comisión | El mismo |
| Campo valor | 110 × 40 | 110 × 40 |
| Campo IVA | 70 × 40 | 70 × 40 |
| Selector de modo | ≥ 40 | 40 |
| Activar | ≥ 44, en la banda | 176 × 44, en la banda |
| Guardar borrador | ≥ 44, al pie | 146 × 44, al pie |
| Diálogo Activar | ≤ 640, padding 24 | 640, `24px` |
| Casilla | 20 × 20, fila ≥ 44 | 20 × 20, fila 44 |
| Tabla de tiendas | 5 columnas | 5 |
| 8 vehículos + «Todos» | 10 columnas, campo 120, sin scroll de página | 10; campo 120 × 40; contenedor 1424 > 760; página 1360 = 1360; `x` de la primera columna 565 antes y 565 tras `scrollLeft = 400` |
| 390 × 844 | Sin scroll, lista sobre panel, ≥ 44 | Página 390 = 390; lista `y` 402 < panel `y` 655; pestañas, botones, selectores y campos 44; interruptor 44. Único por debajo: «Toggle Sidebar» 28, del encabezado compartido |
| Oscuro (contraste) | ≥ 4,5 | Banda 8,77; chip de estado 7,72; «Inactivo» 7,72; zona activa 11,13 |
| Rótulos | Los de la maqueta | «Borrador: aún rigen las tarifas actuales», «Activar tarifas nuevas», «Activar con lo que falta», «Seguir digitando», «En vigor desde el 04-11-2026» |

Recorrido visto: borrador con la referencia al lado y campo vacío (`valor ""`, `iva ""`); IVA obligatorio en la fila; guardar (con IVA 13) y la zona pasa a «Faltan 2»; «Hoy rige» con «Varía: ₡2.800 a ₡3.200», «No cobra», «No paga», «₡0», «₡1.500», «3,5 % + 13 % IVA»; grupo con los distritos marcados de solo lectura (6 distritos, 2 marcas); precio de tienda en la lista; vaciar un valor y la zona a «Faltan 1»; Activar sin faltantes (0 casillas, habilitado) y con faltantes (deshabilitado, se habilita al marcar); «Completar» lleva a la zona; vehículo inactivo con valor (marca, 1800 editable, 4 celdas vacías deshabilitadas); apagar con «Se quitará 1 valor», cancelar no cambia y confirmar quita; cambios sin guardar piden confirmación; `admin` con «Tarifas» en su menú, 7 filas y 0 campos ni botones de escritura; activar de verdad y En vigor, sin banda ni «Hoy rige»; guardar en vigor con su aviso. En claro, oscuro y móvil. **`next start`: 0 errores de consola** en el recorrido principal; el segundo (inactivo, apagar, `admin`, sin faltantes) se corrió en `next dev`.

**Lo que no se vio en el navegador** (solo en tests de componente): esqueleto de carga, error de lectura con reintento, empresa sin zonas, catálogo sin vehículos, la carrera de R37, el rechazo de R42 por el servidor, «ya activada» por dos sesiones, y la tabla de 8 vehículos a 390 px (sí a 1360).

**Diferencias con la maqueta**
1. Selector de modo bajo el concepto en la tabla por vehículo (R34; la maqueta no lo dibuja).
2. La lista de zonas no enseña «N grupos» ni «Zona especial: N distritos» de una zona sin abrir: `cargarPantallaTarifas` no trae el conteo y añadirlo es backend. Enseña «Bodega principal» y, de las ya abiertas, «N grupos» o «Sin grupos». Una línea en `TarifasPantallaService` lo arregla, si se quiere.
3. Botones que el spec pide y la maqueta no dibuja: «Quitar» en tiendas (R41), «Renombrar» y «Borrar» en grupos (R42), y la línea «Hoy rige» bajo cada campo por vehículo (design §9).
4. «M de T zonas completas» también tras activar (R17 no lo limita; `Vigente` no lo dibuja).
5. La tabla de tiendas lleva el borde redondeado propio de `DataTable`; los campos muestran `2900`, sin miles, por `MontoInput` (design §2.4).

### Un hallazgo sin causa raíz

**En `next dev`, abrir `/configuracion/tarifas` por URL justo después del login da 500** («`useToast` debe usarse dentro de un `ToastProvider`», desde `LogoutButton`), y la página se recupera por render de cliente. Medido: 6 de 7 intentos en esa ruta exacta; 0 si se esperan 4 s, si se entra por el menú, con cookies en un contexto nuevo o en otras rutas (zonas, plantillas, órdenes, wallet, cierres, API). **Con `next build` + `next start`: 3 de 3 en 200 y ningún error en el log.** No encontré la causa. No es `searchParams` (descartado). Si en la Tanda F aparece un 500 en `next start`, empezar por aquí.

### Salida de los comandos

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .  -> 0 errores
$ pnpm exec eslint <archivos de la tanda>                             -> sin salida (0 errores, 0 avisos)
$ pnpm exec next build                                                -> exit 0
$ vitest: tests/components/Tarifas*, TarifasPage, rechazo-nombre-466-app, tests/unit/auth,
  Sidebar, CierresAdminModule, CierreTarifaAplicada, tarifas-action
  pass 524 | fail 0 | skip 0 | 32 archivos
$ pnpm run test:guardias
  Test Files  7 failed | 324 passed (331)
       Tests  10 failed | 4603 passed | 4 skipped (4617)
  - 4 rojos: dependencias-declaradas-presentes (baseline, como en las tandas anteriores)
  - 6 rojos: timeouts de 20 s y 60 s, con la máquina cargada, en seis archivos sin relación
$ esos seis archivos, más cobertura-tablas, pwa-manifiesto-atajos e impresion-sin-dark, a solas
  pass 87 | fail 0 | skip 0 | 9 archivos
```

**Base local:** empresa, usuarios, zonas, valores, activación y vehículos de prueba borrados; comprobación booleana `base_limpia true`. Ninguna empresa real activada. Dev server y `next start` parados, puerto libre, `.next` borrada.

**Sin correr aquí:** `vitest related`, `./init.sh`, la suite completa y E2E, por encargo.

**Proceso:** las mutaciones y una tanda de guardias acabaron en segundo plano porque superan el tiempo de un comando en primer plano; se esperó a cada una antes de seguir, sin nada en paralelo.

## Tanda E — Huecos de pantalla

T5.1, T5.2, T5.3 y el ajuste de la lista de zonas hechos. Sin migraciones ni dependencias. El único backend es el conteo de distritos del loader de Tarifas.

### Decisiones, por revisar

- **`ing.fulfillment` solo en el nuevo.** El design dice «pasan a `ing.fulfillment`». En el viejo, leerlo a secas convierte en `0.00` el `null` de un cierre anterior a la columna y de uno sin tarifa, y esa celda hoy va vacía: rompería «el viejo, igual». `fulfillmentDeIngreso` lee `ing.fulfillment` en el nuevo y la tarifa congelada en el viejo. Hay test y mutación de los dos lados.
- **`DesgloseIngresoEmpresa` gana `verFulfillment`, cerrado por defecto.** El servidor ya anula el dato (ficha 481); esto es la segunda barrera, con la misma regla que la fila de la factura.
- **Rótulos de R65.** Por gestión: «Flete por reprogramado», «Flete por novedad», «Flete por incidente», derivados de `nombreDeResultado` y iguales a las filas de Tarifas; el rechazo conserva «Flete por devolución a origen». Totales: «Flete de gestiones no entregadas + IVA» y su nota. La guardia `nombres-estado-retirados` gana una excepción por texto para ese rótulo aprobado (R65, design §11): es un grupo en negativo, no el nombre de un estado.
- **El modelo de los totales se deduce de las gestiones** (`hayGestionEnModeloNuevo`), porque `TotalesIngresoEmpresa` no lo trae. Basta una: «no entregadas» es cierto también para un rechazo del viejo, y al revés no. Un cierre de bodega decide por nivel: el agregado y cada mensajero.
- **«Recibidas» no tiene columna «Fulfillment».** Esa lista solo la abre la satélite, y el recorte de zona le retira el dato. R66 se cumple en órdenes y en monitoreo global; en recibidas y monitoreo de zona se prueba que no se monta ni se recibe. T5.3 cambió la columna compartida `ordenesColumnsDe`, de la que salen las tres.
- **Detalle de la lista de zonas.** La maqueta enseña «1 grupo» y «Zona especial: 8 distritos». R44 prohíbe tratar ese nombre aparte, así que la regla es una: un grupo con distritos se escribe «Nombre: N distritos»; varios, «N grupos»; uno vacío, «1 grupo»; ninguno, «Sin grupos». **Diferencia con la maqueta:** la fila «Alajuela · 1 grupo» se vería «<nombre del grupo>: N distritos». La zona central sigue en «Bodega principal», como la maqueta.

### Sin hacer, a decidir

1. **Encabezado de la descarga.** La columna sigue diciendo «Flete por devolución a origen + IVA» aunque la fila sea del nuevo y de una novedad. Es un encabezado por hoja, que puede mezclar cierres de los dos modelos, y cambiarlo mueve el viejo. La fila lleva su resultado al lado. El design §11 no la lista en R65.
2. **`PAGO_TIENDA_NOTA`.** La nota verde del comprobante sigue explicando solo el flete por devolución a origen. En el nuevo tampoco se descuentan los otros fletes no entregados: es incompleta, no falsa. Fuera de R65, que habla de la etiqueta.

### Archivos

**Nuevos:** `tests/components/CierreDesgloseModeloNuevo.test.tsx`, `tests/components/OrdenesColumnaFulfillment.test.tsx`

**Código:** `cierre-labels.ts`, `cierre-detalle-shared.tsx`, `cierre-factura.tsx`, `cierres-gestiones-fundida-descarga-columnas.ts`, `CascadasCierreMensajero.tsx`, `CierresAdminModule.tsx`, `CierresBodegaAdminModule.tsx` (cierres); `ordenes-columns.tsx`, comentarios de `detalle-columnas.ts` y `recibidas-columns.tsx` (columnas); `TarifasZonas.tsx`, `TarifasModule.tsx`, `tarifas-textos.ts` (zonas); `lib/repositories/TarifasPantallaRepository.ts`, `lib/services/TarifasPantallaService.ts` y sus dos interfaces (loader)

**Tests y guardias con cambio:** `tarifas-referencia.test.ts`, `tarifas-pantalla-service.test.ts`, `TarifasModulo.test.tsx`, `tests/fixtures/tarifas-pantalla.ts`, `cierres-gestiones-fundida-descarga-columnas.test.ts`, `ordenes-columns.test.tsx`, `CierreBodegaDetalleCascadas.test.tsx`, `CierreMensajeroDetalleCascadas.test.tsx`; `recorte-por-alcance.guardia.test.ts` (ya busca `CENTINELAS.fulfillment`, como avisó la tanda C), `nombres-estado-retirados.guardia.test.ts` (la excepción de arriba)

### Mapa R → test (tanda E)

| R | Test |
|---|---|
| R62 tarjeta | `CierreDesgloseModeloNuevo` › «fulfillment e IVA en su sección…», «anulado por el servidor», «un actor sin acceso…», «viejo: la tarjeta no gana la sección» |
| R62 fila y descarga | `CierreDesgloseModeloNuevo` › «la fila desplegada de la factura» (6 casos); `cierres-gestiones-fundida-descarga-columnas` › «SLT-54 (T5.2, R62)» (6 casos) |
| R63 | `CierreDesgloseModeloNuevo` › «la tarjeta del modelo nuevo» (5 casos), «el modelo viejo se ve como hoy» (2 casos, con importes literales) |
| R65 | `CierreDesgloseModeloNuevo` › «el flete que no es de entrega…», «los totales del comprobante»; `CierreBodegaDetalleCascadas` y `CierreMensajeroDetalleCascadas` › «SLT-54 R65»; guardia `flete-por-rechazo-censo` |
| R66 | `OrdenesColumnaFulfillment` (7 casos: viejo, nuevo sin fila de `tarifas`, sin tarifa, recorte, monitoreo por alcance, recibidas); `recorte-por-alcance.guardia` |
| Ajuste de zonas | `TarifasModulo` › «el detalle de la lista de zonas»; `tarifas-pantalla-service` › «cada zona lleva sus grupos»; `tarifas-referencia` (Postgres, como `servi_app`, dos empresas) › «la lista de zonas trae…», «otro rol no recibe la lista» |

### Mutaciones

Arnés con autocomprobación: sin mutar, 221 de 221. Cada mutación se aplicó, corrió y revirtió por script, con huella de cada archivo al final (`revertido true`). **Matadas: 37 de 37, todas por aserción.** F2 y F4 dieron primero `TypeError` por un cast del test: se añadió la aserción y se repitieron. El arnés leyó mal el motivo de Z3 y Z4 (cogía un log de otro test) y también se repitieron, ya con la lectura corregida. E1 se repitió tras cambiar los rótulos a `nombreDeResultado`.

| Grupo | Mutación | Primer rojo |
|---|---|---|
| Tarjeta | T1 sin la rama nueva: nota falsa | `expected <p role="note"…> to be null` |
| | T2 el total suma el fulfillment | `expected '₡900' to be '₡2.486'` |
| | T3 ignora quién lo ve / T5 por defecto lo ve | `expected <section…> to be null` |
| | T4 anulado pinta ₡0 | `expected <section…> to be null` |
| | T6 sin IVA de fulfillment / T7 fila GAM en el nuevo | `Unable to find…`, `expected <span…> to be null` |
| Factura y descarga | F1 viejo lee `ing.fulfillment` | `expected <span></span> to be null` |
| | F2 nuevo lee la tarifa / F4 no pasa la regla a la tarjeta | `expected null not to be null` |
| | F3 ignora `verFulfillment` / F5 enseña a todos | `expected <span>…`, `<section…> to be null` |
| | F6 descarga solo de la tarifa | `expected null to be '900.00'` |
| | F7 descarga, `ing.fulfillment` a secas (el viejo cambia) | `expected {…} to deeply equal {…}` |
| Columnas | C1 vuelve a la fila de `tarifas` | `toHaveTextContent()` |
| | C2 el recorte deja pasar el ítem | `to not have property "fulfillment"` |
| | C3 recibidas la monta / C4 monitoreo de zona la monta | `to include 'fulfillment'`, `expected true to be false` |
| Rótulos | E1 todo se llama devolución / E2 el viejo cambia | `Unable to find…`, `expected 'Flete por novedad + IVA' to be…` |
| | E3 nunca nuevo / E4 todo nuevo | `expected false to be true`, `expected true to be false` |
| | E5-E10 cascadas y paneles fijados, cada mensajero toma el agregado | `Unable to find an element with the text…` |
| Zonas | Z1 conteo 0 / Z2 cuenta valores | `expected [ … ] to deeply equal [ … ]` |
| | Z3 grupos de otra zona | `expected [ Array(3) ] to deeply equal []` |
| | Z4 N+1 | `expected "vi.fn()" to not be called at all, but actually been called 2` |
| | Z5 lectura abierta a otro rol | `expected {…} to deeply equal { status: 'forbidden' }` |
| | Z6-Z8 nombre, recién leído, loader | `toHaveTextContent()` |
| | RLS de `grupo_distritos` apagada dentro de la transacción revertida del test | `expected [ …(4) ] to deeply equal [ …(3) ]` |

### Lo que se vio en el navegador

`next dev`, 1360 × 1400, con un cierre real de cada modelo creado por `solicitarCierre`, y 0 errores de consola en los dos recorridos.

| Pantalla | Viejo | Nuevo |
|---|---|---|
| Tarjeta, entregado | Dos paneles, como hoy: Valor flete ₡2.800, GAM ₡0, IVA ₡364, Comisión ₡350, IVA ₡7, Total cobrado ₡3.521 | Monto ₡10.000, Flete ₡1.500, IVA ₡195, Comisión ₡200, IVA ₡26, Total cobrado ₡1.921. Sin nota, sin GAM. Fuera: Fulfillment ₡900, IVA ₡117 |
| Tarjeta, novedad | Todo ₡0, Total ₡0 | Flete por novedad ₡250, IVA ₡32,50, Total ₡282,50 |
| Tarjeta, rechazo | ₡1.400 + ₡182 = ₡1.582 | Flete por devolución a origen ₡300, IVA ₡39, Total ₡339 |
| Fila de la factura | Fulfillment ₡696,40 | Fulfillment ₡900; «Flete por novedad + IVA ₡282,50» |
| Totales y cascada | «Flete por devolución a origen + IVA» | «Flete de gestiones no entregadas + IVA» |
| `/ordenes`, Fulfillment | ₡696,40 en las 4 | ₡900 en las 4 |
| Lista de zonas | «Sin grupos» en las 2 | «Zona especial: 2 distritos» y «Sin grupos» |

La tarjeta también se vio a 390 px, sin desborde de página.

**Lo que no se vio** (solo en tests): modo oscuro (el contexto no activó la clase `dark`), la vista de `adminSatelite` y el anulado de la ficha 481, monitoreo, recibidas, el archivo descargado, el detalle de un cierre de bodega y la zona central en la lista.

### El 500 de `useToast`

**No se reprodujo: 0 de 20, y ni una mención en el log del servidor.** Con `next dev` en esta rama, entrando por `/login` e yendo a la URL en cuanto el login sale de `/login`, leyendo el estado de la respuesta: 4 en `/configuracion/tarifas` y 4 en `/configuracion/zonas` con el servidor recién arrancado; 7 en Tarifas tras volver a borrar `.next`; 5 con un precio de tienda en un grupo, por si dependía de `nombresDeGrupo`. Todos 200. Sin reproducción no se puede decir si es de la rama ni comparar con `origin/dev`, así que no se tocó y no hay test. `ToastProvider` envuelve `(app)/layout.tsx` y `LogoutButton` cuelga de él, así que por lectura no falta el proveedor. La idea de dos instancias del módulo en una compilación de `next dev` es una hipótesis sin medir. Sigue el aviso de la tanda D: si la Tanda F ve un 500 en `next start`, empezar por aquí.

### La base local: lo que quedó y un error mío

Mis dos empresas de prueba, sus usuarios y sus sesiones se borraron; la comparación por tabla con la foto previa dio `base_limpia true`. Luego la base volvió a cambiar y **al cerrar no está igual que la foto**. Ninguna empresa activada (`tarifa_activacion` 0), RLS de `grupo_distritos` en su estado original. Filas de más: `organizacion` +3, `usuario` +14, `orden` +2, `historial_accion` +18, `jobs` +3, y otras 15 tablas. Empresas nuevas: `demo-qa-a`, `demo-qa-b`, `e2e-sl43-real-…`.

**Causas, y no las pude separar:**
1. **Error mío.** Mi primer intento de la mutación de RLS pasó el filtro `-t` sin comillas por una shell. Vitest tomó las palabras como filtros de archivo y arrancó parte de la suite contra la base local, con la RLS de `grupo_distritos` **apagada de verdad** durante esos 150 s, hasta que el `timeout` lo cortó. Un segundo intento, ya con comillas, la apagó unos segundos más y su resultado no valía. La RLS se restauró las dos veces. La medida válida es la de la tabla de mutaciones, dentro de una transacción revertida.
2. **Otra corrida en la misma base.** A la vez corría un `pnpm run test:json` (suite completa) que no lancé yo, desde las 00:29, y seguía en marcha cuando apagué la RLS. **Sus resultados de ese rato no son fiables**: pudo ver un rojo o un verde falso por mi culpa.

No borré esas filas: no puedo atribuirlas, y parte pueden ser de esa otra corrida. El dev server está parado, el puerto libre y `.next` borrada.

### Salida de los comandos

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .   -> 0 errores
$ pnpm exec eslint <archivos de la tanda>                               -> 0 errores, 2 avisos (un import y un tipo sin usar, ya estaban)
$ vitest, 16 archivos de cierres, columnas y descarga
  Test Files  16 passed (16)
       Tests  335 passed (335)
$ vitest, 20 archivos de descarga, columnas, recorte, Tarifas y Postgres
  Test Files  1 failed | 19 passed (20)
       Tests  4 failed | 345 passed (349)
  (los 4: satelite-bodega-alcance-real, en el baseline: «el catalogo local no tiene el estatus ayuda_tienda»)
$ pnpm run test:guardias
  Test Files  2 failed | 329 passed (331)
       Tests  5 failed | 4611 passed | 1 skipped (4617)
  - 4 rojos: dependencias-declaradas-presentes (baseline)
  - 1 rojo: contadores-cabecera, por mi propio helper; arreglado después
$ contadores-cabecera y TarifasModulo, tras el arreglo
       Tests  26 passed (26)
```

**Sin correr aquí:** `vitest related`, `./init.sh`, la suite completa por encargo y E2E (Tanda F). La suite que arrancó por error no cuenta como medida.

## Tanda F — E2E, medición y cierre

T6.1, T6.2 y T6.4 hechas. T6.3 y T6.5 son del leader. **Veredicto:** los E2E de Tarifas y los grupos `aislamiento`, `reparto` y `dinero` en verde sobre `next build` + `next start`, con cifras a mano. R1 a R70 con test. Los E2E destaparon un defecto de esta rama, arreglado con su test, y una regresión mía, también arreglada.

**Base:** `servi_e2e_slt54`, desechable, host local comprobado, migrada y con catálogos. Borrada al terminar (`existe: false`). No se tocó la base de `.env` ni `servi_gate_slt54`, y la RLS no se apagó en ninguna parte.

### Lo que cambió fuera de los E2E

- **Defecto real, arreglado (R38).** En `TarifasValores`, al terminar un guardado, `setBorrador` tiraba todo lo que no hubiese fallado, también lo digitado mientras guardaba. Se perdía en silencio. Lo destapó el E2E al seguir digitando con el guardado en vuelo. Arreglo de una condición, con `TarifasValores` › «R38: lo digitado mientras guarda no se envió y no se pierde». Con la condición de antes, ese test cae por `toHaveValue(250)`.
- **Regresión mía, arreglada.** `sembrarEmpresa` pasó a recibir una lista de distritos, y `zonas-crear-sin-costos` seguía pasando uno. Playwright no comprueba tipos: lo vio la primera corrida de `aislamiento` (`distritosDeLaZona.map is not a function`). El spec está añadido a `tasks.md`.
- **Guardia `e2e-sin-saltos`.** `EXCEPCIONES` queda vacía y «la lista real» admite una lista vacía. `e2e/zona-especial-dos-empresas.spec.ts` no contiene ningún `fixme`.
- **Guardia `rollup-guards`.** Mi `actionTimeout: 20_000` coincidía con el umbral de R47 y la puso roja. Pasó a `30_000`. Es el único cambio posterior a las corridas de abajo, y solo da más margen.

### Decisiones, por revisar

- **R69: el spec se reescribe sobre lo que sustituye a la marca.** Desde R28 ninguna pantalla la escribe, así que no se puede repetir «marcar y reabrir». La marca se siembra por `DistritoZonaEspecialService` y el spec prueba: se ve de solo lectura y solo la propia (R45); la zona especial es un grupo con su flete, y el mismo distrito está a la vez en el grupo y con marca (R44, R46); B no ve lo de A y puede usar el mismo nombre; al activar, la marca se oculta, no se borra, y B no cambia.
- **`tarifas-activacion` va en `dinero`; `tarifas-maqueta`, en `aislamiento`.** El segundo toca el catálogo global de vehículos, a mano porque la app no tiene borrado, y lo devuelve en `afterAll`.
- **El catálogo sembrado trae 3 vehículos, no 2.** La medida «con 2» apaga uno durante ese caso.
- **Cifras animadas.** `cifraAsentada` exige dos lecturas iguales seguidas antes de afirmar. Se vio la razón: en una foto del diálogo, el KPI «Pago al mensajero» iba por ₡0,15 camino de ₡1.700.

### Sin hacer, a decidir

1. **Rótulo «Ingreso de bodega por devoluciones a origen» en el modelo nuevo.** En el nuevo, la satélite cobra por cualquier resultado (SLT-52 R32): el total congelado de un cierre con entrega y rechazo es 570, de los que 120 son de una entrega. El E2E afirma ese rótulo solo en el viejo, y no miré en pantalla qué enseña en el nuevo. R65 no lo cubre: habla del flete.
2. **A 390 px, con 8 vehículos,** la columna fija de 200 px deja unos 120 de los 320 del contenedor para desplazar. Cumple R54 y la tabla de §12; es estrecho.

### Salida de los E2E

Sobre la misma base, recreada antes de la primera corrida. Los últimos dos bloques son la segunda vuelta.

```
$ playwright test --project=aislamiento        (arrastra plataforma-vacia; 1.ª corrida)
  85 passed | 1 failed (3.3m): zonas-crear-sin-costos, la regresión mía de arriba
$ playwright test e2e/zonas-crear-sin-costos.spec.ts --project=aislamiento --no-deps
  1 passed (9.2s)
$ playwright test --project=dinero
  43 passed (1.8m) | 0 failed | 0 skipped | 0 flaky
$ playwright test e2e/tarifas-activacion.spec.ts --project=dinero   (2.ª corrida)
  8 passed (33.9s) | 0 failed | 0 skipped | 0 flaky
$ playwright test --project=reparto
  16 passed (42.6s) | 0 failed | 0 skipped | 0 flaky
$ playwright test --project=aislamiento        (2.ª corrida)
  86 passed (3.1m) | 0 failed | 0 skipped | 0 flaky
```

Por archivo, pasados/fallados:

```
dinero       ajuste-pago-mensajero-cierre 2/0; cierre-bodega-satelite 3/0; cierre-dia 2/0;
             cierre-vencido-modelo 5/0; cierres-admin-rechazos-sla 1/0; cierres-admin 3/0;
             incentivo-mensajero-slt68 4/0; mi-wallet 3/0; reglas-bloqueos-cierre 5/0;
             tarifas-activacion 8/0; wallet-mensajeros 3/0; wallet 4/0
aislamiento  superadmin-arranque 3/0; superadmin-empresas 7/0; analitica-roles 4/0; auth 12/0;
             cobro-plataforma-sl40 2/0; dos-empresas-humo 8/0; integraciones-por-empresa 4/0;
             login-varias-empresas 2/0; marca 7/0; pago-plataforma-sl45 6/0; planes-costeo 5/0;
             planes-superadmin 7/0; rastreo-publico 2/0; tarifas-maqueta 8/0;
             wallet-iva-aparte-sl39 4/0; zona-especial-dos-empresas 4/0; zonas-crear-sin-costos 1/0
reparto      asignacion-satelite 1/0; devolucion-origen 2/0; etiquetas-lote-tienda 1/0;
             historial-orden 2/0; mis-asignaciones 4/0; recepcion-satelite 1/0;
             reintentos-escalado 2/0; reprogramacion-liberacion 3/0
```

El 500 de `useToast` (tandas D y E) no apareció en `next start`: 0 menciones de `useToast` o `ToastProvider` y 0 líneas de error 500 en el log del servidor de la última corrida.

**CI:** los specs nuevos están en los proyectos `aislamiento` y `dinero`, y la matriz de `gate.yml` corre `--project=` de `aislamiento`, `reparto` y `dinero`. La guardia comprueba que cada spec está en exactamente un proyecto.

### Mutaciones de los E2E

Aplicadas a mano, corridas y revertidas; `git status` sin esos archivos al terminar. Las dos primeras no necesitan build: el cierre del E2E corre el servicio en el worker. Las otras se compilaron.

| Mutación | E2E | Primer rojo |
|---|---|---|
| `usaModeloNuevo` siempre `false`: tras activar, sigue con el viejo | `tarifas-activacion`, caso 4 | `totalPagoMensajero` 1700 en vez de 2200; `totalIngresoBodegaRechazos` 300 en vez de 570 |
| `usaModeloNuevo` siempre `true`: digitar ya rige | `tarifas-activacion`, caso 2 | `totalPagoMensajero` 2200 en vez de 1700; `totalIngresoBodegaRechazos` 570 en vez de 300 |
| `admin` ve «Guardar» | `tarifas-activacion`, R68 | `getByRole('button', /^Guardar/)`: esperado 0, recibido 1 |
| Campo valor a 90 px | `tarifas-maqueta`, 1360 claro | diferencia 20, tolerancia 2 |
| Columna de conceptos sin `sticky` | `tarifas-maqueta`, 8 vehículos | la `x` cambia 400 |
| «Inactivo» con color fijo | `tarifas-maqueta`, inactivo en oscuro | contraste 1,25; mínimo 4,5 |
| Marca visible tras activar, solo en el cliente | `zona-especial` | **Sobrevive:** es equivalente, porque el servidor ya no la manda |
| Marca visible tras activar, servidor y cliente | `zona-especial`, caso 4 | `Zona especial hoy`: esperado 0, recibido 1 |

### Medido frente a la maqueta

`e2e/tarifas-maqueta.spec.ts`, líneas `MEDIDA` de la última corrida, 1360 × 980. **Claro y oscuro dan los mismos números.** Cada fila es además una aserción, con ±2 px donde la medida es exacta.

| Elemento | Maqueta (design §12) | Medido |
|---|---|---|
| Lista de zonas, ancho | 250 a 280 | 250,2 |
| Separación lista-panel | 24 | 24 |
| Panel de valores | ≥ 560; misma `y` | 781,8; `y` 192,5 los dos |
| Fila de zona, alto | ≥ 58 | 80 |
| Pestañas | 3, alto ≥ 44 | 3, 44 |
| Filas por pestaña | 7, 5, 5 | 7, 5, 5 |
| Columnas de cobro | Concepto, Modo, Valor, IVA, Hoy rige | Las mismas 5 |
| Columnas de pago | 4 | Concepto, Modo, Valor, Hoy rige |
| Columnas tras activar | Una menos | Concepto, Modo, Valor, IVA |
| Campo valor | 110 × ≥ 40 | 110 × 40 |
| Campo IVA | 70 × ≥ 40 | 70 × 40 |
| Selector de modo, alto | ≥ 40 | 40 |
| Activar | ≥ 44, en la banda | 44; `y` 106,8 en la banda 89-168,5 |
| Guardar borrador | ≥ 44, al pie | 44; `y` 771, bajo la rejilla que acaba en 759 |
| Diálogo Activar | ≤ 640; padding 24 | 640; `24px` |
| Casilla | ≥ 20 × 20; fila ≥ 44 | 20 × 20; 44 |
| Tabla de tiendas | 5 columnas | 5 |
| Página | Sin scroll horizontal | 1360 = 1360 |

| Con vehículos | Maqueta | 2, a 1360 | 8, a 1360 | 8, a 390 |
|---|---|---|---|---|
| Columnas | 4 con 2; 10 con 8 | 4 | 10 | 10 |
| Campo | 120 × ≥ 40 | 120 × 40 | 120 × 40 | 120 × 44 |
| Contenedor, `scrollWidth` y `clientWidth` | Sin scroll con 2; desplaza con 8 | 760 y 760 | 1424 y 760 | 1424 y 320 |
| `x` de la columna de conceptos | No cambia | 565,2 y 565,2 (`scrollLeft` 0) | 565,2 y 565,2 (`scrollLeft` 400) | 35 y 35 (`scrollLeft` 400) |
| Página | Sin scroll | 1360 = 1360 | 1360 = 1360 | 390 = 390 |

| Móvil, 390 × 844 | Maqueta | Medido |
|---|---|---|
| Página | ≤ 390 | 390 = 390 |
| Lista sobre panel | `y` lista < `y` panel | 402 < 595,5 |
| Botones, pestañas y selectores del módulo | ≥ 44 | Mínimo 44, en 18 controles |
| Fila del interruptor | ≥ 44 | 44 |

| Oscuro, contraste sobre su fondo real | Mínimo | Medido |
|---|---|---|
| Título de la banda | 4,5 | 8,82 |
| Detalle de la banda | 4,5 | 8,82 |
| Chip de estado de zona | 4,5 | 5,44 |
| Marca «Inactivo» | 4,5 | 7,80 |

El contraste compone en un lienzo las capas de fondo de cada antepasado. El caso exige `[data-tema].dark`, así que no puede estar midiendo el claro. Es la primera vez que el oscuro se mide por cookie real: la tanda E no logró activarlo.

### Mapa R → test, completo

Comprobado por script contra el disco: toda fila de `tasks.md > Mapa R → test` cita archivos que existen y títulos que aparecen en ellos. **R sin test: ninguno.**

| R | Test |
|---|---|
| R1 | `tarifas-flexibles-respaldo.test.ts`, `tarifas-flexibles-snapshot.test.ts`, `tarifa-valor-lectores.guardia`; E2E `tarifas-activacion` › caso 2 |
| R2 | `tarifas-flexibles-resolver.test.ts`; E2E `tarifas-activacion` › caso 4 |
| R3 | `tarifa-activacion.test.ts` › «fijar y quitar no cambian el modelo» |
| R4 | `tarifa-activacion.test.ts` › «activación con actor e historial…» |
| R5, R6 | `tarifa-activacion-service.test.ts`; R6 también `TarifasActivar` y E2E `tarifas-activacion` › caso 3 |
| R7 | `tarifa-activacion.test.ts` › «dos activaciones simultáneas» |
| R8 | `tarifa-activacion-migration.test.ts`, `TarifasModulo` › «sin desactivar»; E2E caso 3 |
| R9 | `tarifa-activacion.test.ts` › «activar no toca…»; E2E `zona-especial` › caso 4 |
| R10 | `cierre-pago-congelado.test.ts`, `tarifas-flexibles-snapshot.test.ts` |
| R11 | `tarifa-activacion-migration.test.ts` › «relleno y bajada» |
| R12 | `tarifa-activacion.test.ts` › «activar A no cambia B»; `tarifas-referencia.test.ts`; E2E `tarifas-activacion` › R68 |
| R13-R16 | `faltantes.test.ts` |
| R17 | `faltantes.test.ts`, `TarifasModulo`; E2E caso 1 |
| R18, R19 | `TarifasActivar`; E2E caso 3 |
| R20 | `TarifasValores` › «la referencia no entra en el campo»; E2E caso 1 |
| R21-R23 | `referencia-vigente.test.ts`, `tarifas-referencia.test.ts`; E2E caso 1 |
| R24 | `tarifas-referencia.test.ts` › «activada no lee el viejo», `TarifasValores`; E2E caso 3 |
| R25 | `TarifasPage.test.tsx` |
| R26 | `tarifas-action.test.ts`, `tarifas-sin-escritura-vieja.guardia` |
| R27 | `zonas-action.test.ts` › «la action rechaza costos» |
| R28 | `superficie-de-uso.guardia`, `tarifas-sin-escritura-vieja.guardia`; E2E `zona-especial` › caso 1 |
| R29 | `tarifa-activacion.test.ts` › «guardar no escribe en el viejo» |
| R30 | `cobertura-repository.test.ts` |
| R31, R32 | `tarifa-empresa-nueva.test.ts` |
| R33-R36 | `TarifasValores`; R36 también `tarifas-action.test.ts` |
| R37 | `TarifasValores` › «la carrera se pinta en su fila»; `tarifas-action.test.ts` |
| R38 | `TarifasValores` › «la carrera…», «un fallo del guardado entero…», «lo digitado mientras guarda…» |
| R39 | `TarifasValores` › «qué significa vacío» |
| R40 | `TarifasModulo` › «en vigor»; E2E casos 3 y 5 |
| R41 | `TarifasTiendas`; E2E `tarifas-maqueta` (alta por pantalla) |
| R42, R43 | `TarifasGrupos`, `tarifas-action.test.ts`; R42 también E2E `zona-especial` |
| R44 | `TarifasGrupos`; E2E `zona-especial` › caso 2 |
| R45 | `TarifasGrupos`, `tarifas-referencia.test.ts`; E2E `zona-especial` › casos 1 y 4 |
| R46 | `tarifas-referencia.test.ts` › «marca y grupo por separado»; E2E `zona-especial` › caso 2 |
| R47, R49, R50 | `TarifasVehiculo` |
| R48 | `TarifasVehiculo`, `tarifas-referencia.test.ts` › «un vehículo dado de alta aparece» |
| R51 | `TarifasVehiculo`; E2E `tarifas-maqueta` › inactivo |
| R52 | `tarifa-valor-service.test.ts`, `tarifas-flexibles-escritura.test.ts` |
| R53 | `tarifas-flexibles-resolver.test.ts` |
| R54 | `tarifas-maqueta` › «8 vehículos», a 1360 y 390 |
| R55 | `TarifasPage.test.tsx`, `tarifas-pantalla-service.test.ts`; E2E `tarifas-activacion` › R68 y «otro rol» |
| R56 | `menu-visibility.test.ts`, `destino-post-login.test.ts` |
| R57, R58 | `TarifasModulo`, `TarifasPage.test.tsx`; R58 también `TarifasValores` y `TarifasActivar` |
| R59, R60 | `tarifas-maqueta`, `TarifasDisposicion` |
| R61 | `TarifasDisposicion`, `TarifasValores` › «el IVA nace vacío», `TarifasModulo` › «R61: el nivel lo nombra el país», `etiquetas-geograficas-sin-literal.guardia` |
| R62, R63, R65 | `CierreDesgloseModeloNuevo`, `cierres-admin-repository.test.ts`, `cierres-gestiones-fundida-descarga-columnas.test.ts`; R63 también E2E caso 4; R65 también `CierreBodegaDetalleCascadas` y `CierreMensajeroDetalleCascadas` |
| R64 | `cierre-aporte-modelo-nuevo.test.ts`, `aporte-por-orden-equivalencia.test.ts` |
| R66 | `convergencia-tarifa-listado-cierre.test.ts`, `OrdenesColumnaFulfillment` |
| R67 | `tarifas-activacion` › «digitar, activar y cierre», casos 1 a 5 |
| R68 | `tarifas-activacion` › «dos empresas y permisos» |
| R69 | `zona-especial-dos-empresas`, casos 1 a 4; `e2e-sin-saltos.guardia` |
| R70 | `tarifas-maqueta`, `TarifasDisposicion` |
| R71 (Tanda G) | `CierreIngresoBodegaModeloNuevo`, `CierreBodegaDetalleCascadas` › «R71»; E2E `tarifas-activacion` › «el siguiente cierre» |
| R72 (Tanda G) | `cierres-gestiones-fundida-descarga-columnas` › «SLT-54 (R72)» |

### Lo que no se vio

Sigue solo en tests de componente: esqueleto de carga, error de lectura con reintento, empresa sin zonas, catálogo sin vehículos, la carrera de R37, el rechazo de R42 por el servidor, «ya activada» por dos sesiones. El detalle del cierre se recorrió como `adminSatelite`; el fulfillment de R62 solo lo ve la central, y en E2E no se afirma.

### Archivos

**Nuevos:** `e2e/tarifas-activacion.spec.ts`, `e2e/tarifas-maqueta.spec.ts`, `e2e/_tarifas-activacion-fixture.ts`

**Modificados:** `e2e/zona-especial-dos-empresas.spec.ts`, `e2e/_zona-especial-fixture.ts`, `e2e/zonas-crear-sin-costos.spec.ts`, `playwright.config.ts`, `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`, `app/(app)/configuracion/tarifas/_components/TarifasValores.tsx`, `tests/components/TarifasValores.test.tsx`, `docs/architecture.md`, `specs/SLT-54-pantalla-tarifas/tasks.md`, esta bitácora

### Salida de los comandos

Sin `./init.sh` ni la suite completa, por encargo.

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck   -> exit 0, 0 errores
$ pnpm exec eslint <archivos de la tanda>                     -> exit 0, sin salida
$ pnpm run test:guardias          (árbol final)
  Test Files  1 failed | 330 passed (331)
       Tests  4 failed | 4612 passed | 1 skipped (4617)
  - 4 rojos: dependencias-declaradas-presentes (baseline, como en las tandas anteriores)
$ vitest tests/unit/guards/e2e-sin-saltos.guardia.test.ts tests/unit/analytics/rollup-guards.test.ts
  Test Files  2 passed (2)
       Tests  59 passed (59)
$ vitest tests/components/TarifasValores.test.tsx
       Tests  27 passed (27)
```

## Tanda G — Arreglos de la revisión F2.2

**Veredicto:** M1 arreglado en el detalle del cierre, con un hueco abierto que exige dato del servidor (abajo). M2 y M3, arreglados. El modelo viejo queda fijado con tests literales.

### M1, R71

En un detalle con alguna gestión del nuevo: «Ingreso de bodega» en la tarjeta, su región, el par de abajo y las cascadas; sin las sublíneas de origen; la fila enseña el importe de satélite con cualquier resultado distinto de 0 (120 + 450 = 570). Las notas que repetían la misma falsedad también siguen al modelo: neto de la empresa, desglose por tienda y lo que gana la satélite. El distintivo Automático/Manual de la fila de un rechazo se queda: ahí sigue siendo cierto. Modelo por gestión en la fila, y «basta una» en el total, igual que R65.

**Sin arreglar, exige backend: la tarjeta del listado (`cierre-factura.tsx`, `HojaResumen`) y el total y las tarjetas de la consolidación (`ConsolidacionBodegaModule`, `CierreConsolidableFacturaResumen`) siguen diciendo «por devoluciones a origen» en una empresa activada.** Sus DTO (`CierreAdminResumen`, `CierreBodegaResumenLite`) no traen el modelo, y la única lectura de la activación es `cargarPantallaTarifas`, que `adminSatelite` no puede llamar. Hace falta un campo aditivo en esos DTO. Queda escrito como abierto en R71. El importe es correcto; lo falso es el rótulo. La tarjeta del cierre de bodega ya dice «Gana la bodega satélite»: esa no miente.

### M2, R72

`ESPECIFICAS_EXTRA_MODELO_NUEVO` añade por resultado lo que el nuevo cobra y paga, encima de `ESPECIFICAS_POR_RESULTADO`, que no se toca. Filas del viejo y sin modelo congelado, iguales celda por celda (test literal con la tabla de la revisión). Comentario del incidente corregido.

**Menor 1, sin hacer:** el encabezado «Flete por devolución a origen + IVA» sigue igual. Es de catálogo, se elige antes de leer las filas y no varía por fila; uno veraz para ambos cambiaría el archivo del viejo, y eso está prohibido. La fila lleva su resultado al lado.

### M3, R61

`grupoUnicoDeZona` recibe singular y plural de `useEtiquetasGeograficas`. La guardia gana un bloque para el conteo («8 distritos»), limitado a Tarifas. **Fuera de esta ficha, el mismo defecto:** `ZonasModule.tsx:250` y `GeografiaSelector.tsx:266` escriben «N distrito(s)» a mano; por eso el bloque no barre todo `app/`.

### Menores

- **2, hecho:** `PAGO_TIENDA_NOTA_MODELO_NUEVO`, solo en el nuevo. Va en `cierre-labels.ts`, en singular: la guardia `nombres-estado-retirados` declara exactamente un plural «entregadas» y es el del rótulo aprobado.
- **6, sin hacer:** el movimiento de wallet no sabe su modelo. `CATEGORIA_LABEL` es un mapa por categoría y ningún DTO de wallet trae `tarifaModelo`. Exige backend. `wallet-rotulos.ts` no se tocó.
- **7 y 8, hechos:** nota junto a R66; `preciosTienda` y `tiendaId` en design §7.
- **3 y 4:** D36 y D37 en `progress/deudas.md`.
- R71 y R72 en `requirements.md`, marcados pendientes del visto bueno de Carlos; filas en `tasks.md` y arriba.

### Fuera de lo pedido, y necesario

`TarifasModulo` › «R33, R41: al elegir la tienda» salía rojo sin carga en la máquina, también con los archivos de Tarifas revertidos a `8b922a10` (3 de 3): no es de esta tanda. El popup del selector se abre un instante después del clic y el test lo leía en seguida; bajo carga pasaba. Se espera con `findAllByRole`: 6 de 6 tras el cambio, y la lógica no cambia. Puede haber el mismo patrón en `TarifasValores.test.tsx:135`, que no falló en estas corridas y no se tocó.

### Mutaciones

Script `g-mut.cjs`: antes corre los 5 archivos sin mutar y aborta si no hay tests o hay fallos (`BASE total 124, fail 0`); restaura cada archivo en `finally`. Sobre el árbol final. **22 de 22 matadas, por aserción, con tests ejecutados en cada una.**

| Id | Mutación | Rojo | Primer test |
|---|---|---|---|
| M1a, M1b | Rótulo siempre viejo; siempre nuevo | 5 y 3 de 17 | «la tarjeta y el par…»; «tarjeta, región, par y sublíneas, literales» |
| M1c, M1d | Sublíneas en el nuevo; fuera también en el viejo | 2 y 1 de 17 | «sin las sublíneas…»; «…literales» |
| M1e, M1f, M1g, M1h | La fila: solo en rechazo; también en el viejo; al mensajero; pinta el 0 | 4, 1, 1, 1 de 17 | «las filas enseñan 120 y 450…»; «otro resultado…»; «el mensajero…»; «un resultado en 0…» |
| M1i, M1j, M1k, M1l | Cascada con rótulo viejo; notas de neto, desglose y satélite fijas | 1 de 17 (M1l: 1 de 24) | Sus casos |
| Men2, Men2b | Nota del pago a la tienda siempre vieja; siempre nueva | 1 de 17 | Sus casos |
| M2a, M2b | Extras nunca; también en el viejo | 5 y 6 de 55 | «nuevo, entregado…»; «la fila de una REPROGRAMADA…» |
| M2c, M2d, M2e | Sin pago en incidente; sin flete en reprogramado; sin ingreso en entrega | 2 de 55 cada una | Su fila y «las columnas del nuevo suman…» |
| M3a, M3b, M3c | Plural a mano; cruzados; conteo a mano | 1 y 3 de 22; 1 de 6 | «R61…»; «sale del loader…»; «el barrido…» |

### E2E

`servi_e2e_slt54`, host local comprobado, recreada, migrada y con catálogos, sobre `next build` + `next start` del código final, con `actionTimeout` en 30 s. Borrada al terminar (`existe: false`). No se tocó la base de `.env`; ninguna URL impresa.

```
$ playwright test --project=dinero
  43 passed (2.4m) | 0 failed | 0 skipped | 0 flaky
$ playwright test --project=aislamiento        (arrastra plataforma-vacia)
  86 passed (3.0m) | 0 failed | 0 skipped | 0 flaky
```

`tarifas-activacion` afirma en pantalla «Ingreso de bodega» sobre 570, las filas 120 y 450, sin el rótulo viejo ni las sublíneas; y el cierre de antes de activar con su rótulo, 300 y sublíneas. 0 menciones de `useToast` o `ToastProvider` en el log del servidor. Tras el E2E solo cambió `TarifasModulo.test.tsx`, que no compila en la app.

### Archivos

**Nuevo:** `tests/components/CierreIngresoBodegaModeloNuevo.test.tsx`

**Modificados:** `app/(app)/cierres-admin/_components/`: `CascadasCierreMensajero.tsx`, `CierresBodegaAdminModule.tsx`, `DesglosePorTienda.tsx`, `cierre-detalle-shared.tsx`, `cierre-factura.tsx`, `cierre-labels.ts`, `cierres-gestiones-fundida-descarga-columnas.ts`; `app/(app)/configuracion/tarifas/_components/`: `TarifasZonas.tsx`, `tarifas-textos.ts`; `e2e/tarifas-activacion.spec.ts`; `tests/components/CierreBodegaDetalleCascadas.test.tsx`, `tests/components/TarifasModulo.test.tsx`; `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`; `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`; `specs/SLT-54-pantalla-tarifas/requirements.md`, `design.md`, `tasks.md`; `progress/deudas.md`; esta bitácora

### Salida de los comandos

Sin `./init.sh` ni la suite completa, por encargo. El grafo no tiene proyecto para este worktree: Grep y Read.

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck   -> exit 0
$ pnpm exec eslint <archivos de la tanda>                     -> exit 0, sin salida
$ vitest tests/components/{Cierre,Cierres,DineroIdentidadesEnPantalla,Tarifas,descarga,textos-estado-455} tests/unit/descarga
  Test Files  117 passed (117)
       Tests  1564 passed (1564)
$ pnpm run test:guardias
  Test Files  1 failed | 330 passed (331)
       Tests  4 failed | 4614 passed | 1 skipped (4619)
  - 4 rojos: dependencias-declaradas-presentes (baseline)
```

## Tanda H1 — El modelo de tarifa en los DTO (backend)

**Veredicto:** los tres DTO y el total de la consolidación ya dicen si incluyen el modelo nuevo, y wallet también. Sin esquema, sin migraciones, sin tocar importes ni UI. Falta conectarlo en pantalla (`frontend_dev`).

### Campos

Todos son aditivos y salen de `cierre_detail.tarifa_modelo`, lo congelado al solicitar; ninguno lee `tarifa_activacion`. Mixto cuenta como incluye nuevo. Ausente se lee como viejo.

| Campo | Superficie | DTO | Archivo del DTO | Dónde se calcula |
|---|---|---|---|---|
| `incluyeModeloNuevo?: boolean` | Tarjeta del listado (`cierre-factura.tsx:1040`) | `CierreAdminResumen` | `lib/interfaces/services/ICierresAdminService.ts` | Conteo filtrado en `CIERRE_RESUMEN_SELECT`, `CierresAdminRepository.ts` |
| `incluyeModeloNuevo?: boolean` | Tarjeta de la consolidación | `CierreBodegaResumenLite` | `lib/interfaces/services/ICierreBodegaService.ts` | Conteo filtrado en `CONSOLIDABLE_SELECT`, `CierreBodegaRepository.ts` |
| `incluyeModeloNuevoAgregado: boolean` | Total de la consolidación | `ListarConsolidacionServiceResult`, rama `ok` | `lib/interfaces/services/ICierreBodegaService.ts` | `some` sobre el conjunto completo, `CierreBodegaService.listarConsolidacion`. La página no lo recorta (mismo criterio que R49) |
| `incluyeModeloNuevo?: boolean` | Libro de la caja (`wallet-rotulos.ts:32`) | `WalletMovimientoDTO` | `lib/types/wallet.ts` | Lote `cierresConModeloNuevo`, `WalletMovimientoRepository.ts` |

Las filas de repositorio `CierreAdminResumenRow` y `CierreDiaConsolidableRow` llevan el mismo campo. La lógica compartida está en `lib/repositories/_shared/detalle-modelo-nuevo.ts`.

### Wallet: hecho, con un límite

Se deduce sin migración. El cobro del cierre se asienta con origen `cierre_dia` y `origen_id` = el cierre (`WalletFeedService.ts:101`). `listar` hace una sola consulta por lectura sobre los cierres de la página, y ninguna si la página no tiene filas de un cierre. Pasan por ahí el libro, su descarga y el detalle de una fila de la composición. `obtenerPorId` también lo trae, porque R31 de la 231 exige que diga lo mismo que el listado.

- **Solo el cobro que nace de un cierre.** Un movimiento con origen `gestion_orden` sale `false`, incluso en una empresa activada. Son los cobros por rechazo de tienda, donde el rótulo «devolución a origen» es cierto.
- **`obtenerPorClave` y `obtenerPorOrigen` no lo traen.** Son caminos de escritura y no pintan el rótulo.
- **Abierto, fuera de este encargo:** el libro de la tienda repite la misma frase en `desglose-tienda-labels.ts:47` y `:50`, y `WalletTiendaMovimientoDTO` no trae el campo. El DTO encargado era el de `wallet-rotulos.ts`. Se resolvería igual; hace falta decidir si entra.
- **`ComposicionGananciaCard`** rotula por categoría sobre agregados, sin fila: este campo no le alcanza. Queda para la decisión del rótulo en la tanda de frontend.

### Para `frontend_dev`

- `CierreFacturaResumen` → `cierre.incluyeModeloNuevo === true` hacia `HojaResumen`.
- `CierreConsolidableFacturaResumen` → igual.
- `ConsolidacionBodegaModule` necesita una prop nueva; `page.tsx:153` tiene a mano `consolidacion.incluyeModeloNuevoAgregado`.
- El `ariaLabel` de `ConsolidacionBodegaModule.tsx:363` repite la frase.
- `CierreBodegaFacturaResumen` no lo necesita: dice «Gana la bodega satélite». `CierreFacturaResumenPropio` tampoco: el mensajero no ve esa línea.

### Decisiones

- **Opcional en el tipo, salvo el agregado.** Hacerlo obligatorio tocaba decenas de fixtures de test. Sigue el patrón de `reprogramadasRetenidasHoy?`. El compilador no obliga a poblarlo: lo obligan las mutaciones F1, F3 y F6.
- **`_count` filtrado y no una consulta aparte.** Medido con el espía de SQL: tres cierres, una sentencia que toca `cierre_detail`.
- **`aPagina` es una función suelta, no un método.** R47 de la 173 fija la lista cerrada de métodos del repositorio.
- **Guardia `caja-173-alcance`, tocada a propósito:** declara el módulo nuevo y añade `cierreDetail` al cliente. No es un libro y no suma; las reglas de la guardia siguen en pie y pasa en verde. Conviene que el reviewer lo mire.
- **Cruce de empresas por detalle:** quise sembrar un detalle de B colgado de un cierre de A y lo rechaza el trigger de la base («referencia a otra empresa»). El cruce que sí es sembrable es un movimiento de A con `origen_id` del cierre de B, porque ese campo no tiene FK. Ese lo para la RLS, y la contraprueba como dueño de las tablas sí lo ve.

### Archivos

**Nuevos:** `lib/repositories/_shared/detalle-modelo-nuevo.ts`, `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`

**Modificados:** `lib/interfaces/repositories/ICierreBodegaRepository.ts`, `lib/interfaces/repositories/ICierresAdminRepository.ts`, `lib/interfaces/services/ICierreBodegaService.ts`, `lib/interfaces/services/ICierresAdminService.ts`, `lib/repositories/CierreBodegaRepository.ts`, `lib/repositories/CierresAdminRepository.ts`, `lib/repositories/WalletMovimientoRepository.ts`, `lib/services/CierreBodegaService.ts`, `lib/services/CierresAdminService.ts`, `lib/types/wallet.ts`; fixtures y literales en `tests/components/descarga/CierresDescarga.test.tsx`, `tests/components/descarga/CierresDescargaColumnas.test.tsx`, `tests/unit/guards/caja-173-alcance.guardia.test.ts`, `tests/unit/repositories/cierre-bodega-repository.test.ts`, `tests/unit/repositories/cierre-pagos-lectura.test.ts`, `tests/unit/repositories/cierres-admin-repository.test.ts`, `tests/unit/repositories/wallet-movimiento-repository.test.ts`; `specs/SLT-54-pantalla-tarifas/tasks.md`; esta bitácora

### Mapa R → test (tanda H1)

Todo en `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`, 9 casos sobre `servi_gate_slt54`, leídos como `servi_app`.

| Caso del encargo | Test |
|---|---|
| R71, solo viejo → falso | «solo viejo: falso…»; «un cierre sin ninguna fila de detalle…» |
| R71, solo nuevo → verdadero | «solo nuevo: verdadero…» |
| R71, mixto → verdadero | «mixto dentro de un cierre»; «mixto entre cierres» |
| R71, activada con cierre anterior → falso | «empresa activada…», con la solicitud real antes y después de activar |
| R71, otra empresa no contamina | «otra empresa no contamina…» |
| Menor 6, wallet | Los mismos casos, por las dos ramas de `listar`; «solo un movimiento con origen `cierre_dia`…» |
| Sin N+1 | «tres cierres cuestan una sentencia…» |

### Mutaciones

Script `h1-mut.cjs` en el scratchpad: corre primero la base y aborta si no hay tests, hay rojos o hay saltos (`BASE total 9, fail 0, skip 0`). Restaura cada archivo en `finally`. **14 de 14 matadas, todas por aserción, con los 9 casos ejecutados en cada una.** Final: 0 rojos de 9.

| Id | Mutación | Rojos de 9 |
|---|---|---|
| F1 | Tarjeta: el repositorio siempre `false` | 6 |
| F2 | Tarjeta: el servicio no lo pasa | 7 |
| F3 | Consolidable: el repositorio siempre `false` | 6 |
| F4 | Agregado: `every` en vez de `some` | 2 |
| F5 | Agregado: siempre `false` | 5 |
| F6 | Wallet: siempre `false` | 6 |
| F7 | Wallet: sin mirar `origen_tipo` | 1 |
| F8 | Wallet: `obtenerPorId` sin el modelo | 1 |
| S1, S2 | Conteo sin `WHERE`; conteo del viejo | 4 y 6 |
| S3 | Umbral `> 1` | 6 |
| S4, S5 | Lote sin filtro de modelo; lote del viejo | 4 y 6 |
| S6 | Una consulta por fila en el libro | 1 («esperado 1, medido 3») |

### Salida de los comandos

Sin `./init.sh` ni la suite completa. El grafo no tiene proyecto para este worktree: Grep y Read.

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck        -> exit 0
$ pnpm exec eslint <archivos de la tanda>                          -> exit 0, sin salida
$ vitest tests/integration/db/cierre-incluye-modelo-nuevo.test.ts tests/unit/repositories/cierre-pagos-lectura.test.ts
  total 23 | passed 23 | failed 0 | skipped 0
$ vitest related --run <6 archivos de lib>                         (DATABASE_URL = servi_gate_slt54)
  total 6034 | passed 5208 | failed 89 | skipped 737 | archivos 495
  - 135 archivos con rojos o sin arrancar: todos en tests/baseline-rojos.json; 0 fuera
$ pnpm run test:guardias
  total 4619 | passed 4614 | failed 4 | skipped 1 | archivos 331
  - 4 rojos: dependencias-declaradas-presentes (baseline)
```

Los rojos del related son de integración, en su mayoría por una siembra que necesita datos que esta base no tiene («la tabla `usuario` está vacía»). El related se corrió antes de quitar una línea sobrante de un fixture de `cierre-pagos-lectura`, que se volvió a correr aparte. No comparé esos rojos uno a uno contra la rama base: el criterio es el baseline, por archivo, y por archivo el baseline no distingue un rojo nuevo dentro de un archivo que ya estaba rojo.

## Tanda H2 — Conectar el modelo en pantalla (frontend)

**Veredicto:** la tarjeta del listado, la tarjeta y el total de la consolidación y el libro de la caja ya siguen el modelo del cierre. El viejo, falso o ausente, no cambia ni un texto. Sin tocar backend, esquema ni importes.

### Superficies

| Superficie | Con el campo verdadero | Dato |
|---|---|---|
| Tarjeta del listado (`CierreFacturaResumen`) | «Ingreso de bodega» | `cierre.incluyeModeloNuevo` |
| Tarjeta de la consolidación (`CierreConsolidableFacturaResumen`) | «Ingreso de bodega» | `cierre.incluyeModeloNuevo` |
| Total de la consolidación, rótulo y región | «Ingreso de bodega», «Ingreso de bodega a consolidar» | `incluyeModeloNuevoAgregado`, prop nueva desde `page.tsx` |
| Libro de la caja: celda, nombre del desplegable, detalle de la fila, descarga y panel de la composición | «Flete de gestiones no entregadas cobrado a la tienda», «IVA del flete de gestiones no entregadas cobrado a la tienda» | `m.incluyeModeloNuevo`, por `conceptoDeMovimientoCaja` |

Las tarjetas no pintaban sublíneas de origen, ni antes ni ahora: el test afirma que siguen sin salir.

### Decisiones, por revisar

- **El IVA también.** El encargo citaba `wallet-rotulos.ts:32`. La línea 35 repite la frase sobre el mismo cobro: dejarla habría enseñado flete nuevo con IVA viejo en el mismo cierre.
- **`CATEGORIA_LABEL` no cambia.** Es el nombre de la categoría, y lo leen el filtro y `WalletEgresoService`. Lo nuevo es una función por fila encima de él.
- **`incluyeModeloNuevoAgregado` es obligatoria en la prop.** Así el compilador no deja a la página sin pasarla; un campo opcional habría fallado en silencio. Costó una línea en 5 fixtures de test. Las dos tarjetas, en cambio, leen un campo opcional: ahí lo vigilan las mutaciones T3 y T4 y el E2E.
- **Texto literal en `lib/`.** `FLETE_NO_ENTREGADAS_LABEL` vive en `app/`, y `lib/` no lee de ahí. La frase queda repetida a mano y atada por el test literal.
- **Guardia `nombres-estado-retirados`, tocada a propósito.** Declara «entregadas» dos veces en `wallet-rotulos.ts`, con el mismo motivo que la excepción de R65. Conviene que el reviewer lo mire.

### Abierto, sin tocar

- **D38:** el libro de la tienda repite la frase (`desglose-tienda-labels.ts:47,50`) y su DTO no trae el campo.
- **D39:** `ComposicionGananciaCard` rotula por categoría, sin fila. **Añadido por mí a D39:** el filtro por concepto de `LibroCajaBarra` tiene el mismo límite. Elegir «Flete por devolución a origen…» en el filtro devuelve también filas que ahora se llaman «Flete de gestiones no entregadas…». No lo pedía el encargo; lo encontré al recorrer los lectores de `CATEGORIA_LABEL`.
- El encabezado de las descargas de cierres sigue siendo de catálogo, como el menor 1 de la Tanda G.

### Archivos

**Nuevos:** `tests/components/CierreIngresoBodegaTarjetaListado.test.tsx`, `tests/components/WalletConceptoModeloNuevo.test.tsx`

**Modificados:** `app/(app)/cierres-admin/_components/`: `ConsolidacionBodegaModule.tsx`, `cierre-factura.tsx`; `app/(app)/cierres-admin/page.tsx`; `app/(app)/wallet/_components/`: `DetalleFilaComposicion.tsx`, `VerMovimientoCaja.tsx`, `WalletLedger.tsx`, `libro-caja-kardex.ts`, `wallet-labels.ts`; `lib/constants/wallet-rotulos.ts`; `e2e/tarifas-activacion.spec.ts`; `tests/components/DetalleFilaComposicion.test.tsx`; la prop en `tests/components/ConsolidacionBodegaRefresco.test.tsx`, `tests/components/descarga/CierresDescarga.test.tsx`, `tests/components/descarga/CierresDescargaColumnas.test.tsx`, `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`, `tests/components/paginacion/ColasPaginacion.test.tsx`; `tests/unit/guards/nombres-estado-retirados.guardia.test.ts`; `specs/SLT-54-pantalla-tarifas/requirements.md`, `tasks.md`; `progress/deudas.md`; esta bitácora

`lib/constants/wallet-rotulos.ts` está en `lib/`, pero es un diccionario de rótulos, sin lógica de servidor: el encargo lo pedía. No cambia ningún servicio ni repositorio.

### Mapa R → test (tanda H2)

| Caso | Test |
|---|---|
| R71, tarjeta del listado: nuevo, mixto, viejo (falso y ausente) | `CierreIngresoBodegaTarjetaListado` › «R71 — la tarjeta del listado» |
| R71, tarjeta de la consolidación: nuevo, viejo (falso y ausente) | `CierreIngresoBodegaTarjetaListado` › «R71 — la tarjeta de la consolidación» |
| R71, total de la consolidación: nuevo, mixto, viejo, sin derivar de la página | `CierreIngresoBodegaTarjetaListado` › «R71 — el total de la consolidación» |
| Menor 6, rótulo: nuevo, viejo (falso y ausente), solo cambian dos categorías | `WalletConceptoModeloNuevo` › «el rótulo de una fila» |
| Menor 6, libro: nuevo, mixto, viejo, cobro por rechazo | `WalletConceptoModeloNuevo` › «el libro de la caja» |
| Menor 6, detalle y descarga | `WalletConceptoModeloNuevo` › «el detalle de la fila y la descarga…» |
| Menor 6, panel de la composición, escritorio y móvil | `DetalleFilaComposicion` › «SLT-54…» |
| R71, en pantalla | `e2e/tarifas-activacion.spec.ts` › «el siguiente cierre cobra y paga con lo digitado, y el anterior no cambia» |

El literal del viejo va en cada superficie. El dato de un cierre mixto lo calcula el servidor y lo mide `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`; en componente, «mixto» es la lista con cierres de los dos lados y el total con la página solo vieja.

### Mutaciones

Script `h2-mut.cjs` en el scratchpad: corre primero la base y aborta si no hay tests, hay rojos o hay saltos; restaura cada archivo en `finally`. **18 de 18 matadas, todas por aserción, con tests ejecutados en cada una.** La primera pasada dio 17 de 18: sobrevivió W10, porque el panel móvil no tenía test del campo. Añadí el caso y W10 cae (`BASE total 50, fail 0, skip 0`; 25 ejecutados, 1 rojo). Las otras 17 corrieron antes de añadirlo, sobre `BASE total 49, fail 0, skip 0`.

| Id | Mutación | Ejecutados | Rojos |
|---|---|---|---|
| T1, T2 | Tarjeta: rótulo siempre viejo; siempre nuevo | 11 | 4 y 6 |
| T3, T4 | La tarjeta del listado; la de la consolidación, sin pasar el campo | 11 | 2 y 2 |
| C1, C2 | Total: rótulo; región, siempre viejos | 11 | 1 y 3 |
| C3 | Total derivado de la página | 11 | 1 |
| L1 | Cambia el literal del viejo | 11 | 7 |
| W1, W2 | Libro: siempre viejo; siempre nuevo | 14 | 6 y 9 |
| W3, W4 | Ausente como nuevo; el IVA se queda viejo | 14 | 3 y 3 |
| W5, W6 | Celda; nombre del desplegable, leen la categoría | 14 | 1 y 2 |
| W7, W8 | Detalle; descarga, leen la categoría | 14 | 1 y 2 |
| W9, W10 | Panel de la composición, escritorio; móvil | 24 y 25 | 1 y 1 |

Lo que ninguna mutación cubre es que `page.tsx` pase el agregado: lo obliga el compilador y lo afirma el E2E.

### E2E

`servi_e2e_slt54`, host local comprobado, recreada, migrada y con catálogos, sobre `next build` + `next start`. Borrada al terminar (`existe: false`). No se tocó la base de `.env`; ninguna URL impresa.

```
$ playwright test --project=dinero
  43 passed (1.6m) | 0 failed | 0 skipped | 0 flaky
```

`tarifas-activacion` ya recorría esa pantalla como satélite. Ahora afirma en la tarjeta del histórico «Ingreso de bodega» sobre 570 y el viejo sobre 300; en la consolidación, que junta los dos cierres, «Ingreso de bodega a consolidar» sobre 870, sin la región vieja, y cada tarjeta con el suyo. El libro de la caja no tiene E2E de este rótulo. 0 menciones de `useToast` o `ToastProvider` en el log del servidor. Tras el E2E solo cambiaron docs y esta bitácora.

### Salida de los comandos

Sin `./init.sh` ni la suite completa, por encargo. El grafo no tiene proyecto para este worktree (`list_projects`): Grep y Read.

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck        -> exit 0
$ pnpm run lint                                                    -> exit 0; 0 errores, 233 avisos
$ vitest tests/integration/db/cierre-incluye-modelo-nuevo.test.ts + los 3 de componentes   (DATABASE_URL = servi_gate_slt54)
  Test Files  4 passed (4)
       Tests  59 passed (59)
$ vitest related --run <7 archivos de la tanda>                    (DATABASE_URL = servi_gate_slt54)
  total 4172 | passed 3916 | failed 40 | skipped 216 | archivos 315
  - 34 archivos con rojos: todos en tests/baseline-rojos.json; 0 fuera
$ pnpm run test:guardias
  Test Files  1 failed | 330 passed (331)
       Tests  4 failed | 4614 passed | 1 skipped (4619)
  - 4 rojos: dependencias-declaradas-presentes (baseline)
```

El related se corrió antes de añadir el caso móvil de `DetalleFilaComposicion`, que se volvió a correr en la línea de los 59. Como en H1, el criterio es el baseline por archivo, y por archivo no distingue un rojo nuevo dentro de un archivo que ya estaba rojo; no comparé esos 40 uno a uno contra la rama base. Los 233 avisos de lint son de todo el repo; `eslint` sobre los archivos de la tanda no dio ninguno antes del caso móvil.

## Tanda I1 — El modelo de tarifa en la fila del estado de cuenta de la tienda (backend)

**Veredicto:** la fila del estado de cuenta de una tienda ya dice si incluye el modelo nuevo, en las dos pantallas y en sus descargas, y la lectura de `cierre_detail` ya no puede tocar un importe. Sin esquema, sin migraciones, sin cambiar importes ni UI. D38 sigue abierto hasta que `frontend_dev` conecte el rótulo.

### Campo

**`incluyeModeloNuevo?: boolean`, en `FilaEstadoCuentaDTO` (`lib/types/estado-cuenta.ts`).** Aditivo.

- **A qué fila llega de verdad:** `MiEstadoCuenta.tsx:55` y `EstadoCuentaTienda.tsx:40` reciben `FilaEstadoCuentaDTO`, la arma `EstadoCuentaService.leerTienda`. **`WalletTiendaMovimientoDTO` no la alimenta**: ninguna pantalla ni componente lo importa. Por eso no se tocó y el campo que nombraba D38 no habría servido.
- **Por dónde pasa:** `leer` (`/wallet/tiendas`), `leerCompleto`, `leerMiTienda` (`/mi-wallet`) y `leerMiTiendaCompleto`. Las descargas del kardex (`LibroKardexService`) devuelven ese mismo `estado`, así que `f.incluyeModeloNuevo` también está en la descarga.
- **Valor:** en el libro de una tienda es siempre booleano. En mensajero y bodega, ausente: no se rotula con este dato y así sus filas no cambian de forma.
- **Criterio:** sale de `cierre_detail.tarifa_modelo`; no lee `tarifa_activacion`. Mixto cuenta como incluye nuevo. Solo la fila con origen `cierre_dia`: el cobro por rechazo (`gestion_orden`) sale falso porque esa devolución sí hubo.
- **Por tienda, y no solo por cierre.** Es la diferencia con el libro de la caja: un cierre mezcla tiendas, y la fila de una no responde por las gestiones de otra. Se filtra por `cierre_detail.tienda_id`, la misma tienda congelada a la que el feed asentó la fila.
- **Empresa:** la pone la RLS de `cierre_detail`.
- **Lectura:** una sentencia por página, dentro de la lectura consistente del extracto, y ninguna si la página no tiene filas de un cierre. Método nuevo: `IEstadoCuentaRepository.cierresConModeloNuevoDeTienda(tiendaId, cierreIds)`.

### Para `frontend_dev`

- `ROTULOS_MI_WALLET.concepto` y `ROTULOS_TIENDA.concepto`: `f.incluyeModeloNuevo === true` y categoría `flete_devolucion` o `iva_flete_devolucion` → texto del modelo nuevo. `f` ya es la fila.
- `PANEL_TIENDA.nombreParaAnular` pasa por `ROTULOS_TIENDA.concepto`, y no hace falta tocarlo.
- **El filtro** de `/mi-wallet` que usa esa frase rotula una categoría, sin fila: este campo no le alcanza. Hay que decidirlo en esa tanda.
- Faltan los tests del encargo de D38 en las dos superficies: literal del viejo y del nuevo. `progress/deudas.md > D38` se cierra con esa tanda.

### Menores

- **Comentario de `WalletTiendaFeedService.ts:18`:** corregido, dice qué emite cada modelo, comprobado en `derivarIngresoOrden` y `derivarIngresoModeloNuevo`. El comentario de dentro del bucle repetía el mismo error y ahora remite al primero. Sin cambio de código.
- **Menor 7, `caja-173-alcance`:** cerrado en dos capas.
  - **Tipo:** `LectorDeModeloDeDetalle` (`_shared/detalle-modelo-nuevo.ts`) sustituye al `Pick<PrismaClient, "cierreDetail">` en el módulo, en `WalletMovimientoRepository` y en `EstadoCuentaRepository`: un `findMany` cuyos argumentos solo admiten leer `cierre_id` donde `tarifa_modelo = nuevo`. `tsc` para `aggregate` y un `select` de importes con el cliente que el código ya tiene.
  - **Guardia:** G4 y G5 declaran su propio `Pick`, y ahí `tsc` no puede pararlas. Regla nueva: ninguno de los dos repositorios nombra `cierreDetail` ni `cierre_detail`, y el módulo no nombra `PrismaClient`, SQL crudo, agregaciones, `monto`, sumas en JS, otro método del delegado ni una entrada de dinero del detalle. Esa lista sale del esquema (columnas `Decimal` y `conceptos`). Tiene control de no vacuidad y contrapruebas.
- **Menor 8, B5:** test «el lote lee solo los cierres pedidos…», que cuenta las filas leídas con un lector que envuelve al `findMany` real.
- **Menor 10:** espacio tras `=` en `CierresAdminRepository.ts:584`.

### Decisiones

- **Opcional en el tipo**, como en H1: obligatorio tocaba los fixtures de las filas y el DTO de mensajero y bodega. El compilador no obliga a poblarlo; lo obligan S1 y S6.
- **Guardia, tocada a propósito:** `caja-173-alcance` amplía su alcance a `EstadoCuentaRepository`, que no es de la caja, porque abrió la misma tabla por el mismo módulo. Su `$queryRaw` antes no tenía esta regla y `cierre_detail` ya no se le puede colar por SQL (G14). El resto de sus sumas y tablas sigue sin guardia aquí: es anterior y no se tocó.
- **Otra empresa, doble defensa:** como un cierre de otra empresa lleva una tienda de esa empresa, el filtro por tienda ya da falso aunque falle la RLS. Para que el test dependa de la RLS, pregunta por la tienda de B leyendo como A: vacío como `servi_app` y el cierre como dueño de las tablas (T1).

### Archivos

**Nuevos:** `tests/integration/db/estado-cuenta-tienda-modelo-nuevo.test.ts`

**Modificados:** `lib/interfaces/repositories/IEstadoCuentaRepository.ts`, `lib/repositories/_shared/detalle-modelo-nuevo.ts`, `lib/repositories/CierresAdminRepository.ts`, `lib/repositories/EstadoCuentaRepository.ts`, `lib/repositories/WalletMovimientoRepository.ts`, `lib/services/EstadoCuentaService.ts`, `lib/services/WalletTiendaFeedService.ts`, `lib/types/estado-cuenta.ts`, `tests/unit/guards/caja-173-alcance.guardia.test.ts`; esta bitácora

### Mapa R → test (tanda I1)

Todo en `tests/integration/db/estado-cuenta-tienda-modelo-nuevo.test.ts`, 12 casos sobre `servi_gate_slt54`, leídos como `servi_app` por las cuatro entradas del servicio.

| Caso del encargo | Test |
|---|---|
| R71/D38, solo viejo → falso | «solo viejo: falso…»; «un cierre sin ninguna fila de detalle…» |
| R71/D38, reprogramado nuevo → verdadero | «reprogramado del modelo nuevo…», con `WalletTiendaFeedService` real: `flete_devolucion` 250,00 e `iva_flete_devolucion` 32,50 |
| R71/D38, mixto → verdadero | «mixto dentro de un cierre»; «entre cierres, cada fila dice el suyo» |
| R71/D38, cierre anterior a la activación → falso | «empresa activada…», con la solicitud real antes y después de activar |
| R71/D38, otra tienda no contamina | «otra tienda del mismo cierre…» |
| R71/D38, otra empresa no contamina | «otra empresa no contamina…» |
| Solo el origen `cierre_dia` | «solo una fila con origen `cierre_dia`…» |
| Campo aditivo | «la fila del mensajero no lleva el campo…»; importes literales en «solo viejo» y «reprogramado» |
| Sin N+1 | «tres cierres cuestan una sentencia…» |
| Menor 8, B5 | «el lote lee solo los cierres pedidos…» |
| Menor 7, G4 y G5 | `caja-173-alcance`: «SLT-54: la lectura del modelo solo llega a `tarifa_modelo`…» y su contraprueba |

### Mutaciones

Script `i1-mut.cjs` en el scratchpad: corre primero la base de cada suite y aborta si no hay tests, hay rojos o hay saltos (`BASE total 12, fail 0, skip 0` y `BASE total 39, fail 0, skip 0`). Restaura cada archivo en `finally` y compara la huella del árbol al final (`ARBOL RESTAURADO true`). **24 de 24 matadas, todas por aserción, con todos los casos ejecutados en cada una.** Final: 0 rojos de 12 y 0 de 39.

G4 y G5 son las líneas literales de `v2-mut.cjs` del reviewer. G4, G5, G9 y G11 se repitieron tras afinar el control de no vacuidad, que en la primera vuelta mataba G5 con un mensaje engañoso. Esa repetición es la que consta abajo.

| Id | Mutación | Rojos |
|---|---|---|
| D1, D2 | Lote sin filtro de modelo; lote del viejo | 5 y 9 de 12 |
| **B5** | Lote sin filtro de cierre (literal adaptado al `where` nuevo) | **1 de 12, cae** |
| D3 | Lote sin filtro de tienda | 1 |
| D4 | Lote sin `distinct` | 1 |
| D5 | Consulta aunque no haya ids | 2 |
| R1, R2 | El repositorio no pasa la tienda; una consulta por cierre | 1 y 1 («esperado 1, medido 3») |
| S1, S2 | Fila siempre falso; siempre verdadero | 8 y 8 |
| S3, S4 | Fila sin mirar `origen_tipo`; lote con ids que no son cierres | 1 y 1 |
| S5 | El servicio no pasa la tienda | 1 |
| S6 | `/mi-wallet` pierde el campo | 9 |
| S7 | El campo se cuela en el mensajero | 1 |
| T1 | El test lee sin el rol de la app, sin RLS | 1 |
| **G4** | El repositorio suma `cierre_detail` por Prisma (literal) | **2 de 39, cae** |
| **G5** | El módulo suma importes (literal) | **1 de 39, cae** |
| G9, G10 | El módulo selecciona un importe; lee `conceptos` | 1 y 1 |
| G11 | El módulo usa otro método del delegado | 1 |
| G12, G13 | La caja o el estado de cuenta recuperan el delegado | 2 y 1 |
| G14 | El estado de cuenta suma `cierre_detail` por SQL | 1 |

Y `tsc`, con `i1-tsc.cjs`, con el cliente que cada archivo ya tiene: 4 de 4 en rojo, `TS2339` o `TS2353` (el módulo agrega, el módulo selecciona un importe, la caja agrega, el estado de cuenta agrega). Base y final, exit 0.

### Salida de los comandos

Sin `./init.sh` ni la suite completa. El grafo no se consultó: Grep y Read.

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck        -> exit 0
$ pnpm run lint                                                    -> exit 0, 0 errores, 233 avisos
$ pnpm exec eslint <archivos de la tanda>                          -> exit 0, sin salida
$ vitest estado-cuenta-tienda-modelo-nuevo, cierre-incluye-modelo-nuevo, caja-173-alcance
  total 60 | passed 60 | failed 0 | skipped 0
$ vitest related --run <7 archivos de lib>                         (DATABASE_URL = servi_gate_slt54)
  total 5842 | passed 5019 | failed 92 | skipped 731 | archivos 483
  - 134 archivos con rojos o sin arrancar: todos en tests/baseline-rojos.json; 0 fuera
  - 0 rojos cuyo mensaje nombre el campo, el método nuevo o «is not a function»
$ pnpm run test:guardias
  total 4621 | passed 4616 | failed 4 | skipped 1 | archivos 331
  - 4 rojos: dependencias-declaradas-presentes (baseline)
```

El criterio del related es el baseline por archivo, que no distingue un rojo nuevo dentro de un archivo que ya estaba rojo. Por eso busqué además los mensajes que delatarían este cambio, pero no comparé esos 92 uno a uno contra la rama base. Los 60 de la tercera línea son anteriores al ajuste del control de no vacuidad; el `FINAL` de la repetición dio 0 de 12 y 0 de 39. Los 233 avisos de lint son de todo el repo.
