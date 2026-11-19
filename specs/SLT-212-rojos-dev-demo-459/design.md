# Diseño — SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

## Lo que ya existe

Términos buscados: `now() AT TIME ZONE 'UTC'`, `TimeZone`, `ocurrido_at`, `findCentralZonaId`, `comoApp`.

- `db/migrations/20261028130200_plan_topes_triggers` y `20261108120300_slt94_fulfillment_triggers` ya documentan el defecto
  («`now()::timestamp` depende del TimeZone de la sesión (medido: 5 h de desfase en local)») y lo arreglan con
  `now() AT TIME ZONE 'UTC'`. Las columnas `timestamp` sin zona del esquema guardan UTC.
- `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones` (líneas 121, 126, 155, 195): las tres funciones del cobro de
  la plataforma escriben `now()` a secas en `ocurrido_at`. Ninguna migración posterior las redefine.
- `factura_plataforma_ordenes` (`20261111130100_factura_plataforma`:378) cuenta los movimientos con `ocurrido_at` dentro del período
  de la factura, que empieza a las 00:00 de la plataforma (−06:00) expresadas en UTC.
- `tests/integration/db/454/_escenario.ts` (SLT-177) y `cierre-rechazo-tienda-aprobacion.test.ts` (SLT-178) ya corren el código bajo
  test con `comoApp` (`tests/fabricas/organizaciones.ts`) porque `findCentralZonaId` es una lectura global que acota la RLS.
- `lib/repositories/ZonaRepository.ts:925` (`findCentralZonaId`) y `lib/services/CierreDiaService.ts:952` (destino del cierre).

## A — el reloj del cobro de la plataforma

**Causa.** En la base local (`TimeZone = America/Bogota`) el cargo se guarda 5 h antes de su instante real. Entre las 00:00 y las 05:00
de la plataforma cae antes del inicio del día de la factura en curso: la factura cierra en 0, `pago_plataforma_disponible` da 0 y
`TopePagoPlataformaService` rechaza el pago (`validation_error (monto)`). En CI, Supabase y Preview (UTC) no ocurre.

**Cambio.** Migración `20261119120100_cobro_plataforma_ocurrido_utc`: `CREATE OR REPLACE` de `cobro_plataforma_porcentual_conciliar`,
`cobro_plataforma_al_crear_orden` y `cobro_plataforma_al_cambiar_borrado`, copiadas literales de `20261104150200`; solo los cuatro
`now()` de los `INSERT` pasan a `(now() AT TIME ZONE 'UTC')`. `CREATE OR REPLACE` conserva `SECURITY DEFINER`, `search_path`, dueño y
el `REVOKE` de `PUBLIC`. Sin tabla nueva (RLS y `organizacion_id` no aplican).

**`down.sql`.** Las tres definiciones de `20261104150200` tal cual. Los movimientos escritos entretanto quedan en UTC.

**Timestamp.** `120100` y no `120000`: así el nombre sigue el orden real de despliegue tras
`20261119120000_historial_accion_ordenes_retiradas_a_central`, ya en dev (review m1).

## B — el cierre del escenario 459

**Causa.** Desde SLT-195 el mensajero del escenario es de la central. El fixture corre como dueño de las tablas (sin RLS): con otra
empresa con central commiteada (la demo de QA en paralelo), `findFirst({ esCentral: true })` puede devolver la ajena, el cierre sale
`bodega_satelite` y la aprobación de la central no encuentra la gestión de O4.

**Cambio.** En `tests/integration/db/_fixtures/caja-459.ts`, `solicitarCierre` y `aprobarCierre` corren tras `comoApp(tx, org)` y,
al terminar, `SET LOCAL ROLE NONE` devuelve la transacción al dueño para el resto de la siembra.

## Alternativas descartadas

- **Poner la base local en UTC** (`ALTER DATABASE … SET TimeZone = 'UTC'` o `PGTZ` en el arnés de tests). Tapa el síntoma en local,
  pero deja el código dependiendo de una configuración del servidor que nadie vigila, contra la regla ya escrita en dos migraciones.
- **Fijar la fecha en la demo o en el test** (`vi.setSystemTime`). El reloj que se desvía es el de Postgres, no el de Node: no se
  puede fijar desde vitest, y además ocultaría un defecto real de la función.
- **Filtrar `findCentralZonaId` por `organizacionId` en la app.** En producción ya lo acota la RLS de `servi_app`; tocar la app por un
  fixture que salta la RLS sería arreglar el lugar equivocado.
- **Sustituir `findCentralZonaId` por un doble en el fixture** (como hacen algunos tests con `{ findCentralZonaId: async () => … }`).
  Dejaría de probar la lectura real; `comoApp` la prueba como corre en producción.
