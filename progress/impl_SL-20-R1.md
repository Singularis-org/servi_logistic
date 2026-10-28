# SL-20 — arreglos de la vuelta 1 de review (M1, m1, m2, m6)

Rama `feature/SL-20-pais-geografia-configurable`, base HEAD `6bf59eb`. Base de datos: `servi_logistic_sl20`
(localhost), `DATABASE_URL` exportada por comando desde el `.env` del repo cambiando solo el nombre de la base.
Sin commit (lo hace el leader). Sin dependencias nuevas. MCP del grafo no consultado (Grep/Read bastó).

## Archivos modificados

- `tests/integration/db/carga-division.test.ts` — M1, R35 del superadmin, m6/R30.
- `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` — lock de superadmin (consecuencia de M1).
- `tests/unit/services/carga-division-service.test.ts` — m2/R48.
- `lib/types/geografia-nodo.ts` — m1: sale `NIVEL_LABELS`.

## Qué cambió, por hallazgo

**M1.** `carga-division.test.ts` ya no hace `prisma.usuario.findFirst`. En `beforeAll`:
1. `tomarLockDeSuperadmin()`;
2. `exigirSinSuperadmin`;
3. `insertarUsuario(tx, await idDeRol(tx, "superadmin"), null)`, commiteado bajo `bajoLockDeEscrituraReal`;
4. lee SOLO ese usuario por su id para el `actorNombre` esperado de R33.

En `afterAll` hace `DELETE` de ese usuario y suelta el lock en un `finally`. Lo que cuelga del usuario (filas
de `historial_plataforma` con su `actor_usuario_id`) se escribe siempre dentro de `revertida` y se va con el
rollback, así que no hay más que limpiar.

Hay un caso de control nuevo: el actor no tiene empresa y su email es el patrón `sl32-<12 hex>@example.com`
de `insertarUsuario`. Así se demuestra que el actor no es un usuario sembrado. No se añade nada a
`tests/baseline-rojos.json`.

- **Por qué el lock de SL-32 y no solo copiar `geografia-superadmin-sin-empresa`.** El índice
  `usuario_un_solo_superadmin` es GLOBAL (lo confirma `pg_indexes`). Dos archivos que commitean cada uno su
  superadmin, corriendo en paralelo en CI, chocan con 23505. `superadmin-32.ts` documenta que todo archivo que
  crea un superadmin debe sostener `tomarLockDeSuperadmin`. `geografia-superadmin-sin-empresa.test.ts` no lo
  tomaba: con este cambio ya serían dos archivos de SL-20 en esa carrera. Por eso también se le añadió (lock +
  `exigirSinSuperadmin` en `beforeAll`, y la suelta en `finally` de `afterAll`). Se respeta el orden de locks
  (el de superadmin fuera, el de la 227 dentro).
- **Base sin usuarios.** `servi_logistic_sl20` tiene hoy 0 filas en `usuario` (medido con `psql` antes y
  después). Es la misma condición que la base de CI tras `db:seed`. No hizo falta borrar ni restaurar nada.

**R35 (escrituras del superadmin).** Es un `describe` nuevo en `carga-division.test.ts`. `GeografiaService`
real sobre la misma transacción (`clienteConSavepoint`), en `XA`:
1. alta de provincia;
2. renombre;
3. retiro.

Resultado: cero filas nuevas en `historial_accion`. Contraprueba: las tres acciones aparecen en
`historial_plataforma` con el actor de la suite. Se comparan ordenadas porque `created_at` empata dentro de
una transacción.

**m6 / R30.** Se pudo sin datos sembrados (todo en `XA`, dentro de `revertida`). Hay un `describe` nuevo en
`carga-division.test.ts`:
- Retirar una provincia ya retirada y reactivar una activa devuelve `ok` con el estado pedido.
- La tupla no cambia: el `ctid` es el mismo. `provincia` no tiene `updated_at`, y `xmin` no sirve porque la
  fila se creó en la misma transacción. Un UPDATE, también uno HOT, deja una tupla nueva.
- Ni `historial_plataforma` ni `historial_accion` ganan filas.
- Contraprueba de la medida: un retiro real sí cambia el `ctid` y deja `nodo_geografico_desactivado`.

**m1.** Se borra `NIVEL_LABELS` de `lib/types/geografia-nodo.ts`. Grep en todo el repo (código y tests): no
había ningún import ni uso. Solo quedan menciones en `progress/` y en `design.md`.

**m2 / R48.** Caso nuevo en `carga-division-service.test.ts`: cabecera con `poblacion` de más y una fila sin
`nivel_1`. El resultado es `{ status: "invalido", errores: [{ linea: 2, … }], total: 1, avisos: ["La columna
«poblacion» no es del formato y se ignoró."] }` y no llama a `importarDivision`.

## Mapa R → test (actualizado)

| R | Test |
|---|---|
| R25 | `carga-division.test.ts` › «una fila mala entre buenas: `invalido` con su linea, cero nodos y cero historial», «⭑ un fallo de la base a MITAD de la escritura deshace tambien lo ya escrito» (+ contraprueba). Ahora en verde sin usuarios sembrados. `carga-division-service.test.ts` › «R25: con UNA fila invalida…», «R25: devuelve como mucho…» |
| R30 | `carga-division.test.ts` › «SL-20/R30 › retirar uno ya retirado y reactivar uno activo: `ok`, misma tupla y cero filas de historial» + «CONTRAPRUEBA de la medida…». `geografia-superadmin-sin-empresa.test.ts` › «crea el país, carga un CSV, da de alta, renombra, cuenta, retira, reactiva y apaga…» (sigue en `geografia-renombrado` / `geografia-cascada-reversible`, del baseline) |
| R35 | `carga-division.test.ts` › «SL-20/R35 › tres escrituras: cero filas nuevas en `historial_accion` y tres en `historial_plataforma`» y «R35: la carga no escribe NADA en `historial_accion`». Guardia `historial-accion-escrituras-cubiertas` (sin cambios) |
| R48 | `carga-division-service.test.ts` › «cabecera en otro orden, con mayusculas, espacios y una columna de mas» (rama `ok`) y «R48: con una columna de mas Y una fila invalida, el `invalido` tambien trae el aviso» (rama `invalido`, nuevo) |
| R49 | `carga-division.test.ts` › «decision 4: con dos homonimos normalizados bajo el mismo padre, gana el primero (por id)». Ahora corre en verde |
| R50 | `carga-division.test.ts` › «decision 4: un alta bajo un padre RETIRADO se permite y el hijo nace activo». Ahora corre en verde |
| R51 | `carga-division.test.ts` › «⭑ un fallo de la base a MITAD de la escritura…» (nada escrito). `carga-division-service.test.ts` › «un pais que no existe es `not_found`…», «un fallo de la base al escribir NO se traga…». `geografia-plataforma-action.test.ts` › «R51: un fallo de la base al escribir es `error`…» |

## Verificación (salida real)

```
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck
> tsc --noEmit
(sin errores)

$ pnpm run lint
✖ 230 problems (0 errors, 230 warnings)      # mismos 230 avisos que en la review; ninguno en los 4 archivos tocados
$ pnpm exec eslint <los 4 archivos tocados>
(sin salida)

$ pnpm exec vitest run tests/unit/services/carga-division-service.test.ts
 Test Files  1 passed (1)
      Tests  28 passed (28)

# integración, en serie, DATABASE_URL -> servi_logistic_sl20
usuarios antes: 0
$ pnpm exec vitest run tests/integration/db/carga-division.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)       # 12 previos + control + R35 + R30 + contraprueba R30
usuarios despues: 0

$ pnpm exec vitest run tests/integration/db/geografia-superadmin-sin-empresa.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
usuarios despues: 0 · pais BV: 0
```

No se corrió `./init.sh` ni la suite completa (lo pidió el leader). M2 (E2E), m3, m4 y m5 quedan fuera de este
encargo.

**Veredicto:** M1, m1, m2 y m6 resueltos. `carga-division.test.ts` pasa en verde contra una base sin usuarios
y no lee ningún usuario ajeno.
