# SLT-76 · design — deuda de los hotfix SLT-73 y SLT-75 (HOTFIX)

## Lo que ya existe

El grafo no tiene indexado el worktree `.worktrees/SLT-76-hotfix` (`list_projects` no lo lista).
La búsqueda en el código se hizo con Grep/Read.

| Términos buscados | Dónde | Qué apareció | Qué se hace |
|---|---|---|---|
| `zona horaria`, `slice(0, 10)`, `fechaCalendarioCR` | board, código | **SLT-42** (pending): la zona horaria pasa a ser del país. En código: `lib/utils/fecha-cr.ts > fechaCalendarioCR`, que `cierre-factura.tsx` ya importa (ficha 425, `rechazadoAt`) y `CierresBodegaAdminModule.tsx` usa (ficha 431). La guardia `wallet-fecha-cr-459` prohíbe el recorte en `/wallet` y `/mi-wallet`. | Se reutiliza `fechaCalendarioCR`. El solape con SLT-42 se acota (Q2). La guardia nueva copia el detector de la 459. |
| `revertirConciliacion`, `con_asientos`, `conciliacion_bodega_ajuste` | código | `CierresBodegaAdminRepository.revertirConciliacion` cuenta en línea los asientos `cierre_dia`. `ConciliacionAcciones` ya pinta el aviso `con_asientos` dentro del diálogo. | El conteo sale a un predicado compartido (§2). El aviso se queda como red de seguridad. |
| `esperadoDe`, `paraLaCentral` | código | `lib/utils/conciliacion-satelite.ts > esperadoDe` (la usa `SaldosSatelitesRepository`) | Se reutiliza (§4). |
| `comoApp`, `crearOrganizacion`, dos empresas | tests | `tests/fabricas/organizaciones.ts`; patrón en `slt73-conciliacion-bodega-ajuste-rls.int.test.ts` | Se reutiliza (§5). |
| `historial distritos`, `zona_distrito` + `historial_accion` | board, specs, código | Q1 de SLT-75 (sin ficha). Patrón de bajada de enum sin lista fija: `20261026120100_historial_accion_modulos/down.sql` (SL-23). `ZonaRepository.update` ya lee `distritosPrevios`. | Se reutilizan los dos (§6). |
| `40P01`, `deadlock` | `progress/deudas.md` (rama `dev`) | **D32**, con las tres salidas posibles | Se aplican dos de ellas juntas (§7.1). |
| `respaldo` | specs, migraciones, tests | `down.sql` de SLT-73 y SLT-75 con borrado del esquema solo si queda vacío (B1/m1 de SLT-75); `respaldo-convivencia-slt73-slt75.test.ts` | Se reutiliza el mismo bloque `DO` (§9). |

Ninguna ficha del board hace lo mismo que esta. La única que se solapa es SLT-42 (Q2).

---

## §1 Bloque 1 — Fecha en el calendario del negocio (R1, R2)

**Causa.** `fecha()` de `app/(app)/cierres-admin/_components/cierre-factura.tsx:307` devuelve
`iso.slice(0, 10)`, que es el día UTC. Tiene cinco lectores en el mismo archivo:
- la tarjeta compacta (`:748`);
- «Conciliado el» (`:660`);
- las fechas del desplegable (`:1084`, `:1090`);
- el comprobante propio del mensajero (`:1150`, `:1194`, que alimenta también su nombre accesible);
- la cabecera del detalle (`:2561`, `:2563`).

El mismo patrón aparece en una segunda superficie de dinero:
`app/(app)/cierre-dia/_components/CierreDiaModule.tsx:935` (nombre accesible de «Ver detalle») y
`:1026` (cabecera del cierre abierto).

**Zona horaria.** El repo la define en un solo sitio, `lib/utils/fecha-cr.ts`. Es Costa Rica, UTC-6
fijo, y `fechaCalendarioCR` es «la unica pieza del repo que sabe del desfase» (`hora-cr.ts`). No se
inventa nada nuevo. Hacerla por país es SLT-42 (Q2).

**Arreglo.**
- `fecha(iso)` pasa a devolver `"—"` si `iso` es `null` o no es un instante válido. En otro caso
  devuelve `fechaCalendarioCR(new Date(iso))`. Es el mismo criterio que este archivo ya aplica a
  `rechazadoAt` (`:2251`).
- En `CierreDiaModule.tsx` los dos recortes pasan a `fechaCalendarioCR(new Date(...))`.
- **Por qué no `fechaDiaMovimientoCR`:** trata la medianoche UTC exacta como una fecha `@db.Date` y
  la devuelve sin desfase. Un cierre solicitado a las 18:00:00.000 de Costa Rica (00:00:00.000Z)
  saldría con el día siguiente. Aquí las cinco fechas son `timestamp`, nunca `@db.Date`.

**Fuera, y anotado.** `app/(app)/incidentes/_components/IncidentesAdminModule.tsx:485,501,771` e
`IncidentesHistoricoTabla.tsx:193` tienen el mismo recorte. No son superficies de dinero, así que
quedan fuera de esta ficha. Los `toISOString().slice(0, 10)` de `analitica/**` operan sobre días ya
normalizados y no son este defecto.

**Tests.**
- `tests/components/CierreFacturaFechaCR.test.tsx` (R1). Usa el instante `2026-11-01T05:03:00.000Z`
  (23:03 en Costa Rica del día 31), el mismo de la observación de `impl_SLT-73.md`, tanda 12. Pinta
  `CierreFacturaResumen` (cabecera y, desplegado, «Solicitado»/«Resuelto»), la columna de
  conciliación de un cierre de bodega con `conciliadoAt` en ese instante, `CierreFacturaResumenPropio`
  (texto y nombre accesible) y la cabecera de `CierreFacturaDetalle`. En todos espera el literal
  `2026-10-31`, escrito a mano, y en ninguno `2026-11-01`. Con `null` espera «—».
  - Mutación: devolver `fecha()` a `iso.slice(0, 10)` → rojo.
- `tests/unit/guards/cierres-fecha-cr.guardia.test.ts` (R2). Copia el detector de
  `wallet-fecha-cr-459` (mismas `PROHIBIDAS`, sin comentarios, con contraprueba y suelo de archivos
  revisados) y lo pasa por `app/(app)/cierres-admin` y `app/(app)/cierre-dia`.
  - Mutación: volver a poner `c.solicitadoAt.slice(0, 10)` en `CierreDiaModule.tsx` → rojo.

---

## §2 Bloque 2 — «Desmarcar» solo cuando se puede (R3, R4)

**Causa.** `ConciliacionAcciones` muestra «Desmarcar» para todo estado distinto de `pendiente`
(`:204`). Solo se entera de que hay asientos cuando el servidor responde `con_asientos`
(`:152`). Desde SLT-73, toda marca asienta (R10), así que el botón se ofrece casi siempre para una
acción que se va a rechazar. Encima, la nota del mismo diálogo dice «Después no se puede
desmarcar».

**Arreglo (§2 y §3 comparten pieza).**
1. **Predicado único.** `lib/repositories/_shared/conciliacion-con-dinero.ts` exporta
   `consolidacionesConDinero(cliente, cierreBodegaIds): Promise<Set<string>>`. Devuelve el conjunto
   de consolidaciones que tienen al menos una de estas dos cosas:
   - una fila de `wallet_movimiento` con `origen_tipo = 'cierre_dia'` de alguno de sus cierres del
     día (es el conteo actual de `revertirConciliacion`);
   - una fila de `conciliacion_bodega_ajuste` (es §3).

   Usa Prisma con el cliente que recibe, no SQL a mano, así que la extensión filtra por empresa y
   no hace falta una excepción nueva en `EXCEPCIONES_SQL_A_MANO`. Hace dos lecturas en lote por
   llamada, no una por fila.
2. **El dato baja al cliente.** Lo que se pinta lleva `desmarcable: boolean`, derivado en el
   servidor como `conciliada && !consolidacionesConDinero.has(id)`:
   - `/cierres-admin`: `CierreBodegaRepository` (fila `CierreBodegaResumenRow`,
     `ICierreBodegaRepository.ts:~81`) → `CierresBodegaAdminService` (`:~524`) → marca de
     `ICierreBodegaService.ts:~81`;
   - `/wallet/satelites`: el desglose de `SaldosSatelitesRepository` (`:~318`) → tipo de
     `lib/types/conciliacion-satelites.ts:~194`.

   El predicado se llama UNA vez por página, con los ids de las conciliadas de esa página.
3. **El componente lo respeta.** `ConciliacionAcciones` recibe `marca.desmarcable` como campo
   OBLIGATORIO del tipo. No hay valor por defecto: quien monte el componente sin el dato no compila.
   Con `false` no se pinta «Desmarcar». «Corregir» no cambia. El aviso `con_asientos` del diálogo se
   queda para la carrera «se pintó desmarcable y entre tanto alguien asentó».
4. Los dos montajes (`ConciliacionSatelite.tsx` y `CierresBodegaAdminModule.tsx`) pasan el campo.
   Los dobles de tests que construyen `marca` reciben el campo (`tests/fixtures/marca-conciliacion.ts`
   y los que falle el typecheck).

**Tests.**
- `tests/components/ConciliacionAccionesConAsientos.test.tsx` (R3). Con `desmarcable: false`, en
  estado «Recibido» y en «Recibido incompleto», no hay ningún botón con nombre «Desmarcar…» y en
  incompleto sí está «Corregir…». Con `desmarcable: true` está «Desmarcar…».
  - Mutación: ignorar el campo (la condición vuelve a `estado !== "pendiente"`) → rojo.
- `tests/integration/db/slt76-desmarcable.int.test.ts` (R4, Postgres real). Siembra tres
  consolidaciones conciliadas: (i) con asientos `cierre_dia`, (ii) sin asientos y con un ajuste,
  (iii) sin ninguno de los dos. Lee las dos superficies (repositorio de `/cierres-admin` y desglose
  de `/wallet/satelites`) y comprueba `desmarcable` = `false`, `false`, `true`. Después llama a
  `revertirConciliacion` sobre cada una y comprueba `con_asientos`, `con_asientos`, `updated`.
  - Mutación: el predicado devuelve siempre el conjunto vacío → rojo.

**Alternativa descartada:** quitar «Desmarcar» del todo. Hoy casi nunca se puede usar, pero
quitarlo retira R12 de la ficha 431, y esa es una decisión de producto que nadie tomó. También se
descartó ocultarlo en el cliente según el estado: el cliente no sabe si hay asientos, y adivinarlo
abriría otra divergencia entre el botón y el servidor.

---

## §3 Bloque 3 — Revertir con ajustes (R5)

**Causa.** `revertirConciliacion` (`CierresBodegaAdminRepository.ts:709-718`) solo cuenta las filas
`cierre_dia` de la caja. Una consolidación con ajustes de diferencia y sin esas filas se revierte, y
la diferencia se queda en «Por cobrar a satélites» con la marca deshecha (m4 de SLT-73).

**Arreglo.** Las líneas 709-718 pasan a
`if ((await consolidacionesConDinero(tx, [id])).has(id)) return "con_asientos"`. El conteo sigue
dentro de la misma transacción y antes de cualquier escritura. El resto del método no cambia.

**Test.** `tests/integration/db/slt76-revertir-con-ajuste.int.test.ts`. Siembra una consolidación
conciliada sin asientos `cierre_dia`, con una fila de `conciliacion_bodega_ajuste` y su movimiento de
caja `egreso_diferencia_satelite`. Al revertir:
- devuelve `con_asientos`;
- `conciliado_at`, `monto_recibido` y `estado` siguen igual;
- `conciliacion_bodega_ajuste` y `wallet_movimiento` no cambian (conteo y suma);
- no hay fila nueva en `historial_accion`.

Mutación: quitar el ajuste del predicado → rojo. Además, `slt76-desmarcable` (ii) cae.

---

## §4 Bloque 4 — Una sola fórmula del esperado (R6)

**Arreglo.** En `asentarDiferenciaSatelite` (`CierresBodegaAdminRepository.ts:100-106`),
`new Prisma.Decimal(paraLaCentral(...))` pasa a `esperadoDe(consolidacion)`. El `select` ya trae
los tres snapshots que pide `SnapshotEsperado`. El import de `paraLaCentral` se va si no le queda
otro uso en el archivo.

**Tests.**
- `tests/unit/guards/conciliacion-esperado-unico.guardia.test.ts`. El código sin comentarios de
  `lib/repositories/CierresBodegaAdminRepository.ts` no contiene `paraLaCentral(` y sí contiene
  `esperadoDe(`. Incluye contraprueba del detector.
  - Mutación: volver a la llamada a mano → rojo.
- Valor a mano (R6). `slt73-marcar-asienta.int.test.ts` ya siembra 9.000 / 1.500 / 500. Si alguno
  de sus casos no lo hace, se añade uno que afirme literalmente `monto_esperado = 7000.00` y
  `diferencia = 100.00` con recibido 6.900. Nada de comparar contra `esperadoDe`: comparar con su
  propia fuente siempre sale verde.
  - Mutación: `esperadoDe` deja de restar `totalIngresoBodegaRechazos` → rojo aquí y en los tests
    del desglose (`saldo-satelites.int.test.ts`). Eso demuestra que hay una sola fuente.

---

## §5 Bloque 5 — Estado de cuenta de la bodega con dos empresas (R7)

**Contexto.** `totalesDeBodega`, `periodoDeBodega` y `paginaDeBodega`
(`EstadoCuentaRepository.ts:312, 406, 438`) leen `movimientosDeBodegaSql` (`:200`) con `$queryRaw`
sin `organizacion_id`. Los cubre la RLS (`EXCEPCIONES_SQL_A_MANO`, `porRls`). Falta el test que pide
`docs/checkpoints-proyecto.md`. **No se cambia código de la app:** el arreglo mínimo es el test.

**Test.** `tests/integration/db/slt76-estado-cuenta-bodega-dos-empresas.int.test.ts`. Se usa el
patrón de `slt73-conciliacion-bodega-ajuste-rls.int.test.ts` (`crearOrganizacion`, `comoApp`, una
transacción revertida y `serializarEscriturasReales`).
- **Siembra.** En la empresa A, una zona satélite con:
  - una consolidación conciliada, que aporta `declarado` y `recibido`;
  - un cierre del día aprobado sin consolidar (`sin_consolidar`).

  En la empresa B, lo mismo con otros importes.
- **Lectura.** Con `new EstadoCuentaRepository(tx)` tras `comoApp(tx, B)`, se piden los tres métodos
  con la `zonaId` de A. Se espera página vacía, periodo vacío y totales `0.00`/`0.00`.
- Tras `comoApp(tx, A)`, los tres métodos devuelven los importes de A, escritos a mano.
- **CONTROL.** Con el rol dueño (`fijarEmpresa`, sin `comoApp`), la misma lectura de la zona de A
  desde B SÍ ve las filas de A. Demuestra que el test es capaz de ver una fuga.
- **Mutación del reviewer** (no entra en la suite). Dentro de la transacción revertida,
  `ALTER TABLE cierre_bodega DISABLE ROW LEVEL SECURITY` antes de leer como B → rojo.

---

## §6 Bloque 6 — Rastro de distritos en `historial_accion` (R8-R11, forma sujeta a Q1)

### §6.1 Modelo
No hay tabla ni columna nueva. Se añade un valor al enum `historial_accion_tipo`:
`zona_distrito_cambiado` (Q1-f). `entidad_tipo` = `zona`, que ya existe. Las filas son de la empresa:
`organizacion_id` sale del contexto y `historial_accion` ya tiene RLS.

### §6.2 Migración `db/migrations/20261102090000_slt76_historial_zona_distrito/`
- `migration.sql`: `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS
  'zona_distrito_cambiado';`, SOLA en su migración, porque Postgres prohíbe usar el valor en la misma
  transacción (55P04). Es el mismo patrón que `20261026120100_historial_accion_modulos`.
- `down.sql`: `DELETE FROM historial_accion WHERE accion = 'zona_distrito_cambiado'` y quitar el
  valor con la función `pg_temp` de SL-23 (`20261026120100_historial_accion_modulos/down.sql`).
  Esa función recrea el tipo con «la lista VIGENTE menos los valores» que se le pasan, así que el
  `down.sql` no se queda rancio cuando otra ficha añade un valor. Eso reduce el coste que estimó la
  Q1 de SLT-75 (~100 líneas fijas). Se copia la función con sufijo propio (`…_slt76`).
- `db/schema.prisma`: el valor en `enum HistorialAccionTipo`.

### §6.3 Catálogo
`lib/types/historial-accion.ts` toca tres mapas:
- la lista de tipos, con comentario del punto de escritura
  `zonas.actualizarZona -> ZonaRepository.update`;
- la categoría: `mueve_dinero` (Q1-d);
- la etiqueta: «Cambió los distritos de una zona» (Q1-f).

### §6.4 Escritura (`ZonaRepository.update`)
Va dentro de la transacción, después de `deleteMany` + `createMany` (`:499-505`). `distritosPrevios`
ya está leído (`:480`).
- `anadidos = data.distritoIds − previos`; `quitados = previos − data.distritoIds`.
- Si los dos están vacíos, no se escribe nada (R10).
- Una lectura `tx.distrito.findMany({ where: { id: { in: [...anadidos, ...quitados] } }, select:
  { id, nombre, canton: { select: { nombre } } } })`.
- Un único `appendAccion(tx, filas, randomUUID())`, con un lote por guardado. Las filas van ordenadas
  por texto del distrito, y en cada una:
  - `accion: "zona_distrito_cambiado"`, `entidadTipo: "zona"`, `entidadId: id`;
  - `entidadEtiqueta: etiquetaDeEntidad("zona", { nombre: <nombre tras el guardado> })`;
  - añadido → `valorAnterior: null`, `valorNuevo: texto`; quitado → al revés;
  - `texto = «<distrito> (<cantón>)»` recortado a 60 en origen, como hace
    `GeoRepository.renombrar` (Q1-c).
- Va con `tx`, nunca con `this.prisma` (la mutación que sobrevivió en la ficha 373).
- El rechazo de SLT-75 (R1/R2) sale antes de la primera escritura, así que un guardado rechazado no
  deja filas sin código adicional.
- `create` y `delete` no cambian (Q1-e).

### §6.5 Tests
- `tests/integration/db/zona-distrito-rastro.test.ts` (Postgres real). Usa una zona con distritos
  {d1, d2}.
  - Un guardado con {d2, d3} deja exactamente 2 filas con el mismo `lote_id`:
    - d1 con anterior `«d1 (c1)»` y nuevo `null`;
    - d3 con anterior `null` y nuevo `«d3 (c3)»`.

    Los literales están escritos a mano.
  - Guardar otra vez {d2, d3} deja 0 filas.
  - Un guardado rechazado por un distrito de otra zona deja 0 filas.
  - Un distrito con nombre de 70 caracteres queda en ≤ 60.
  - Mutaciones:
    - intercambiar anterior y nuevo → rojo;
    - quitar la condición de «sin cambios» → rojo;
    - escribir con `this.prisma` → rojo en el caso del rechazo.
- `tests/integration/db/historial-accion-zona-distrito-migration.test.ts`. Usa el patrón de
  `historial-accion-zona-sinpe-migration.test.ts`: `up` añade el valor; `down` borra solo sus filas
  y deja el resto del enum intacto (compara con la lista previa leída de `pg_enum`, no con una
  lista escrita a mano).
- Se ajustan los conteos fijos de `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` y de
  `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`, que gana el punto de
  escritura. También los tests de migración del historial que fijen el último valor del enum: el
  implementer los mide corriéndolos, porque la Q1 de SLT-75 habla de unos 13 y no se puede afirmar
  cuáles fallan sin ejecutarlos.
- R11. En `tests/unit/components/historial-acciones-descarga-columnas.test.ts`, la fila nueva sale
  con su etiqueta y sus dos valores en pantalla y en descarga. La categoría se filtra con el
  catálogo.

**Alternativa descartada:** una fila por guardado con las listas en `valor_anterior`/`valor_nuevo`.
No cabe en `VARCHAR(60)`. Ensancharla es otra migración sobre una tabla caliente y rompe la regla
escrita en el esquema («vocabulario CERRADO… ANCHURA 60»).

---

## §7 Bloque 7 — Tests deterministas (R12-R15)

### §7.1 D32 — `liquidacion-reparto-migration` (R12)
**Causa** (D32, `progress/deudas.md` de `dev`). `medir` (`:381`) corre el DDL real, cuyas FK
apuntan a `public.usuario`, dentro de `enTransaccionRevertida`, sin `serializarEscriturasReales` y
sin bloquear `usuario`. El `DROP TABLE` del down pide `AccessExclusiveLock` sobre `usuario` mientras
otro test del shard lo escribe, y eso es un ciclo (40P01).

**Arreglo.** Combina las dos primeras salidas de D32. Las dos primeras sentencias de `medir`, antes
de `CREATE SCHEMA`, son:
1. `await serializarEscriturasReales(tx)`: el lock de la 227, que cierra el choque con `demo-qa` y
   con todo test que siga el protocolo;
2. `LOCK TABLE public.usuario IN ACCESS EXCLUSIVE MODE`: el lock más fuerte que el DDL va a pedir,
   tomado de entrada. Así no se sube de nivel a mitad de transacción, y un escritor de `usuario` sin
   lock espera a que terminemos en vez de cerrar un ciclo.

El orden (aviso → `usuario`) es el del protocolo del repo: quien toma el lock de la 227 lo toma
primero. **Coste:** mientras dura `medir`, el resto del shard espera para leer `usuario`. Son
segundos y no es un fallo.

**Test (dentro del mismo archivo).** Justo después de los dos locks y antes del primer DDL, una
consulta a `pg_locks` con `pid = pg_backend_pid()` debe ver dos cosas:
- el advisory `CLAVE_LOCK_ESCRITURA_REAL` concedido;
- `AccessExclusiveLock` concedido sobre `'public.usuario'::regclass`.

Se registra en `Medicion` y se afirma en un `it` propio. Mutaciones: quitar el `LOCK TABLE` → rojo;
quitar `serializarEscriturasReales` → rojo.
**Lo que este test no prueba:** el 40P01 no se reproduce en local (0/8 en D32). La evidencia de que
desaparece es el CI. Al cerrar se anota en D32 cuántas corridas del shard salieron verdes.

**Alternativa descartada:** la tercera salida de D32, clonar `usuario` en el esquema desechable. Es
la que más aísla, pero el propio archivo (`:416-418`) exige que las FK apunten a la tabla real para
no probar un RESTRICT contra una tabla de juguete, y además el encargo pide lock o serialización.
Un reintento tampoco vale (D18/D32).

### §7.2 `geografia-por-pais` (R13)
**Datos.** El CI corre `postgres:17` (`.github/workflows/gate.yml:123` y `:318`). En local hay
Postgres 18, que comprueba antes la acción `ON UPDATE RESTRICT` y reporta `23001`
(`restrict_violation`) donde 17 reporta `23503` (`foreign_key_violation`). Los dos códigos dicen lo
mismo: la base rechazó el cambio porque hay hijos que lo impiden.

**Arreglo.**
- En los casos que chocan con un `RESTRICT` con hijos, se acepta el conjunto `{"23001", "23503"}`
  con un helper `rechazoPorRestrict(code)` y un comentario que nombra la diferencia entre
  versiones. Son `provinciaConHijos` (`:128`) y «mover un cantón a una provincia de otro país con
  distritos» (`:146-153`).
- Los casos sin hijos de por medio (`cantonAOtroPais`, `distritoAOtroPais`, `padreInexistente`)
  siguen exigiendo `23503` exacto.
- El de `:146` gana una aserción de que el cantón conserva su `provincia_id` y su `pais_id`. Hoy solo
  mira el código.
- **Paso de verificación (T7.2).** El implementer corre el archivo en PG18 local y anota qué casos
  dan `23001`. Si es otro conjunto que el de arriba, se ajusta al medido, nunca a ojo.

**Mutación.** Cambiar la FK compuesta del distrito a `ON UPDATE CASCADE` dentro de la transacción
revertida → el `UPDATE` pasa → rojo en 17 y en 18.

### §7.3 `indices-rutas-calientes` (R14)
**Causa.** En el rollup compiten tres índices: el compuesto `(organizacion_id, fecha)`, el de solo
`organizacion_id` y el único del grano (fecha primero). Con el corpus actual (366 días × 10 cubos ×
2 empresas, consulta de 30 días), el compuesto lee 300 filas y el del grano 600. La diferencia es
de 2×, y la estadística de una base acumulada la da vuelta (m7 de SLT-75, reproducible).

**Arreglo** (solo el corpus y las estadísticas, sin tocar la aserción):
1. **Corpus decisivo.** En el rango consultado (junio de 2000), la empresa B tiene ≥ 10× los cubos de
   A. Así el índice del grano lee al menos 11× lo que lee el compuesto. A conserva sus filas fuera
   de rango, para que el índice de solo `organizacion_id` también lea ≥ 10×. Como las empresas son
   nuevas y el rango es del año 2000, los tres índices solo ven filas del corpus, sea cual sea el
   resto de la base.
2. **Estadística completa del corpus.** `SET LOCAL default_statistics_target = 10000` antes de los
   `ANALYZE` (`:250-262`). Con eso la muestra no deja fuera las filas del corpus en una tabla
   grande. Es transaccional y se revierte con todo lo demás.

La aserción «el plan nombra su índice» se queda: ES el contrato de R24 de SL-18.
- Mutación (la de la bitácora): `DROP INDEX analytics_daily_organizacion_id_fecha_idx` dentro de la
  transacción → el plan nombra otro → rojo.
- Evidencia: 5 corridas seguidas en verde en la base local acumulada donde hoy sale rojo, y 1 en una
  base limpia.

**Alternativa descartada:** quitar la aserción del plan, o `enable_*scan = off`. Lo primero borra el
contrato. Lo segundo fuerza el plan en vez de medirlo.

### §7.4 `salida-a-reparto-sql-real` (R15)
**Causa.** `sembrar` (`:125`) hace `tx.canton.findFirst({ select: … })` sin filtro ni orden. En la
base compartida puede devolver un cantón de otro país que sembró otro archivo, y la orden falla con
SL021 («geografía de otro país»).

**Arreglo.** Antes de elegir el cantón se lee `organizacion.pais_id` de la empresa del test. Después:
`findFirst({ where: { paisId }, orderBy: { id: "asc" }, select: … })`. Basta con `canton.pais_id`:
el trigger de SL-20 lo alinea con el de su provincia.
El país sale de la empresa, no de un literal.

**Test de la mutación.** Un caso nuevo en el mismo archivo, dentro de su transacción, siembra antes
de `sembrar` una provincia y un cantón de un país de prueba con `id` que ordena primero
(`'0000…'`), y comprueba que el escenario se siembra y la orden entra. Mutación: quitar el `where`
→ rojo, de forma determinista.

---

## §8 Bloque 8 — Textos definitivos (R16)

No cambia ningún texto de la app (ya son los de Q10 y los rótulos de T12). Solo se quita la marca
«provisional»:
- `specs/SLT-73-dinero-satelite-al-conciliar/requirements.md:272-279`: Q10 pasa a «Cerrada
  (Carlos, 2026-11-01): definitiva» y los rótulos a definitivos.
- `specs/SLT-73-dinero-satelite-al-conciliar/design.md:277, 279, 289, 379` y `tasks.md:81, 119`.
- Nombres y comentarios de tests:
  - `tests/integration/wallet-satelites.test.tsx:445`;
  - `tests/unit/guards/slt73-nota-conciliacion.guardia.test.ts:63`;
  - `tests/components/CajaComposicionBarra.test.tsx:445`;
  - `tests/unit/descarga/libro-kardex-468.test.ts:276`.
- `specs/SLT-75-distrito-zona-unica/requirements.md`: Q1 → «la resuelve SLT-76» y Q3 → «cerrada:
  respaldos retirados en SLT-76».

**Test.** Los literales escritos a mano que ya existen siguen en verde (`wallet-satelites` R35,
`slt73-nota-conciliacion`, `CajaComposicionBarra`, `libro-kardex-468`). Mutación: cambiar una letra
de `CONCILIACION_ASIENTA_NOTA` → rojo. Criterio documental: `grep -ri provisional` en
`specs/SLT-73-*` y en esos cuatro tests da 0 líneas que se refieran a SLT-73.

---

## §9 Bloque 9 — Retirar los respaldos (R17-R20)

### §9.1 Migración `db/migrations/20261102090100_slt76_retirar_respaldos/`
`migration.sql`: un único bloque `DO $slt76$` (todo o nada):
```
DROP TABLE IF EXISTS respaldo.slt73_asientos;
DROP TABLE IF EXISTS respaldo.slt75_zona_distrito_duplicado;
BEGIN
  DROP SCHEMA IF EXISTS respaldo;              -- SIN CASCADE
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'slt76: el esquema respaldo conserva objetos de otra ficha; se deja';
END;
```
- Es el mismo sub-bloque que ya usan los `down.sql` de SLT-73 y SLT-75 (B1/m1 de SLT-75).
- No toca `public`: Prisma solo compara `public`, así que no hay drift, y `schema.prisma` no
  cambia.
- `down.sql`: un comentario que dice que los datos no se recuperan y un
  `DO $slt76$ BEGIN RAISE NOTICE 'slt76: los respaldos retirados no se recrean'; END $slt76$;`.
- **No recrea las tablas vacías (R20).** Si lo hiciera, el `down.sql` de SLT-73 encontraría su
  tabla y «devolvería» cero filas sin avisar. Volver al código anterior a SLT-73 dejaría los libros
  sin los asientos retirados: un agujero de dinero silencioso.

### §9.2 Qué hacen los `down.sql` de SLT-73 y SLT-75 cuando ya no hay respaldo
Editar un `down.sql` ya aplicado no causa drift: Prisma solo calcula el checksum de
`migration.sql` (comprobado en la review de SLT-75, vuelta 2).

| down.sql | Sin respaldo hace | Por qué |
|---|---|---|
| `20261031140200_slt73_retirar_asientos_satelite` | **Falla** con `RAISE EXCEPTION`: «slt73: el respaldo se retiró en SLT-76 (20261102090100); los asientos retirados no se pueden devolver. Revertir SLT-73 sin ellos dejaría los libros sin esos cierres». Va al principio del bloque `DO`, antes de cualquier escritura (R18). | Sin el respaldo, el código de antes de SLT-73 leería libros a los que les falta dinero. Parar es lo único seguro, y quien lo ejecute sabe por qué. |
| `20261101090000_zona_distrito_duplicados_sin_zona` | **No hace nada** y deja un `NOTICE` que nombra SLT-76. El `INSERT` y el `DROP TABLE` pasan a un `IF to_regclass(...) IS NOT NULL` dentro de un `DO`. El borrado del esquema solo si queda vacío no cambia (R19). | Las filas respaldadas eran los duplicados, es decir, el defecto. Sin ellas, el estado que queda es el que decidió Carlos. Bloquear la bajada no protege nada. |

Ninguno de los dos «revienta a medias»: el de SLT-73 falla antes de escribir y el de SLT-75 no
escribe. El de índice de SLT-75 (`20261101090100`) no lee el respaldo y no cambia.

### §9.3 Tests
- **Se borra** `tests/integration/db/respaldo-convivencia-slt73-slt75.test.ts`: mide la convivencia
  de dos tablas que dejan de existir, y su precondición («la base de test tiene los dos respaldos»)
  pasa a ser falsa. Lo sustituye:
- `tests/integration/db/slt76-retirar-respaldos-migration.test.ts` (transacción revertida y
  serializada). Antes de cada caso recrea las dos tablas con una fila cada una, que es el estado
  previo a SLT-76.
  - **R17:** tras `migration.sql`, `to_regclass` de las dos es `NULL` y el esquema no existe.
  - **R17 con objeto ajeno:** con `respaldo.slt76_test_ajena` y una fila, la migración no falla y el
    esquema sigue con esa tabla y su fila.
  - **R19:** el conteo y el `md5` de `zona_distrito` y de `wallet_movimiento` no cambian con la
    migración.
  - **R20:** el `down.sql` de SLT-76 no recrea ninguna tabla en `respaldo`, y el texto del archivo
    dice que los datos no se recuperan.
  - **R18:** sin respaldo, el `down.sql` de SLT-73 lanza un error cuyo mensaje contiene `SLT-76`, y
    `wallet_movimiento` queda igual. Se mide en un SAVEPOINT.
  - **R19:** sin respaldo, el `down.sql` de datos de SLT-75 no lanza error y `zona_distrito` queda
    igual.
  - Mutaciones:
    - `DROP SCHEMA … CASCADE` en la migración → rojo en «objeto ajeno»;
    - quitar el `RAISE` del down de SLT-73 → rojo en R18;
    - quitar el `IF` del down de SLT-75 → 42P01, rojo en R19.
- **Se ajustan:**
  - `slt73-migracion-retira-asientos.int.test.ts`: corre su propio `up` antes del `down`, que
    recrea la tabla, así que su R19 debe seguir en verde. Se actualiza el comentario de `:207-209`,
    que cita el test borrado.
  - `zona-distrito-unica-migration.test.ts`: el paso 1 («volver al estado anterior con los dos down
    reales») corre ahora contra una base sin respaldo, y con §9.2 es el camino «no hace nada».
    También se actualizan las afirmaciones sobre `respaldo.slt73_asientos` como objeto ajeno.

  El implementer corre los dos archivos y ajusta solo lo que el cambio rompa.

### §9.4 Verificación en prod (leader, solo lectura, antes del deploy)
Carlos pidió borrar «tras verificar en prod que SLT-73 y SLT-75 quedaron bien». El criterio de «bien»
no está escrito en ningún doc: lo fija el leader con Carlos. Lo que sí se anota en el PR son los
conteos de filas de las dos tablas y la lista de objetos del esquema `respaldo` (`pg_class` por
`relnamespace`), sin nombres ni datos de producción.

---

## §10 Lo transversal

- **Multi-empresa.** No hay tablas nuevas. El predicado de §2 y la escritura de §6 van por Prisma con
  el cliente de la transacción, así que la extensión inyecta la empresa y la RLS cubre. No hay
  excepción nueva en `EXCEPCIONES_SQL_A_MANO`.
- **Autorización.** No cambia. «Desmarcar» y «Corregir» siguen detrás de `puedeConciliar` (servidor,
  `esAccesoTotal`) y el servicio sigue devolviendo `forbidden` (R27 de la 431). La edición de zona
  sigue en `zonas.actualizarZona`. No hay módulo nuevo que encender.
- **Datos que dependen del país.**
  - La zona horaria sale de `lib/utils/fecha-cr.ts`, que hoy es fija (Q2 / SLT-42).
  - El texto del distrito (§6) sale de la geografía de la empresa.
  - El país de §7.4 sale de `organizacion.pais_id`.
- **Dependencias.** Ninguna nueva.
- **Migraciones.** Hay dos nuevas, posteriores a la última de `prod` (`20261101090100`), y las dos
  traen `down.sql`. Se editan dos `down.sql` ya aplicados (§9.2) y ningún `migration.sql`. Al
  sincronizar `prod` → `dev`, el leader comprueba que estas dos marcas de tiempo no quedan por detrás
  de una migración de `dev` que toque `historial_accion_tipo`. Si quedan, la bajada de SL-23 sigue
  funcionando porque no lleva lista fija.
- **Baseline.** No se añade nada a `tests/baseline-rojos.json`.
