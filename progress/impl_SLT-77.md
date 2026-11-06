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
