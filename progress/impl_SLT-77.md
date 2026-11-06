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
