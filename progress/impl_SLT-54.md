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

**Fixtures:** 16 dobles de `IngresoEmpresaDTO` ganan `tarifaModelo`, sin otro cambio. La lista completa está en `tasks.md > Archivos esperados`.

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
