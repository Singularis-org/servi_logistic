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

## Tanda D (2026-11-06)

Base: `servi_gate_slt77`, recreada con DROP/CREATE, `migrate deploy` (exit 0) y `db:seed` (exit 0) antes de la corrida final, con `current_database()` comprobado. Las mutaciones corrieron antes, sobre la misma lista de migraciones. Solo categorías impresas; ninguna URL en la salida.

### Archivos

Creado: `tests/integration/db/tope-intentos-carreras.test.ts`. Sus helpers son los de `tope-intentos-caminos`, recortados: se copiaron para no mover un archivo ya verificado con mutaciones.

Modificados:

- `lib/interfaces/repositories/IDevolucionSlaRepository.ts`, `lib/repositories/DevolucionSlaRepository.ts`, `lib/services/DevolucionSlaService.ts`: `vetoPorTope`.
- `lib/repositories/CierresAdminRepository.ts`: `Math.max` junto al conteo.
- `tests/unit/services/devolucion-sla-tope-wrong.test.ts`: quién lleva el veto, con literales.
- `tests/unit/repositories/cierres-admin-repository.test.ts`, `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts`: `$queryRaw` en el doble de la transacción. Añadidas a `## Archivos esperados` antes de tocarlas.

### Mapa R → test de esta tanda

En `tests/integration/db/tope-intentos-carreras.test.ts`. El tope cambia dentro de la lectura, por el `TopeIntentosService` real.

| R | Test |
|---|---|
| R34 | `el tope baja tras la lectura…`, `el tope sube tras la lectura…`, con dos órdenes y una sola lectura de la corrida |
| R35 | `wrong_number sin vencer`, `not_found vencida`, `wrong_number con la ventana vencida`, `si el tope sube pero la orden sigue agotada`, `aprobacion: las dos barridas`; `devolucion-sla-tope-wrong`: `SLT-77 R35` |
| R36 | `proceso: no rechaza en esa corrida, y la siguiente si`, `aprobacion: va a bodega con el mayor…su siguiente paso ya la frena` |
| R37 | `con 1 y con 50 candidatas`: 1; `con 3 rechazos`: 4; `ventana vencida`: 1; `la aprobacion`, con 1 y 3 barridas: 2 |

**Dinero en R35 y R36.** Cada caso sin rechazo afirma: sin gestión sintética (`[]`), 0 filas de `escalado_devuelta_sla` o `rechazo_tope_intentos` en el historial de estados, y el importe del siguiente cierre pedido por el servicio. Ese importe es `0.00` en el proceso (la novedad entra al cierre, sin rechazo) y `sin cierre` en la aprobación. Los casos con rechazo dan `164.00`.

**Las lecturas de R37** se cuentan en `leerTopeIntentosDeLaEmpresa`, envuelta sin cambiarla: son consultas de verdad, no llamadas a un doble.

### Ventana residual, declarada y no probada

Si el tope sube entre la relectura y el `COMMIT`, la orden se rechaza y cobra con el tope anterior (`design §6.2`). Dura lo que queda de la transacción. Cerrarla exige el cerrojo que `design §7.5` descarta, y no se usó.

### Salida real

- `pnpm run typecheck`: exit 0.
- `eslint` de los 8 archivos TS tocados: exit 0.
- Batería, sobre la base recreada: 16 archivos, **280 pasados, 0 fallados, 0 saltados**. `tope-intentos-carreras`: 13. `caminos`: 19. `escritura`: 38. `migration`: 12. `devolucion-sla-tope-wrong`: 17. `cierres-admin-repository`: 56. `cierres-admin-service.aprobar.sin-gestion`: 11.
- `vitest related` de los 4 archivos de `lib/`: 432 archivos, 124 en rojo; 5031 tests, 4244 pasados, 49 fallados, 738 saltados.
  - **Los 124 archivos rojos están en el baseline; 0 fuera.** Ninguno falla por `$queryRaw`.
  - Saltos fuera de archivos rojos: `AnaliticaPage` y `AnaliticaShell`, que esta tanda no tocó.
- `pnpm run test:guardias`: 332 archivos, 331 en verde y 1 en rojo; 4627 pasados, 4 fallados, 1 saltado. Rojo: `dependencias-declaradas-presentes`, el del baseline. Sin rojos nuevos.
- `./init.sh` no se corrió: lo exige T7.4.
- Retornos de carro en los archivos cambiados: 0, contados por bytes.

### Mutaciones

Arnés fuera del repo: exige base verde con tests ejecutados y sin saltos, cuenta desde el JSON de vitest, restaura y compara la huella tras cada una, y compara `git status` al final. Corre `tope-intentos-carreras`. Base y final: 13 pasados, 0 fallados, 0 saltados. `git status` igual. Sin gate en paralelo.

| Mutación | Resultado | Fallados de 13 | Test nombrado |
|---|---|---|---|
| Control: lectura del tope + 1 | Muere | 10 | R34, R35, R36 |
| M1: sin el veto | Muere | 3 | R35: cae. También R34, `sube` |
| M2: `Math.min` | Muere | 2 | R35 y R36, los dos de aprobación |
| M3: veto también al vencer la ventana | Muere | 2 | R35: cae. También R37, `ventana vencida` |
| M4: el tope se lee en el bucle | Muere | 4 | R34, los dos, y R37: caen |

### Hallazgos y límites

1. **`Math.max` solo lee si hay barridas.** `design §6.1` lo escribe sin condición. Sin barridas no hay nada que decidir, y así no se añade una consulta a cada aprobación. Sigue «junto al conteo», que ya tenía la misma condición.
2. **La relectura de la aprobación no corre aquí con el cliente real.** Todos los casos usan una sola conexión de test. La del proceso sí: el caso de R26 de `caminos` escala por `handleProcesarDevueltasSla` con `getPrismaClient()`. La de la aprobación la recorre el E2E de T6.1.
3. **R36 con `not_found` vencida se libera, no se resuelve en un rechazo.** Si el tope baja tras la lectura, una orden por debajo del leído va a bodega y allí queda agotada con el nuevo: no cobra y queda parada, que es lo que acepta P1. Se sigue de `design §6.2` y no tiene caso propio en el proceso; el de aprobación mide ese mismo final.
4. **Un fallo al releer en el proceso cuenta como omitida**, por el `catch` de cada orden: sin efectos, y la corrida sigue. R27 pide fallar sin efectos, y lo cumple por orden, no por corrida.

### Veredicto

Tanda D hecha: las carreras de R34 a R37 yerran hacia no cobrar, con 0 saltos, las cuatro mutaciones y el control muertos, y la ventana residual declarada.

## Tanda E (2026-11-06)

Base: `servi_gate_slt77`, con `current_database()` comprobado antes de cada corrida. Solo categorías impresas; ninguna URL en la salida.

### Archivos

Creados: `app/(app)/configuracion/tarifas/_components/TarifasTopeIntentos.tsx`, `tests/components/TarifasTopeIntentos.test.tsx`.

Modificados:

- `app/(app)/configuracion/tarifas/_components/{TarifasModule.tsx,tarifas-textos.ts}`, `app/(app)/ordenes/_components/HistorialOrdenSheet.tsx`.
- `lib/actions/tarifas.ts`: solo se borra la nota `@sin-superficie`.
- `tests/components/{TarifasModulo,TarifasDisposicion,HistorialOrdenSheet}.test.tsx`, `tests/unit/app/tarifas/TarifasPage.test.tsx`.
- `tasks.md`: T5.1 a T5.3 marcadas; `tests/components/HistorialOrdenSheet.test.tsx` añadido a `## Archivos esperados` antes de tocarlo.

`tests/fixtures/tarifas-pantalla.ts` no cambia, aunque T5.2 lo nombra: no define la pantalla, y las fixtures tipadas ya llevaban `topeIntentos`.

### Mapa R → test de esta tanda

En `tests/components/TarifasTopeIntentos.test.tsx`, salvo que se diga otro:

| R | Test |
|---|---|
| R12 | `R12 — el maestro` (título, ayuda, vigente, botón; opciones 1 a 10; guarda el número elegido); `TarifasModulo`: con zonas, sin zonas y con la zona abierta borrada; `TarifasDisposicion`: va tras los mensajeros; `TarifasPage`: llega al módulo |
| R13 | `R13 — el admin`; `TarifasModulo`: `puedeEscribir` falso |
| R14 | `TarifasPage`: `R14`. El servidor, ya en `tarifas-pantalla-service` (Tanda B) |
| R15 | `R15: al elegir menos…ANTES de guardar` (sin llamada a guardar); `de 5 a 4 también avisa` |
| R16 | `sin elegir nada`, `al elegir más`, `al volver al guardado`, `guardado el valor menor…`, `el admin no lo ve nunca` |
| R17 | `R17 — si guardar falla` (5 causas, conserva el valor y el aviso; reintento); `R17 — lo que no pueden decir sus textos`; `TarifasDisposicion`: alto de 44, sin desbordar por clases, y sin hex por el barrido de archivos |
| R25, R32 (componente) | `HistorialOrdenSheet.test.tsx`: `SLT-77 R25`, `SLT-77 R32` (T5.3) |

### Salida real

- `pnpm run typecheck`, con `--max-old-space-size=8192`: exit 0.
- `eslint` de los 10 archivos TS tocados: exit 0.
- Tests tocados: 6 archivos, **102 pasados, 0 fallados, 0 saltados**. `TarifasTopeIntentos`: 24. `TarifasModulo`: 32. `TarifasDisposicion`: 23. `TarifasPage`: 9. `HistorialOrdenSheet`: 11. `gestion-pendiente`: 3.
- `vitest related` de los 4 archivos de presentación: 53 archivos, **745 pasados, 0 fallados, 0 saltados**. `lib/actions/tarifas.ts` no entra en esa lista: solo cambia un comentario.
- `pnpm run test:guardias`: 332 archivos, 331 en verde y 1 en rojo; 4627 pasados, 4 fallados, 1 saltado. Rojo: `dependencias-declaradas-presentes`, el del baseline. `superficie-de-uso`, en verde sin la nota.
- `./init.sh` no se corrió: lo exige T7.4.
- Retornos de carro en los archivos cambiados: 0, contados por bytes.

### Mutaciones

Arnés fuera del repo: exige base verde con tests ejecutados y sin saltos, cuenta desde el JSON de vitest, exige el mismo total en cada corrida, restaura y compara la huella tras cada una, y compara `git status` al final. Corre `TarifasTopeIntentos`, `TarifasModulo` e `HistorialOrdenSheet`. Base y final: 67 pasados, 0 fallados, 0 saltados. `git status` igual. Sin gate en paralelo.

| Mutación | Resultado | Fallados de 67 | Test nombrado |
|---|---|---|---|
| Control: opciones de 1 a 9 | Muere | 1 | R12, `elige de 1 a 10` |
| M1: aviso siempre | Muere | 6 | R16: cae |
| M2: sin aviso al bajar | Muere | 9 | R15: cae |
| M3: control con `puedeEscribir` falso | Muere | 4 | R13: cae, también SLT-54 R55 |
| M4a: limpia lo elegido si responde fallo | Muere | 5 | R17: cae |
| M4b: limpia lo elegido si la llamada revienta | Muere | 1 | R17: cae |
| Extra: aviso con `<=` | Muere | 4 | R16, `sin elegir nada` |
| Extra: no actualiza lo guardado al responder ok | Muere | 1 | R16, `guardado el valor menor` |
| Extra: sin la sección en empresa sin zonas | Muere | 1 | R12, `una empresa sin zonas` |
| Extra: T5.3, texto con «de null» | Muere | 1 | `SLT-77 R32` |
| Extra: T5.3, nombre accesible con «de null» | Muere | 1 | `SLT-77 R32` |

M4 son dos porque la sección tiene dos caminos de fallo.

### Decisiones técnicas sin dictado en el spec

1. **La sección se monta también sin zonas y con la zona abierta borrada.** `TarifasModule` tiene dos retornos anticipados antes de su final. Poniéndola solo «al final», como dice `design §4.2`, una empresa recién creada no la vería, y R12 no lo admite.
2. **Dos textos nuevos fuera de `design §4.2`:** el botón «Guardar» y la confirmación «Intentos de entrega guardados.». El spec no los fija y hacen falta. **Va a Carlos, que aprobó los de §4.2.**
3. **Errores con textos ya existentes de la pantalla:** «No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo.» y «No tienes permiso para cambiar este valor.». «Digitado» encaja regular con un selector; se prefirió no inventar otro.
4. **Guardar se deshabilita si lo elegido es lo vigente,** como `TarifasValores`. R11 sigue en el servidor; la pantalla no lo alcanza.
5. **Nombre accesible con `umbral` `null`: «Intento 2»,** como pide T5.3, y no «Intentos de entrega: 2».
6. **La sección refresca con `useRouter` propio,** para quedarse con las props `tope` y `puedeEscribir` de `design §4.2`. Guarda en estado lo que respondió la action: el aviso no depende de que llegue la recarga.

### Límites

- jsdom no mide: los 390 px, los 44 px y el contraste del aviso en claro y oscuro solo quedan atados por clases. Los miden T6.1 y T6.3.
- `TarifasPage`, R14: la página nunca ha pintado el número en esos casos, así que el test protege de que empiece a hacerlo, sin mutación propia. El corte real de R14 está en el servidor.

### Veredicto

Tanda E hecha: sección con sus textos y el badge sin «de null», con 0 saltos, las cuatro mutaciones y el control muertos. Dos textos fuera de §4.2 pendientes de que los vea Carlos.

## Tanda F (2026-11-06)

Base: `servi_gate_slt77`, recreada con DROP/CREATE, `migrate deploy` (exit 0) y `db:seed` (exit 0) antes de la primera corrida de `dinero` y otra vez antes de T6.2, con `current_database()` dentro de cada log. App por `next start`, con el `next build` del código de `daecf7b3`, que el E2E no cambia. Un solo servidor. Solo categorías impresas; ninguna URL en la salida.

### Archivos

Creados: `e2e/tope-intentos-por-empresa.spec.ts`, `progress/capturas/SLT-77/*.png` (8, añadidas a `## Archivos esperados` antes de escribirlas).

Modificados: `playwright.config.ts` (el spec en `dinero`), `tasks.md`.

`e2e/reintentos-escalado.spec.ts` no cambia: el comentario de «umbral legal» se corrigió en la Tanda C. Quedan 0 archivos de `e2e/` con «umbral legal», «por ley» o «cota legal».

### Mapa R → test de esta tanda

En `e2e/tope-intentos-por-empresa.spec.ts`. Empresas A y B idénticas; tarifa del mensajero 1.500 y 900, a mano en la cabecera.

| R | Caso |
|---|---|
| R2, R12 | `paso 1`: las dos ven 3, en pantalla y en la base |
| R8, R15, R16 | `paso 2`: el aviso antes de guardar, con el 3 aún en la base; se va con 4; foto de órdenes y conteos iguales en A y en B |
| R10 | `paso 5`: dos filas en `/historico/acciones`, 3→2 y 2→3, con el nombre del maestro; ninguna en B |
| R13, R14, R4 | `paso 6`: el admin lee sin control ni botón; la acción del maestro con su sesión da `forbidden`; el mensajero recibe el aviso de permiso y no ve la sección |
| R17 | `paso 7`, por ancho y tema |
| R20 | `paso 4`: en A el modal no asigna y la orden no se mueve; en B se asigna |
| R21, R35, R36 | `aprobar por la app relee el tope`: A rechaza, B va a bodega, las dos por `/cierres-admin` |
| R22, R26 | `paso 3`: la misma corrida escala A y no B; 900 en el siguiente cierre, en pantalla y en la base |
| R24, R25, R32 | `la línea de tiempo…`: «Intento 2 de 2» y «2 de 3»; panel de A sin «Reprogramar» ni «Devolver», y B los ofrece; respuestas sin el número |
| R29 | `paso 5`: subido a 3, la misma orden se asigna |

**El hueco de la Tanda D, cubierto a medias.** La aprobación corre por la pantalla, con la sesión del maestro y el cliente real de la app. Las barridas de A y B entran en la rama que relee (`idsBarridas.length > 0`), la aprobación responde bien y cada una llega a su desenlace. **Límite:** el tope no cambia durante esa aprobación. Queda probado que la relectura funciona con el cliente real, no la carrera, que sigue medida solo en `tope-intentos-carreras`.

**R32, sin lector ciego.** Dentro de un documento, el JSON va escapado, y la primera versión del lector habría pasado aunque viajara `umbral`. Se quitan las barras antes de buscar, y el caso exige ver `"enElTope":true` en A y `false` en B.

### Salida real

Log completo a archivo, con `INIT_EXIT=$?` dentro.

| Corrida | Base | passed | failed | skipped | flaky | exit |
|---|---|---|---|---|---|---|
| `--project=dinero`, 1.ª | recreada | 72 | 0 | 0 | 0 | 0 |
| `--project=dinero`, 2.ª | la misma | 72 | 0 | 0 | 0 | 0 |
| `--project=reparto`, `reintentos-escalado` | recreada | 2 | 0 | 0 | 0 | 0 |
| `--project=aislamiento`, `dos-empresas-humo`, con `plataforma-vacia` | la misma | 18 | 0 | 0 | 0 | 0 |

De los 72, 12 son de este spec.

- `pnpm run typecheck`, con `--max-old-space-size=8192`: exit 0. `eslint` del spec y de `playwright.config.ts`: exit 0.
- `pnpm run test:guardias`: 332 archivos, 331 en verde y 1 en rojo; 4627 pasados, 4 fallados, 1 saltado. Rojo: `dependencias-declaradas-presentes`, el del baseline. `e2e-sin-saltos`, en verde con el spec nuevo.
- Retornos de carro en lo escrito: 0, contados por bytes.
- `./init.sh` no se corrió: lo exige T7.4.

### T6.3: medidas

Por el navegador, con `next start` como en SLT-55, y `paso 7` las afirma. El aviso se mide elegido sin guardar. Iguales en las dos corridas.

| Ancho y tema | `scrollWidth` | Selector y Guardar | Aviso | Ayuda | Título | Valor | Solo lectura: valor y nota |
|---|---|---|---|---|---|---|---|
| 1360 claro | 1360 | 44 y 44 | 6,37 | 10,27 | 18,88 | 18,88 | 18,88 y 10,27 |
| 1360 oscuro | 1360 | 44 y 44 | 7,80 | 8,04 | 15,91 | 14,67 | 15,91 y 8,04 |
| 390 claro | 390 | 44 y 44 | 6,37 | 10,27 | 18,88 | 18,88 | 18,88 y 10,27 |
| 390 oscuro | 390 | 44 y 44 | 7,80 | 8,04 | 15,91 | 14,67 | 15,91 y 8,04 |

Contraste WCAG, con los colores resueltos en un canvas y el fondo compuesto desde la raíz, porque el aviso oscuro es transparente sobre la tarjeta. El `scrollWidth` de solo lectura coincide con el del ancho.

Capturas, de la 2.ª corrida, solo con datos de prueba: `progress/capturas/SLT-77/seccion-{1360,390}-{claro,oscuro}.png` y `solo-lectura-{1360,390}-{claro,oscuro}.png`.

### Hallazgos

1. **Quien asigna no ve el motivo.** El servidor responde «esta orden ya agoto sus intentos de entrega: no puede volver a salir a reparto», pero `asignacion-satelite-error-messages.ts` no tiene ese fragmento y la pantalla dice «Alguna orden de la selección ya no se puede asignar. Actualiza la lista y vuelve a intentarlo.». `guia-decision-error-messages.ts`, el de la bodega central, tampoco lo reconoce (leído, no ejercitado). Viene de la 276 y R20 se cumple, pero con esta feature pesa más: tras bajar el tope, actualizar la lista no arregla nada y la salida es volver a subirlo. El E2E afirma las dos cosas, el mensaje general en pantalla y el motivo en la respuesta, y no se tocó código de producción. Para quien decide.
2. **El corte no barre lo reservado para hoy.** Una orden asignada hoy lleva `fecha_reparto` de hoy, y el corte cierra el día anterior; solicitar el cierre también se niega con ella pendiente. No hay camino sin reloj falso: `repartoDeDiasAtras` mueve al pasado esa fecha, y la excepción está en la cabecera, como `anclarDevolucionHaceDias`.
3. **Fuera de esta feature, a 390 px en `Mensajeros con valor propio`:** la tabla vacía corta su texto a la derecha («Ningún mensajero tiene valor…»), y en oscuro tiene un borde blanco muy marcado. Es de SLT-55 y se ve en las capturas. Sin tocar.
4. **Comentario atrasado:** `lib/services/AsignacionSateliteService.ts:20` aún dice que el umbral sale de la configuración. La guardia no lo ve porque no nombra la constante. No se tocó, por la regla de esta tanda.

### Desviaciones

- El panel del mensajero se mira antes del paso 3, no en el 6: el corte le barrería la orden. La parte de «no entra» sí está en el 6.
- El paso 4 corre en la bodega satélite, con su pantalla. La central queda en `tope-intentos-caminos` (R20), sin E2E.
- `paso 7` también cubre T6.3: 4 casos en vez de uno, para que las cifras queden afirmadas y no solo apuntadas aquí.
- Sin mutaciones: `tasks.md` no pide ninguna para esta tanda, y exigirían recompilar y tocar código de producción. Lo que separa los casos es A contra B y el paso 1, con 3 sin escalar.

### Veredicto

Tanda F hecha: el recorrido de la pantalla al cierre aprobado sale verde dos veces sin saltos, y queda un motivo sin mostrar para que lo decida un humano.

## Tanda G (2026-11-06)

Base: `servi_gate_slt77`, recreada con DROP/CREATE, `migrate deploy` (exit 0) y `db:seed` (exit 0) antes del E2E, del mapa y del gate, con `current_database()` comprobado cada vez. Solo categorías impresas; 0 URLs en los logs, contadas.

### Archivos

Modificados: `app/(app)/recepcion-satelite/_components/asignacion-satelite-error-messages.ts`, `app/(app)/ordenes/_components/guia-decision-error-messages.ts`, `lib/services/AsignacionSateliteService.ts` (solo el comentario de la línea 20), `tests/unit/components/guia-decision-error-messages.test.ts`, `tests/unit/services/orden-service.test.ts`, `e2e/tope-intentos-por-empresa.spec.ts`, `docs/architecture.md`, `docs/ayuda/oficina/configuracion-tarifas.md`, `progress/deudas.md`, `requirements.md` (R42), `tasks.md`.

Las rutas nuevas entraron en `## Archivos esperados` antes de tocarlas.

### Mapa R → test, los 42

Comprobado con un script: los 42 de `requirements.md` están aquí, y cada test de vitest nombrado sale `passed` en el JSON de una corrida sobre base recreada (20 archivos, 457 pasados, 0 fallados, 0 saltados). Los del E2E se buscaron por título en el spec, y esa corrida dio 0 fallados. El nombre es un fragmento del título.

| R | Tests |
|---|---|
| R1 | `tope-intentos-escritura`: `la columna es entera`, `el maestro guarda el extremo 1`, `11 no llega a la base` |
| R2 | `tope-intentos-migration`: `toda empresa que ya existia`, `una empresa creada despues`, `altaEmpresa no conoce`; E2E `paso 1` |
| R3 | `tope-intentos-escritura`: `guarda en la empresa del contexto`, `una entrada que nombra la otra empresa`; `tarifas-action`: `R3: una entrada que nombra otra empresa` |
| R4 | `tope-intentos-service`: `el rol se comprueba sin leer la entrada`; `tarifas-action`: `R4: el admin recibe forbidden`; `tope-intentos-escritura`: `R4: el admin de la empresa`; E2E `paso 6` |
| R5 | `tarifa-schemas`: `SLT-77 R5 — guardarTopeIntentosSchema`; `tope-intentos-service`: `2,5 da validation_error`; `tarifas-action`: `R5: 0 es validation_error` |
| R6 | `tope-intentos-migration`: `la base rechaza 0`, `la base rechaza 11`, `el extremo 10` |
| R7 | `tope-intentos-escritura`: `guardar en A no cambia B`, `UPDATE de la fila de B`, `es_demo de A, desde A: 42501`, `lo que la app puede escribir` |
| R8 | `tope-intentos-escritura`: `una orden con 2 intentos ya agotada`; E2E `paso 2` |
| R9 | `tope-intentos-escritura`: `sin tarifa_activacion`, `con tarifa_activacion` |
| R10 | `tope-intentos-escritura`: `deja quien, el anterior y el nuevo`, `si el historial falla, el tope no cambia`, `dos guardados a la vez`; E2E `paso 5` |
| R11 | `tope-intentos-escritura`: `responde ok, sin historial`; `tope-intentos-service`: `el repositorio dice que no cambio` |
| R12 | `TarifasTopeIntentos`: `el maestro ve el título`, `el maestro elige de 1 a 10`; `TarifasModulo`: `una empresa sin zonas`; `TarifasPage`: `SLT-77 R12, R13`; E2E `paso 1` |
| R13 | `TarifasTopeIntentos`: `el admin ve el vigente`; `TarifasModulo`: `R13: puedeEscribir falso`; E2E `paso 6` |
| R14 | `tarifas-pantalla-service`: `R14: 'mensajero' no lo recibe`, `R14: sin sesión la action`; `TarifasPage`: `SLT-77 R14`; E2E `paso 6` |
| R15 | `TarifasTopeIntentos`: `R15: al elegir menos`, `R15: compara contra lo guardado`; E2E `paso 2` |
| R16 | `TarifasTopeIntentos`: `R16: sin elegir nada`, `R16: al elegir más`, `R16: al volver al guardado`; E2E `paso 5` |
| R17 | `TarifasTopeIntentos`: `el servidor responde error`, `sin siglas, sin nombres de columna`; `TarifasDisposicion`: `SLT-77 R12, R17`; E2E `paso 7` |
| R18 | `tope-intentos-caminos`: `el panel del mensajero`, `la ayuda de la tienda` |
| R19 | `tope-intentos-caminos`: `A responde conflict y la orden no se mueve` |
| R20 | `tope-intentos-caminos`: `bodega central, con un lote mixto`, `bodega satelite, con un lote mixto`; E2E `paso 4` |
| R21 | `tope-intentos-caminos`: `en A, rechazo con gestion sintetica`; E2E `aprobar por la app relee el tope` |
| R22 | `tope-intentos-caminos`: `wrong_number sin vencer`, `not_found vencida`, `bajar el tope escala la orden`; E2E `paso 3` |
| R23 | `tope-intentos-caminos`: `con la misma novedad, A habla sin plazo` |
| R24 | `tope-intentos-caminos`: `MisAsignaciones`, `Novedades`; E2E `la línea de tiempo da a cada empresa` |
| R25 | `tope-intentos-caminos`: `maestro, admin, adminTienda y adminSatelite`; `orden-historial-service`: `R25: a maestro, admin`; `HistorialOrdenSheet`: `SLT-77 R25`; E2E `la línea de tiempo` |
| R26 | `tope-intentos-caminos`: `A escala y B espera en la misma corrida`; E2E `paso 3` |
| R27 | `tope-intentos-escritura`: `la lectura sin contexto`, `la lectura en plataforma`, `guardar en plataforma`; `tope-intentos-caminos`: `una gestion que dependeria del tope`, `A escala y B espera`; `tarifas-pantalla-service`: `R27: si el tope no se puede leer` |
| R28 | `tope-intentos-caminos`: `su primera gestion no puede ser` |
| R29 | `tope-intentos-caminos`: `con 2 intentos: en 2 nada`; E2E `paso 5` |
| R30 | `tope-intentos-caminos`: `los mismos conteos, en literales` |
| R31 | `tope-intentos-sin-valor-global.guardia`: `nadie nombra`, `el modulo de la configuracion ya no existe`, `la columna solo se nombra` |
| R32 | `tope-intentos-caminos`: `al mensajero le llega null`; `orden-historial-service`: `R32: al mensajero le llega umbral null`; `HistorialOrdenSheet`: `SLT-77 R32`; `intentos-entrega`: `276/R10 — el umbral no cruza`; E2E `la línea de tiempo` |
| R33 | `tests/unit/types/tope-intentos.test.ts`: `5. el fichero no nombra`, `4b. con umbral 5` |
| R34 | `tope-intentos-carreras`: `el tope baja tras la lectura`, `el tope sube tras la lectura` |
| R35 | `tope-intentos-carreras`: `proceso, wrong_number sin vencer`, `proceso, not_found vencida`, `wrong_number con la ventana vencida: escala`, `aprobacion: las dos barridas`; `devolucion-sla-tope-wrong`: `SLT-77 R35`; E2E `aprobar por la app` |
| R36 | `tope-intentos-carreras`: `proceso: no rechaza en esa corrida`, `aprobacion: va a bodega con el mayor` |
| R37 | `tope-intentos-carreras`: `con 1 y con 50 candidatas`, `con 3 rechazos por tope`, `la aprobacion lee 2 veces` |
| R38 | `tope-intentos-migration`: `existen, traen down.sql`, `el down deja la base` |
| R39 | Sin test: es un documento, y la excepción está declarada en `tasks.md`. D57 en `progress/deudas.md`, para que el reviewer lo compare con `design §8` |
| R40 | `tope-intentos-sin-valor-global.guardia`: `ni en lib/, app/, components/`, `control: el detector ve las tres` |
| R41 | `tope-intentos-escritura`: `deja quien, el anterior y el nuevo`; `tope-intentos-pii.guardia`: `SLT-77/R41` |
| R42 | `guia-decision-error-messages`: `R42: bodega central`, `R42: bodega satélite`; E2E `paso 4`, solo la satélite |

### Mutaciones

Las de las Tandas A a E están en su sección. La Tanda F no pide. Las de R42, con arnés fuera del repo, que exige base verde con tests ejecutados, cuenta desde el JSON de vitest, restaura y compara la huella:

| Mutación | Resultado | Fallados de 23 | Test |
|---|---|---|---|
| Base | Verde | 0 | 23 pasados, 0 saltados |
| Sin la entrada, satélite | Muere | 1 | `R42: bodega satélite` |
| Sin la entrada, central | Muere | 1 | `R42: bodega central` |

`git status` igual antes y después. Sin gate en paralelo.

**El fragmento es `no puede volver a salir a reparto`,** y no `agoto sus intentos de entrega`: ese también está en `MSG_TOPE_INTENTOS_GESTION`.

### Salida real

- `--project=dinero`, una vez, con `next build` del código con R42 y base recreada: **72 pasados**, 0 fallados, 0 saltados, 0 flaky, `INIT_EXIT=0`.
- `./init.sh`, con `NODE_OPTIONS=--max-old-space-size=8192`: **`INIT_EXIT=1`**. Para en el paso 3: `feature_list.json invalido: features en vuelo sin assignee en el tracker: SLT-77`. Esa copia está en el checkout principal, fuera de este worktree y sin versionar, y no se tocó. **T7.4 sigue abierta.**
- Los pasos siguientes, a mano y uno a uno, para tener su evidencia. **No equivalen a un `init.sh` verde:** perfil exit 0, `gate-proyecto` sin fallos, typecheck exit 0, lint exit 0 (0 errores, 233 avisos), 0 migraciones sin `down.sql`.
- `test:rapido`: 1491 archivos, **1 fallado**, 21982 pasados, 26 saltados: `tests/unit/services/orden-service.test.ts`, fuera del baseline. Es regresión de esta rama y queda arreglada abajo. Tras el arreglo se corrieron ese archivo y el de R42 (56 pasados, 0 fallados), typecheck exit 0 y eslint de lo tocado exit 0. **`test:rapido` entero no se repitió.** Las guardias de ayuda, en verde dentro de esa corrida.
- Avisos: `node_modules` compartido con `pnpm-lock.yaml` más nuevo; 27 tests de árbol que el gate rápido no corre (entre ellos `TarifasDisposicion`, corrido aparte para el mapa); dos PR del arnés pendientes en la plantilla.
- Retornos de carro en lo escrito: 0, contados por bytes.

### Hallazgos

1. **Regresión que nadie había visto.** El doble compartido `tests/fixtures/intentos-entrega.ts` ganó `topeIntentos` en la Tanda C, y `orden-service.test.ts` fijaba con un literal las claves de ese doble. Se cambió el literal y se añadió que el listado no llama a `topeIntentos` ni a `contarIntentos`, porque el contrato del test es que el listado no consulte de más. `OrdenService` no está entre los 10 servicios y no lee el tope.
2. **El mismo fallo que R42, con el mensajero bloqueado.** `MSG_MENSAJERO_BLOQUEADO_POR_CIERRES` dice «el mensajero tiene cierres sin resolver…», pero los mappers buscan `mensajero_bloqueado_por_cierre` y `mensajero bloqueado por cierre pendiente`, y sus tests usan esos textos inventados. Por lectura, sin ejercitar: esa causa cae en el mensaje general. El modal ya deshabilita a ese mensajero, así que quedaría para una carrera. Sin tocar.
3. **D59 es más ancha que Tarifas.** El borde viene de `DataTable`, no de SLT-55: toda tabla hecha con él lo llevaría en oscuro. Por lectura; solo se vio en las dos de Tarifas.
4. **`next build`** escribe una línea `[AppError:INTERNAL] Dynamic server usage` para `/configuracion/tarifas`, la única ruta que sale. Termina en exit 0 y la pantalla responde en el E2E. Sin atribuir: no se comparó con `dev`.

### Desviaciones

- `orden-service.test.ts` no estaba en el encargo: se tocó para cerrar la regresión, añadido antes a `## Archivos esperados`.
- T7.0 es una línea nueva en `tasks.md`, para que R42 tenga tarea.
- D57 y D58 van junto a D49 y D47, como pide el encargo, y por eso rompen el orden numérico del archivo; D59 va al final.
- El título de `paso 4` no nombra R42; el mapa sí.

### Veredicto

Tanda G hecha salvo T7.4: R42 con sus mutaciones y el E2E en verde, pero `./init.sh` da exit 1 por el assignee de SLT-77 en la copia local del board, y hay que repetirlo tras corregirlo.
