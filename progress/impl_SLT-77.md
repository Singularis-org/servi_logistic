# SLT-77 — tope-intentos-por-empresa · bitácora de implementación

## Tanda 0 y Tanda A (2026-11-06)

Base de pruebas: `servi_gate_slt77`, local, con `migrate deploy` y `db:seed`. `current_database()` comprobado antes de cada
corrida. `.env`: existe, local, no es de Ordenex, no es Supabase (solo booleanos). Worktree sin más worktrees en paralelo al
generar Prisma.

### T0.2 — Migraciones

Última en `origin/dev`: `20261104150200_cobro_plataforma_porcentual_funciones`. Nombres, los de `tasks.md`:

- `20261106120000_historial_tope_intentos`
- `20261106120100_organizacion_tope_intentos`

### Archivos

Creados:

- `db/migrations/20261106120000_historial_tope_intentos/{migration,down}.sql`
- `db/migrations/20261106120100_organizacion_tope_intentos/{migration,down}.sql`
- `lib/repositories/_shared/tope-intentos-empresa.ts`
- `tests/integration/db/tope-intentos-migration.test.ts`

Modificados:

- `db/schema.prisma`, `lib/types/historial-accion.ts`, `lib/types/historial-accion-etiquetas.ts`
- Lista literal del enum: `caja-459`, `correccion-resultado-gestion`, `historial-accion-{cobro-tienda,conciliacion-bodega,orden-zona-reconciliada,pago-mensajero-ajustado,zona-pago-mensajero,zona-sinpe}-migration`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: 83 tipos, 31 entidades, 51 de dinero.
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: 83 tipos, y `tope_intentos_cambiado` en
  `ESCRITOR_PENDIENTE_EN_CURSO`. **T2.2 tiene que quitar esa entrada** al declarar su productor: la guardia se pone roja si no.

### Mapa R → test de esta tanda

Todos en `tests/integration/db/tope-intentos-migration.test.ts`:

| R | Test |
|---|---|
| R2 | `toda empresa que ya existia queda en 3`, `una empresa creada despues…nace en 3`, `no admite vacio`, `altaEmpresa no conoce el tope y la empresa nace con 3` |
| R6 | `el extremo 1` y `10 se admite`; `la base rechaza 0`, `11` y `-1`, en `UPDATE` e `INSERT` |
| R38 | `existen, traen down.sql…`; `el down deja la base como la lee el codigo anterior, y el up vuelve a dejarla igual` |

R1 lo cubrirá `tope-intentos-escritura` (T2.4). `leerTopeIntentosDeLaEmpresa` aún no tiene consumidor ni test propio: su R27 entra en
T2.4, y en esta tanda solo se exige typecheck (T1.3).

### Salida real

- `pnpm run typecheck`: exit 0.
- `eslint` de todos los archivos TS tocados: exit 0.
- `tope-intentos-migration.test.ts`: 12 pasados, 0 fallados, **0 saltados**.
- Los 16 archivos que el cambio toca o de los que depende, tras `related` y sobre la misma base: 308 pasados, 0 fallados, 0 saltados.
- `pnpm run test:guardias`: 331 archivos, 330 en verde y 1 en rojo; 4617 pasados, 4 fallados, 1 saltado.
  - Rojo: `dependencias-declaradas-presentes`, en `tests/baseline-rojos.json` desde 2026-10-21. `init.sh` no difiere de `origin/dev`.
  - Saltado: `recursos-origen-fuera`, R18, sin `RECURSOS_ORIGEN_REF`. No es por `HAY_BASE_DE_DATOS`.
- `vitest related` de los 4 archivos de código: 1062 archivos, 177 en rojo; 13634 tests, 12392 pasados, 157 fallados, 1085 saltados.
  - 176 de los 177 archivos rojos están en el baseline. Fuera de él, `tests/components/DetalleMensajeroPanel.test.tsx`, un caso de teclado.
  - Ese archivo no se tocó y aislado da 28 de 28. Se atribuye a la saturación de la corrida, sin más prueba que esa repetición.
  - 1059 de los saltos son de archivos en rojo del baseline y 26 de archivos que no están en rojo. **0 en los archivos que tocó esta tanda.**
  - `tope-intentos-migration` no entra en `related` porque no depende de esos archivos: se corrió aparte.
- `./init.sh` no se corrió: esta tanda cerró con typecheck, lint, tests y guardias sueltos. T7.4 lo exige al final.

### Mutaciones

Arnés fuera del repo: exige base verde sin saltos, cuenta tests desde el JSON de vitest, restaura y compara la huella del archivo tras
cada una, y compara `git status` al final. Base y final: 12 pasados, 0 fallados, 0 saltados.

| Mutación | Resultado | Test que debía caer | Cayeron |
|---|---|---|---|
| Control: `BETWEEN 1 AND 11` | Muere | R6, rechaza 11 | Ese (11 pasados, 1 fallado) |
| M1: `DEFAULT 3` a `DEFAULT 4` | Muere | R2, empresa existente | Ese, R2 empresa posterior y R38 (9 pasados, 3 fallados) |
| M2: sin `CHECK` | Muere | R6, rechaza 0 | R6 con 0, 11 y -1 (9 pasados, 3 fallados) |
| M3: `down.sql` sin `REVOKE` | Muere | R38, el down | Ese (11 pasados, 1 fallado) |

**Límite de M1:** el caso de `altaEmpresa` corre en la base del gate, ya migrada, y sigue verde con la mutación. M1 la matan los casos de
base propia. El caso de alta protege otra cosa: que el alta real no fije un tope distinto.

### Decisiones técnicas sin dictado en el spec

- `FuentesEtiqueta.organizacion`: etiqueta fija «Intentos de entrega», sin dato variable (R41), como `tarifa_activacion`. El design solo
  fijaba la etiqueta de la entidad, «Empresa», que va en `ENTIDAD_LABELS`.
- «Que el código anterior lee» (R38) se prueba con las columnas del modelo anterior, en una lista a mano, y con lecturas como `servi_app`,
  no con el cliente Prisma anterior, que no existe en la rama.
- Los comentarios de totales de `historial-accion.ts` estaban atrasados (81, 29, 49): pasan a 83, 31 y 51.

### Veredicto

Tanda 0 y Tanda A hechas: migraciones, lectura y sus tests en verde sin saltos, y las tres mutaciones mueren.

## Tanda B (2026-11-06)

Base: `servi_gate_slt77`, recreada con DROP/CREATE, `migrate deploy` (exit 0) y `db:seed` (exit 0) antes de la corrida final.
`current_database()` comprobado antes de cada corrida. Local, no Supabase; solo categorías impresas.

### Archivos

Creados:

- `lib/interfaces/repositories/ITopeIntentosRepository.ts`, `lib/interfaces/services/ITopeIntentosService.ts`
- `lib/repositories/TopeIntentosRepository.ts`, `lib/services/TopeIntentosService.ts`
- `tests/integration/db/tope-intentos-escritura.test.ts`, `tests/unit/services/tope-intentos-service.test.ts`

Modificados:

- `lib/types/tarifa-flexible.ts`, `lib/tarifas/servicios.ts`, `lib/actions/tarifas.ts`
- `lib/repositories/TarifasPantallaRepository.ts`, `lib/services/TarifasPantallaService.ts`, `lib/interfaces/{repositories/ITarifasPantallaRepository,services/ITarifasPantallaService}.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: censo con `TopeIntentosRepository.guardar`; `ESCRITOR_PENDIENTE_EN_CURSO` queda vacío.
- `tests/unit/guards/tope-intentos-pii.guardia.test.ts`, `tests/unit/types/tarifa-schemas.test.ts`, `tests/integration/actions/tarifas-action.test.ts`, `tests/unit/services/tarifas-pantalla-service.test.ts`, `tests/unit/tarifas/servicios-composicion.test.ts`
- `tests/components/{TarifasModulo,TarifasDisposicion}.test.tsx`: solo `topeIntentos: 3` en su fixture tipada, porque el typecheck la exige. El resto de T5.2 sigue pendiente.
- `tests/integration/db/tope-intentos-migration.test.ts`: `pg_constraint` acotado al esquema (hallazgo 3).

### Composition root

`serviciosDeTarifas` construye `TopeIntentosService` con `TopeIntentosRepository(prisma)`, y `TarifasPantallaService` lee del repositorio que ya recibe.
Lo comprueban `servicios-composicion` (instancia, cliente y llamada que llega al cliente) y, sin dobles, dos casos de `tope-intentos-escritura` que
llaman a `guardarTopeIntentos` y `cargarPantallaTarifas` sin `servicio` en las deps: montan su fábrica con `getPrismaClient()` y commitean.

### Mapa R → test de esta tanda

En `tests/integration/db/tope-intentos-escritura.test.ts`, salvo que se diga otro:

| R | Test |
|---|---|
| R1 | `la columna es entera…`; `el maestro guarda el extremo 1` y `10`; `0`, `11`, `2.5 no llega a la base` |
| R3 | `guarda en la empresa del contexto`; `una entrada que nombra la otra empresa se rechaza`; `la action, por su fabrica real`; `tarifas-action`: `R3: una entrada que nombra otra empresa` |
| R4 | `tope-intentos-service`: `solo el maestro guarda` (con entrada inválida y con el getter trampa: el rol antes que el input); `tarifas-action`: `R4`; aquí `R4: el admin de la empresa` |
| R5 | `tarifa-schemas`: `guardarTopeIntentosSchema` (1, 2, 10, 0, 11, -1, 2,5, texto, null, ausente, clave de más); `tope-intentos-service`: `el valor se valida`; `tarifas-action`: `R5` |
| R7 | `guardar en A no cambia B`; `UPDATE de la fila de B…no afecta filas`; `UPDATE sin WHERE…solo la fila de A`; `nombre`, `es_demo`, `plan_id`, `slug`, `cobro_plataforma_por_orden`: 42501; `no crea ni borra empresas`; `lo que la app puede escribir` |
| R8 | `una orden con 2 intentos ya agotada…`: 2 intentos reales por `contarIntentosVigentes`, conteos literales y foto de filas iguales en las 6 tablas |
| R9 | `sin tarifa_activacion`, `con tarifa_activacion`: 3, 2 y 1 seguidos, cada uno leído y aplicado por `alcanzaElTope` |
| R10 | `deja quien, el anterior y el nuevo`; `cada cambio toma como anterior…`; `si el historial falla, el tope no cambia`; `dos guardados a la vez` |
| R11 | `responde ok, sin historial y sin tocar la fila` |
| R12, R13, R14 (servidor) | `la pantalla, por su fabrica real`; `tarifas-pantalla-service`: `el tope en la pantalla`. La parte de componentes es de la Tanda E |
| R27 | `la lectura sin contexto`, `la lectura en plataforma`, `la pantalla en plataforma`, `guardar sin contexto`, `guardar en plataforma`, `la action en plataforma`. La parte de procesos automáticos es de la Tanda C |
| R41 | `deja quien…` (fila literal); `tope-intentos-pii.guardia`: `los textos fijos del rastro` |

### Salida real

- `pnpm run typecheck`: exit 0.
- `eslint` de los archivos de código tocados y de los 12 de test de abajo: exit 0.
- Los 12 archivos de test de la tanda, sobre la base recreada: **432 pasados, 0 fallados, 0 saltados**. `tope-intentos-escritura`: 38 pasados, 0 saltados.
- `vitest related` de los 7 archivos de código con lógica: 25 archivos, **726 pasados, 0 fallados, 0 saltados**.
- `pnpm run test:guardias`: 331 archivos, 330 en verde y 1 en rojo; 4621 pasados, 4 fallados, 1 saltado.
  - Rojo: `dependencias-declaradas-presentes`, el mismo del baseline, ya descrito en la Tanda A.
  - Saltado: `recursos-origen-fuera`, R18, sin `RECURSOS_ORIGEN_REF`.
- `./init.sh` no se corrió: lo exige T7.4.
- Retornos de carro en los archivos cambiados: 0.

### Mutaciones

Arnés fuera del repo: exige base verde sin saltos, cuenta tests desde el JSON de vitest, restaura y compara la huella tras cada una, y compara `git status` al final.
Corre 7 archivos: base 309 pasados, 0 fallados, 0 saltados; igual al terminar. Árbol y huellas iguales. Sin gate en paralelo.

M2 y M3 no editan el archivo de migración: aplican ese SQL en una copia de la base (`CREATE DATABASE … TEMPLATE`), que se suelta después. La base del gate no se muta.

| Mutación | Resultado | Fallados de 309 | Test nombrado que cae |
|---|---|---|---|
| Control: máximo 11 en el schema | Muere | 6 | `rechaza 11 en el campo tope` |
| M1: sin comprobación de rol | Muere | 17 | R4, en servicio, action y Postgres |
| M2a: `USING (true)`, `WITH CHECK` intacto | Muere | 1 | R7, `UPDATE sin WHERE` |
| M2b: `USING (true) WITH CHECK (true)` | Muere | 1 | R7, `UPDATE sin WHERE` |
| M3: `GRANT UPDATE` sobre toda la tabla | Muere | 6 | R7, las 5 columnas en 42501 y la lista de privilegios |
| M4: sin `appendAccion` | Muere | 8 | R10; también la guardia del censo y la composición |
| M5: sin la rama de «igual al vigente» | Muere | 1 | R11 |
| M6: `organizacion.findFirst()` | Muere | 5 | R27, `la lectura en plataforma`, en caso propio; también sin contexto y la pantalla |

### Hallazgos

1. **T2.4 tal como está escrita no mata la mutación 2.** Con un `WHERE` que nombra columnas, Postgres suma la política de SELECT como filtro, y `UPDATE … WHERE id = B` da 0 filas aunque la de UPDATE sea
   `USING (true)`. Se añadió `UPDATE sin WHERE`, con un literal en el `SET`, que es el único caso que la mata. El caso de T2.4 se conserva.
2. **`superficie-de-uso` se pone roja al exportar la action sin pantalla.** `guardarTopeIntentos` lleva `@sin-superficie` hasta la Tanda E. **T5.1 debe borrar esa nota**: la misma guardia se pone roja si sobrevive.
3. **`catalogo-postgres-acota-esquema` se puso roja por la Tanda A:** `tope-intentos-migration.test.ts:278` ya tenía el `pg_constraint` sin acotar en `ad372c0e`, aunque el informe de A no lo recoge. Corregido aquí.
4. **El molde `cierre-sin-gestion-tope-sql-real` no ejecuta nada en esta base:** 0 pasados, 9 saltados, y está en el baseline. Pide el estado `devolucion_por_confirmar`, que no existe en el catálogo. **Para T3.4 no sirve copiarlo tal cual.**

### Decisiones técnicas sin dictado en el spec

- `guardarTopeIntentos` también responde `unauthenticated`, que `design §4.1` no enumera: es el contrato de todas las actions del módulo, y R14 pide no responder sin sesión.
- Un caso extra de R10, `dos guardados a la vez`, mide el cerrojo de `design §2.3`. Afirma los dos órdenes posibles. No tiene mutación propia: sin cerrojo fallaría solo si los dos guardados se solapan.

### Veredicto

Tanda B hecha: guardar y leer el tope con su rastro, por el composition root real, con 0 saltos en lo que toca, y las seis mutaciones y el control mueren.

## Tanda C (2026-11-06)

Base: `servi_gate_slt77`, recreada con DROP/CREATE, `migrate deploy` (exit 0, 306 migraciones) y `db:seed` (exit 0) antes de la corrida final, con
`current_database()` comprobado. Las mutaciones corrieron antes de recrearla, sobre la misma lista de migraciones.

### Archivos

Creados: `tests/integration/db/tope-intentos-caminos.test.ts`, `tests/unit/guards/tope-intentos-sin-valor-global.guardia.test.ts`.

Borrados: `lib/config/reintentos.ts`, `tests/unit/config/reintentos.test.ts`.

Modificados:

- Lectura: `I/OrdenHistorialRepository`, `I/CierresAdminRepository` (`leerTopeIntentos`), `I/OrdenHistorialService` (`topeIntentos`, `umbral: number | null`).
- Los 10 servicios de `design §3`. `MisAsignacionesService` tiene dos puntos: lista y gestión.
- Comentarios que citaban la configuración o una ley: `lib/config/{devolucion-sla,jobs,ranking}.ts`, `lib/types/{order-status,tope-intentos}.ts`, `IMisAsignacionesService`, `e2e/reintentos-escalado.spec.ts`.
  En `tope-intentos.ts` también las líneas 16 a 18, además de la 57 que dice `design §3`: nombraban lo retirado.
- Tests: el doble compartido `tests/fixtures/intentos-entrega.ts` (tope por parámetro, 3 por defecto), los dobles de los repositorios y los literales a mano. Los casos que movían la variable de entorno
  ahora miden un tope 5 del doble.

### Composition root

`handleProcesarDevueltasSla` corre sin `service` en las deps: `buildService` real, `getPrismaClient()` y `paraCadaEmpresa` real. Lo único inyectado es el secreto, el reloj y `empresas`, que envuelve el
`findMany` real para acotarlo a las empresas del caso (la base es compartida, como en `dos-empresas-entradas`) y añade una empresa sin fila para R27. Ningún constructor cambió: un doble sin `topeIntentos` no compila.

### Mapa R → test de esta tanda

En `tests/integration/db/tope-intentos-caminos.test.ts`, salvo que se diga otro. Empresas A (tope 2) y B (tope 4), con 2 intentos por `gestionar`, `solicitarCierre` y `aprobar` reales.

| R | Test |
|---|---|
| R18 | `el panel del mensajero`, `la ayuda de la tienda`: motivo de tope en A, sin fila; B acepta |
| R19 | `A responde conflict y la orden no se mueve; B la reprograma` |
| R20 | `bodega central`, `bodega satelite`, con lote mixto |
| R21 | `en A, rechazo con gestion sintetica y cobro en el siguiente cierre; en B, a bodega sin cobro` |
| R22 | `wrong_number sin vencer`, `not_found vencida`, `bajar el tope escala la orden en la corrida siguiente` |
| R23 | `con la misma novedad, A habla sin plazo y B promete sus cinco dias` |
| R24 | `MisAsignaciones`, `Novedades` |
| R25 | `maestro, admin, adminTienda y adminSatelite reciben 2 en A y 4 en B`; `orden-historial-service`: `R25` |
| R26 | `A escala y B espera en la misma corrida` |
| R27 | `la empresa cuyo tope no se lee no frena a las demas`; `una gestion que dependeria del tope no se registra` |
| R28 | `su primera gestion no puede ser reprogramado ni novedad` |
| R29 | `con 2 intentos: en 2 nada; en 3 ya se asigna; en 4 ya admite la gestion` |
| R30 | `los mismos conteos, en literales, antes y despues de moverlo dos veces` |
| R31, R40 | `tope-intentos-sin-valor-global.guardia` |
| R32 | `al mensajero le llega null`; `orden-historial-service`: `R32`; `intentos-entrega.test.tsx` |
| R33 | `tests/unit/types/tope-intentos.test.ts`, sin cambios |

**Dinero.** `cobroRechazado` se mide en el siguiente cierre del mensajero, pedido por el servicio: `total_ingreso_bodega_rechazos` y el `ingreso_bodega_rechazo` de la gestión sintética valen `164.00`, a mano, la tarifa
sembrada en la zona. En B no hay gestión sintética. **Límite:** no se aprueba ese siguiente cierre, y no se mide nada aguas abajo del importe congelado. El E2E de T6.1 lo recorre.

**Dos fixtures en vez de flujo real.** `colocar` mueve la orden entre intentos y al estado de partida, lo que harían la liberación y la asignación. El caso del cron siembra sus 2 intentos con cierres `aprobado` escritos a mano,
porque commitea.

### Salida real

- `pnpm run typecheck`: exit 0.
- `eslint` de los archivos TS tocados: exit 0.
- Batería de la tanda, sobre la base recreada: 10 archivos, **159 pasados, 0 fallados, 0 saltados**. `tope-intentos-caminos`: 19 pasados, 0 saltados. `tope-intentos-escritura`: 38. `tope-intentos-migration`: 12.
  `tope-intentos-sin-valor-global`: 6. `tope-intentos-pii`: 8. `tope-intentos.test.ts`: 6. `intentos-entrega.test.tsx`: 21. `orden-historial-service`: 30. `procesar-devueltas-sla-route`: 7. `dos-empresas-entradas`: 12.
- `vitest related` de los archivos de `lib/` tocados: 1501 archivos, 182 en rojo; 20335 tests, 19089 pasados, 139 fallados, 1107 saltados.
  - **Los 182 archivos rojos están en el baseline; 0 fuera.**
  - 1081 saltos son de archivos del baseline y 26 de `AnaliticaPage` y `AnaliticaShell`, que esta tanda no tocó.
  - **No verificados en esta base:** `484-puntero-aprobacion-sql-real`, `454/caracterizacion/tope-276` y `455/caracterizacion/intentos-y-tope`. Se les cambió `reintentosConfig` por un `3` a mano, y siguen en rojo y saltados por el baseline.
- `pnpm run test:guardias`, con el borrado ya en el índice: 332 archivos, 331 en verde y 1 en rojo; 4627 pasados, 4 fallados, 1 saltado. Rojo: `dependencias-declaradas-presentes`, el del baseline. Saltado: `recursos-origen-fuera`, R18.
  - Con el borrado sin añadir al índice, `catalogo-postgres-acota-esquema` cae con ENOENT: recorre los archivos que git sigue. Un `git add` lo resuelve.
- `./init.sh` no se corrió: lo exige T7.4.
- Retornos de carro en los archivos cambiados: 0.

### Mutaciones

Arnés fuera del repo: exige base verde con tests ejecutados y sin saltos, cuenta desde el JSON de vitest, restaura y compara la huella tras cada una, y compara `git status` al final. Corre 3 archivos (`caminos`, `escritura`,
`orden-historial-service`). Base y final: 87 pasados, 0 fallados, 0 saltados. `git status` igual. Sin gate en paralelo.

| Mutación | Resultado | Fallados de 87 | Test nombrado |
|---|---|---|---|
| Control: lectura del tope + 1 | Muere | 15 | R18 a R29 |
| M1a: `MisAsignaciones`, lista, a 3 | Muere | 2 | R24, `MisAsignaciones`: cae |
| M1b: `MisAsignaciones`, gestión, a 3 | Muere | 4 | R18, panel: cae |
| M2: `GestionDesdeAyuda` a 3 | Muere | 1 | R18, ayuda: cae |
| M3: `Novedades` a 3 | Muere | 1 | R24, `Novedades`: cae |
| M4: `ReprogramacionTienda` a 3 | Muere | 1 | R19: cae |
| M5: `GuiaAsignacion` a 3 | Muere | 2 | R20, central: cae |
| M6: `AsignacionSatelite` a 3 | Muere | 1 | R20, satélite: cae |
| M7: `AvisosDiarios` a 3 | Muere | 1 | R23: cae |
| M8: `DevolucionSla` a 3 | Muere | 4 | R22 y R26: cae |
| M9: `OrdenHistorial` a 3 | Muere | 4 | R25: cae |
| M10: `CierresAdmin` a 3 | Muere | 1 | R21: cae |
| M11: `umbral` también para `mensajero` | Muere | 2 | R32: cae |
| M12: `LIMIT 1` sin `WHERE` | Muere | 3 | **R26: NO cae.** Caen R27 (la gestión sin empresa, la lectura y la pantalla en plataforma) |

Guardia de T3.5, en arnés aparte con 6 tests por corrida: el código que nombra la configuración, la lectura de la variable, la columna en un tercer archivo, y «por ley» o «cota legal» en `lib/` y en `tests/`. Las 5 mueren.

### Hallazgos

1. **La mutación 3 de `tasks.md` no puede morir en R26.** Dentro de `paraCadaEmpresa` la consulta corre como `servi_app`, y la RLS de `organizacion` solo le deja ver su fila: con o sin `WHERE` da lo mismo. La diferencia solo existe como dueño, sin empresa, y ahí la mata R27.
   Se añadió ese caso a `caminos`. El `WHERE` sigue siendo necesario, pero no es lo que separa a A de B.
2. **T3.2 queda a medias en el navegador.** `HistorialOrdenSheet` no se tocó, y no rompe el typecheck porque una plantilla admite `null`. A un `mensajero` le pintaría «Intento 2 de null», aunque hoy no monta esa pantalla. El servidor ya cumple R32. Queda como T5.3.
3. **Un `conflict` no prueba el tope.** `tienes otra orden activa` da el mismo estado, y pasó en R28 al primer intento. Los casos afirman el motivo, no solo el estado.
4. **`prepararMundo` de la 454 no corre en una base recién migrada:** pide una orden ya sembrada. Cada empresa monta su `Mundo` y reutiliza `crearEscenario`. Los intentos usan `reprogramado`, que no pide los estados retirados.

### Desviaciones del proceso

- **Se imprimió una URL.** El primer script auxiliar falló al parsear `DATABASE_URL`, y el error de Node mostró la URL local con su contraseña en la salida de la herramienta. No está en el repo. Se corrigió para que solo imprima categorías. Va al leader, que decide si la rota.
- **18 rutas de tests se añadieron a `## Archivos esperados` después de tocarlas**, no antes: las destapó el typecheck y la corrida de `related`. Las de `lib/config/` y `order-status` sí fueron antes.

### Veredicto

Tanda C hecha en el servidor: cada punto decide con el tope de su empresa, con 0 saltos y las 12 mutaciones y el control muertos. M12 muere por R27, no por R26, y el componente del historial pasa a T5.3.
