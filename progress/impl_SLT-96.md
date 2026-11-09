# SLT-96 «Consolidación de ₡0 no se puede marcar recibida» · bitácora de implementación

## T2 · Pantalla (R10-R13) — frontend_dev, 2026-11-09

### Archivos
- `components/shared/monto-cliente.ts`: `esMontoCero` promovido (movido, misma regex `/^-?0(\.0+)?$/`) y
  `montoValidoOCero` nuevo (`/^\d+(\.\d{1,2})?$/`, sin exigir `[1-9]`; money-safe, solo texto).
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`: re-exporta `esMontoCero`. Sus tres
  importadores (`cierre-factura`, `CascadasCierreMensajero`, `SaldosSatelitesTable`) no cambian el import;
  el typecheck lo confirma.
- `components/shared/conciliacion/conciliacion-labels.ts`: `MARCAR_RECIBIDO_ERROR.montoConCero`.
- `components/shared/conciliacion/MarcarRecibidoDialog.tsx`: `declaradoCero = esMontoCero(declarado)`,
  `montoOk = declaradoCero ? montoValidoOCero(monto) : montoValido(monto)` y el aviso del campo según la rama.
  Los comentarios están al día.
- Tests nuevos: `tests/unit/components/monto-cliente-cero.test.ts` (MC) y
  `tests/components/MarcarRecibidoDeclaradoCero.test.tsx` (DLG).

### Desviación del design, y por qué (R13)
Con el código anterior, el aviso del campo no se podía ver nunca. Solo lo ponía `confirmar`, y el `Modal`
no llama a `onConfirm` con `confirmDisabled` (`components/shared/Modal.tsx:197`, el botón está
`disabled`). Por eso R13 no tenía ningún camino visible. Añadí un `onBlur` al campo que pinta el aviso de
la rama que aplica. Esto también cambia la rama de declarado ≠ 0: ahora se ve al salir del campo el aviso
«mayor que cero» de siempre, que antes no se veía. El texto no cambia. Es un cambio de 1 línea dentro del
mismo diálogo y no hay pantalla nueva. Lo dejo anotado para el reviewer.

### Mapa R → test (DLG = `tests/components/MarcarRecibidoDeclaradoCero.test.tsx`, MC = `tests/unit/components/monto-cliente-cero.test.ts`)
| R | Test |
|---|---|
| R10 | DLG «R10 — declarado 5000.00 con el monto en 0: el botón sigue deshabilitado» |
| R11 | DLG «R11 — declarado 0.00: abre con 0.00 precargado, el botón habilitado, y envía montoRecibido 0.00»; «R11 — declarado 0.00 con «0» tecleado…»; «R11 — en modo corrección (montoActual 10.00)…»; MC `esMontoCero` y `montoValidoOCero` (`it.each` con "0", "0.0", "0.00", "-0.00", "0.01", "10", "", "0.000") |
| R12 | DLG «R12 — el validation_error del servidor se pinta bajo el campo, el diálogo sigue abierto y conserva el monto». Usa el literal «Solo se puede registrar 0 cuando lo declarado es 0.» y comprueba la descripción accesible del campo, `aria-invalid`, que no se llama `onOpenChange(false)` y que el valor sigue en "0.00" |
| R13 | DLG «R13 — declarado 0.00 con «abc»: el aviso del campo dice «de cero o más»»; «R13 — declarado 5000.00 con «abc»: sigue el aviso «mayor que cero»» |

### Mutaciones (todas medidas en rojo; el archivo se restaura después de cada una y se comprueba con `cmp`)
Comando: `pnpm exec vitest run tests/unit/components/monto-cliente-cero.test.ts tests/components/MarcarRecibidoDeclaradoCero.test.tsx`

| # | Mutación | Resultado |
|---|---|---|
| M1 (R10) | `montoOk = montoValidoOCero(monto)`: el cero se habilita sin mirar lo declarado | 1 failed: R10 |
| M2 (R11) | `montoOk = montoValido(monto)`: solo la condición de antes | 4 failed: los 3 R11 y R12 |
| M3 (R12) | `onOpenChange(false)` ante `validation_error` | 1 failed: R12 |
| M4 (R13) | el mismo aviso en las dos ramas (`montoConCero` → `monto`) | 1 failed: R13 con declarado 0 |
| M5 (MC) | `esMontoCero` sin `-?` | 1 failed: «"-0.00" es cero» |
| M6 (MC) | `montoValidoOCero` vuelve a exigir `[1-9]` | 4 failed: "0", "0.0", "0.00", " 0.00 " |
| M7 (MC) | `montoValidoOCero` acepta 3 decimales | 1 failed: «"0.000" NO tiene forma válida» |

### Salida de los comandos
Base: `DATABASE_URL` se exportó a una URL desechable e inalcanzable (`127.0.0.1:1`) para que ningún test
tocara la base local. Los tests de T2 no usan base de datos.

- Tests nuevos: `Test Files 2 passed (2) · Tests 34 passed (34)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `TC_EXIT=0`. Hubo que subir la memoria
  porque la primera corrida cayó por falta de memoria (exit 134) mientras T1 corría en paralelo. El
  typecheck incluye el árbol de T1 tal como estaba en ese momento.
- `pnpm exec eslint` sobre los 6 archivos de T2: `LINT_EXIT=0`.
- `pnpm exec vitest related --run` sobre los 6 archivos de T2: `Test Files 1 failed | 157 passed (158) ·
  Tests 2551 passed | 20 skipped`. El único rojo es
  `tests/integration/db/descarga-pago-plataforma-sl45.test.ts`, que falla con «Can't reach database server
  at 127.0.0.1:1»: es la base inalcanzable puesta a propósito, no T2. Lo cubre el gate de T3 con la base
  desechable real.

### Veredicto T2
R10-R13 implementados, con test cada uno y sus mutaciones medidas en rojo. Hay una desviación menor
(`onBlur` para que R13 se vea), anotada arriba para el reviewer.

## T1 · Servidor: el borde y el repositorio (R1-R9) — backend_dev, 2026-11-09

### Archivos
- `lib/types/conciliacion-satelites.ts`:
  - nuevos: `montoCeroSchema` (`/^0+(\.0{1,2})?$/`, sin signo), `montoRecibidoSchema`
    (`z.union([montoPositivoSchema, montoCeroSchema], { error })`), `MENSAJE_MONTO_RECIBIDO_FORMA` y
    `MENSAJE_MONTO_CERO_CON_DECLARADO`;
  - `marcarConsolidacionRecibidaSchema` usa `montoRecibidoSchema` y sigue `.strict()`;
  - el comentario de la 431 está reescrito con la decisión nueva.

  Con el zod 4 del repo, el `{ error }` de la unión sí llega a `fieldErrors.montoRecibido`. Lo prueba el test
  «R6 el aviso de forma del monto es el literal del contrato».
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`: `MarcaConMontoResult` y los dos métodos
  que lo devuelven. Los comentarios de los dos inputs dicen ahora `>= 0` (el 0 lo filtra el repositorio).
- `lib/repositories/CierresBodegaAdminRepository.ts`:
  - helper `declaradoEsCero(tx, id)`: lee el snapshot con `esperadoDe`;
  - se usa en `marcarConciliado` y en `corregirConciliacion`, dentro de la transacción, antes del `updateMany`
    y **solo con `monto.isZero()`**, así que con monto > 0 las consultas son las de siempre;
  - si devuelve `null`, el resultado lo decide el conteo de existencia (`fuera_de_alcance`).
- `lib/interfaces/services/IConciliacionSatelitesService.ts`: `MarcaConMontoServiceResult` para `marcarRecibida`
  y `corregirRecibida`. `MarcaConciliacionServiceResult` y `RevertirConciliacionServiceResult` no cambian.
- `lib/services/ConciliacionSatelitesService.ts`: `montoCeroNoPermitido()` traduce `monto_cero_no_permitido`
  a `validation_error`, con el literal en `fieldErrors.montoRecibido`. El rol se sigue comprobando primero.
- `lib/actions/conciliacion-satelites.ts`: solo comentarios.
- Tests:
  - AC: `tests/unit/actions/conciliacion-satelites-actions.test.ts`;
  - SV: `tests/unit/services/conciliacion-satelites-service.test.ts`;
  - INT (nuevo): `tests/integration/db/slt96-marca-cero.int.test.ts`.

El `git diff` no toca `lib/types/wallet.ts`, `lib/utils/conciliacion-satelite.ts`, `asentarDiferenciaSatelite`
ni `asentarCierreDia`. No hay migración ni dependencias nuevas.

### Mapa R → test
| R | Test |
|---|---|
| R1 | INT «R1/R7: declarado 0 (1500 − 1500) y marcar 0.00 → conciliada, monto 0, historial con monto 0, sin ajuste ni movimiento»; SV «R1 marcar con 0 aceptado por el repositorio -> ok…»; AC «⭑ SLT-96: el CERO pasa el borde y llega al servicio…» |
| R2 | INT «R2: declarado 5000 y marcar 0.00 → monto_cero_no_permitido, y no cambia NADA»; SV «R2 marcar: `monto_cero_no_permitido` del repositorio -> validation_error en el campo del monto»; AC «R2 el validation_error del servicio … llega tal cual» |
| R3 | INT «R3: declarado 0, marcar 10.00 y corregir a 0.00 → monto 0 y historial con valor_nuevo 0.00» |
| R4 | INT «R4: declarado 5000, marcar 5000.00 y corregir a 0.00 → monto_cero_no_permitido, sin cambios»; SV «R4 corregir: …» |
| R5 | INT «R5: la MISMA entrada (0.00) da desenlaces distintos solo por el snapshot sembrado»; AC «R5 marcar/corregir: una clave «declarado» en la entrada muere en el borde» |
| R6 | AC `it.each` «R6 marcar/corregir con monto %s -> validation_error en el campo y el servicio NI SE LLAMA» (ausente, vacío, negativo, `-0`, `-0.00`, `0.000`, tres decimales, no numérico, number 0, number) y «R6 … con monto %s llega al servicio tal cual» (`0`, `0.0`, `0.00`, `485.00`, `0.01`); AC «R6 el aviso de forma del monto es el literal del contrato»; INT «R6 (control): con declarado 5000, un monto > 0 se sigue aceptando» |
| R7 | INT «R1/R7 …»: 0 filas de `conciliacion_bodega_ajuste`, el conteo global de `wallet_movimiento` con origen `conciliacion_bodega_ajuste` no cambia y la transacción no lanza |
| R8 | AC «R8 montoPositivoSchema sigue rechazando 0» y «… 0.00» (+ control «acepta 0.01») |
| R9 | INT «R9: con 0.00 sobre un id inexistente → fuera_de_alcance, en marcar y en corregir»; SV «R9 marcar/corregir con 0 una inexistente: `fuera_de_alcance` -> no_encontrada» |

### Mutaciones (todas en rojo)
Después de cada mutación, el archivo se restaura, y se comprobó con grep de sus marcas que volvió a su estado.

- **Runner:** un script de un solo uso, fuera del repo (en el scratchpad).
- **Comando por mutación:** `pnpm exec vitest run <archivo de la fila>`, con `DATABASE_URL` apuntando a la
  base desechable.

| # | Mutación | Test | Resultado |
|---|---|---|---|
| M1 (R1) | `declaradoEsCero` lee `s.totalGeneral.isZero()` en vez de `esperadoDe(s)` | INT | 3 failed / 4 passed: R1/R7, R5, R3 |
| M2 (R1/R5) | quitar la rama del cero en `marcarConciliado` | INT | 2 failed: R2, R5 |
| M3 (R2) | invertir la condición (`!cero` → `cero`) | INT | 5 failed: R1/R7, R2, R5, R3, R4 |
| M4 (R2/R4) | el servicio lo traduce a `conflict` | SV | 2 failed: R2 marcar, R4 corregir |
| M5 (R3/R4) | quitar la rama del cero en `corregirConciliacion` | INT | 1 failed: R4 |
| M6 (R5) | quitar `.strict()` | AC | 4 failed: los dos R5 «declarado» y los dos `.strict()` previos |
| M7 (R6) | forma del cero `/^-?0+…/` | AC | 5 failed: `-0` y `-0.00` en marcar y corregir |
| M8 (R6) | aceptar number (`z.coerce.string()`) | AC | 2 failed: «number 0» en marcar y corregir |
| M9 (R7) | quitar `if (delta.isZero()) return;` | INT | 3 failed: R1/R7, R5, R4 |
| M10 (R8) | `montoPositivoSchema`: `gt(0)` → `gte(0)` | AC | 2 failed: R8 «0» y «0.00» |
| M11 (R9) | inexistente con 0 → `monto_cero_no_permitido` | INT | 1 failed: R9 |
| M12 (R1/R6) | quitar `montoCeroSchema` de la unión | AC | 9 failed: los «llega al servicio» de 0/0.0/0.00 y el «CERO pasa el borde» |

Sobre M5: sin la rama en `corregirConciliacion`, R3 sigue en verde, porque el 0 pasa igual. Lo mata R4, y es lo
esperado: la rama solo **restringe**.

### Base de datos y entorno
- **Base desechable** `slt96_t1`, en el Postgres local del `.env`:
  - `DROP`/`CREATE`;
  - `prisma migrate deploy`, con `DEPLOY_EXIT=0`;
  - `pnpm run db:seed`.

  `DATABASE_URL` se exportó antes de cada vitest, y la URL nunca se imprimió.
- **Incidente:**
  - En el primer intento, el script que creaba la base falló porque no encontraba `pg`. La cadena `&&` se
    cortó, pero `pnpm run db:seed` corrió aparte contra la base local del `.env`.
  - Ese seed solo hace `upsert` de catálogos (rol, order_status, vehiculos), con las definiciones de `prod`.
    No tocó usuarios, órdenes ni dinero.
  - Si la base local de `dev` tenía catálogos más nuevos, conviene correr allí `pnpm run db:seed` desde `dev`.
- **`node_modules` propio del worktree**, sin junction: `pnpm install --frozen-lockfile --prefer-offline`.
  El `prisma generate` corrió sobre ese `node_modules` propio, así que no toca el compartido de `dev`. Por eso
  el typecheck de este worktree mide el esquema de `prod`.

### Salida de los comandos
- **El INT corrió de verdad:** con
  `pnpm exec vitest run tests/integration/db/slt96-marca-cero.int.test.ts --reporter=verbose`, sale
  `Test Files 1 passed (1) · Tests 7 passed (7)`, con 0 skipped.
- **Suites enfocadas, en verbose** (`slt73-*` int, `slt96`, `cierres-bodega-admin*` unit, AC y SV): sale
  `FOCO_EXIT=0 · Test Files 14 passed (14) · Tests 180 passed (180)`, con 0 skipped.
- **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` da `TC_EXIT=0`, con 0 errores.
  Sin la memoria extra cae por falta de memoria, con exit 134.
- **Lint:** `pnpm exec eslint` sobre los 9 archivos de T1 da `LINT=0`.
- **`vitest related`:**
  - Con `pnpm exec vitest related --run` sobre los 9 archivos de T1 sale `REL_EXIT=1 · Test Files 17 failed | 206 passed (223) · Tests 40 failed | 2905 passed | 79 skipped`.
  - Los 17 archivos en rojo **están todos en `tests/baseline-rojos.json`**. Son suites que necesitan usuarios,
    órdenes o tarifas que el seed de catálogos no crea: «`usuario` esta vacia», «faltan la zona central…».
  - **Contraprueba:** con los `lib/` de T1 revertidos a `HEAD`, esos mismos 17 archivos también salen
    `17 failed (17)`.
  - Las cifras por test cambian: en la corrida completa, otras suites dejan datos, y 464 y 469 llegan más lejos
    antes de caer. Aun así, ninguno de esos archivos sale del baseline.
- **Guardias:** `pnpm run test:guardias` da `Test Files 1 failed | 341 passed (342)`. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que espera que el `init.sh` de `prod` llame a
  `scripts/verificar-dependencias.mjs`. Está en el baseline, y T1 no toca `init.sh`.

### Veredicto T1
R1-R9 están implementados según `design.md` §2. Cada uno tiene su test, y las 12 mutaciones quedaron medidas en
rojo. El INT corrió contra Postgres real, con 7 tests ejecutados.

## Vuelta 2 · cambios pedidos por el reviewer (`progress/review_SLT-96.md`, H1 y H2) — backend_dev, 2026-11-09

### H1 (R6): el punto del regex del cero
- **Causa.** `lib/types/conciliacion-satelites.ts` quedó con `/^0+(.0{1,2})?$/`, con el punto sin escapar. Al
  escribir el archivo con un script inline por la shell se perdió una barra de escape. El M7 de la vuelta 1 se
  escribió por el mismo camino, así que mutó el regex ya roto y no lo detectó.
- **Efecto.**
  - `"0,00"`, `"0a0"` y `"0-0"` pasaban el borde y reventaban en `Prisma.Decimal`: daban un error interno en vez
    de `validation_error`.
  - `"0x0"` y `"0e0"` se aceptaban como cero.
- **Arreglo.** El regex es ahora `/^0+(\.0{1,2})?$/`, como en `design.md` §2.1. Lo edité con la herramienta de
  edición, no por la shell.
- **Test.** Al `it.each` de rechazos de R6 en AC, que se ejecuta para marcar Y para corregir, se le añadieron:
  «0 con coma» (`"0,00"`), `"0a0"`, `"0-0"`, `"0x0"` y `"0e0"`. Cada caso exige `validation_error` con
  `fieldErrors.montoRecibido` y que el servicio no se llame.
- **Mutación H1** (quitar la `\` del regex): con el script `mut-h1.cjs`, escrito a archivo y no inline, que
  restaura el archivo y comprueba que quedó idéntico (`restaurado: true`). El comando fue
  `pnpm exec vitest run tests/unit/actions/conciliacion-satelites-actions.test.ts`:
  - Sale `exit=1 Tests 10 failed | 62 passed (72)`.
  - Los rojos son exactamente los 5 casos nuevos en marcar y los 5 en corregir.
- **Sin mutar:** `Test Files 1 passed (1) · Tests 72 passed (72)`.
- `pnpm exec eslint` sobre los 2 archivos da `LINT=0`. El typecheck, con `NODE_OPTIONS=--max-old-space-size=8192`,
  da `TC_EXIT=0`.
- `DATABASE_URL` se exportó a la desechable `slt96_t1` antes de cada vitest.

### H2: tasks.md
Las casillas de T1, T2 y T3 de `specs/SLT-96-consolidacion-cero-recibida/tasks.md` están en `[x]` (12 casillas).
T3 la corrió el leader: gate local verde, `INIT_EXIT=0`, contra `slt96_t1`. T4 a T6 siguen abiertas.

## T5 (leader, 2026-11-09)

`git diff origin/prod origin/dev` sobre los archivos de código del PR: vacío. `dev` no cambió ninguno; la sincronización a `dev` no tendrá conflicto en ellos.
