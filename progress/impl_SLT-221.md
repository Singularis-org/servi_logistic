# impl SLT-221 «Maestro: corregir correo y cédula de un usuario» — Tanda 1 (PR 1, backend)

> backend_dev, 2026-11-19. Tareas T1.1-T1.5 de `specs/SLT-221-corregir-correo-cedula/tasks.md`.
> T1.6 (formulario), T1.7 (E2E) y T1.8 (cierre) quedan para el siguiente agente.
> Base desechable: `servi_slt221_desechable` (Postgres local), `migrate deploy` + `db:seed`, exportada
> como `DATABASE_URL`/`DIRECT_URL` antes de cada vitest y de `./init.sh`.

## Archivos

Producción:
- `db/migrations/20261120120000_slt221_historial_correo_cedula/migration.sql` (nuevo): dos valores del
  enum `historial_accion_tipo` y `valor_anterior`/`valor_nuevo` a `varchar(254)`. `pg_depend`: ninguna
  vista depende de esas columnas.
- `db/migrations/20261120120000_slt221_historial_correo_cedula/down.sql` (nuevo): borra las filas de
  los dos tipos, quita los valores con la función dinámica del molde SLT-211 (`_slt221`) y estrecha a
  60 con `left(...)`.
- `db/schema.prisma`: los dos valores en `HistorialAccionTipo`; `@db.VarChar(254)` y comentario (D10).
- `lib/types/historial-accion.ts`: los dos tipos en A.3, categoría `cambia_permisos`, etiquetas (R1609).
- `lib/types/usuario.ts`: `actualizarUsuarioSchema` gana `cedula: documentoForma`; comentario R16.
- `lib/interfaces/repositories/IUserRepository.ts`: `UpdateUsuarioData.cedula`; contrato de `update`.
- `lib/interfaces/services/IUsuarioService.ts`: `ActualizarUsuarioServiceResult` con `conflict`.
- `lib/services/UsuarioService.ts`: `validarCambioDePersona` valida la cédula (par resultante),
  `validarCambioSinEmpresa`, `actualizar` traduce `UsuarioDuplicadoError` → `conflict`.
- `lib/repositories/UserRepository.ts`: `update` escribe la cédula, añade `usuario_cedula_cambiada` al
  mismo lote y traduce P2002 con `mapDuplicadoError`.

Tests nuevos:
- `tests/unit/services/usuario-service-cedula.test.ts`
- `tests/integration/db/usuario-cedula-corregida.test.ts`

Tests modificados:
- `tests/unit/types/usuario-schema.test.ts` (R1601, R1607)
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` (86 → 88, censo de
  `update`, `ESCRITOR_PENDIENTE_EN_CURSO`, R1609)
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts` (excepciones declaradas D10,
  barrido de objetos de entrada, contrapruebas)
- Conteos de catálogo que suben con los dos tipos (mismo patrón que SLT-211):
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`,
  `tests/unit/historial-accion/lectura-borde-y-servicio.test.ts`,
  `tests/integration/db/caja-459-migration.test.ts`,
  `tests/integration/db/correccion-resultado-gestion-migration.test.ts`,
  `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`,
  `tests/integration/db/historial-accion-conciliacion-bodega-migration.test.ts`,
  `tests/integration/db/historial-accion-orden-zona-reconciliada-migration.test.ts`,
  `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts`,
  `tests/integration/db/historial-accion-zona-pago-mensajero-migration.test.ts`,
  `tests/integration/db/historial-accion-zona-sinpe-migration.test.ts`,
  `tests/integration/db/orden-traspaso-migration.test.ts`.

## Mapa R → test (tanda 1)

| R | Test |
|---|---|
| R1601 | `usuario-service-cedula.test.ts` (normaliza, par tipo+cédula) + `usuario-cedula-corregida.test.ts` (UPDATE real) + `usuario-schema.test.ts` (borde) |
| R1602 | `usuario-service-cedula.test.ts` (tipo guardado, tipo nuevo, sin empresa) |
| R1603 | `usuario-service-cedula.test.ts` (conflict) + `usuario-cedula-corregida.test.ts` (índice real; otra empresa no choca) |
| R1604 | `usuario-cedula-corregida.test.ts` (fila con anterior, nuevo, usuario, maestro, empresa; mismo lote con el rol) |
| R1605 | `usuario-cedula-corregida.test.ts` (mismo documento, sin fila) + `usuario-service-cedula.test.ts` (no revalida) |
| R1606 | pendiente T1.6 (`usuario-form.test.tsx`, frontend) |
| R1607 | `usuario-schema.test.ts` (email y password siguen rechazados); `tests/unit/actions/usuarios.test.ts` es de T1.6 |
| R1608 | `usuario-cedula-corregida.test.ts` (254 cabe; 255 aborta la transacción entera) |
| R1609 | `historial-accion-escrituras-cubiertas.guardia.test.ts` (categoría y etiquetas); la fila visible, E2E de T1.7 |

## Mutaciones (cada una mató al menos un test, y se revirtió)

- Quitar `out.cedula = data.cedula` → 6 rojos en `usuario-cedula-corregida`.
- Quitar la condición «cambió» (`despues.cedula !== previo.cedula`) → rojo R1605.
- Quitar `mapDuplicadoError` en `update` → rojo R1603 (misma empresa).
- Índice `usuario_cedula_key` sin `organizacion_id` (en la transacción revertida) → rojo «otra empresa no choca».
- Guardia: `email` en la entrada de `usuario_rol_cambiado` de `UserRepository.ts` → 3 rojos; excepción
  renombrada → 3 rojos.

## Migración en la desechable

`migrate deploy` aplica; `db:rollback` con una fila `usuario_cedula_cambiada` y un `valor_anterior` de
100 caracteres de otro tipo: borra la fila, quita los dos valores del enum (0 en `pg_enum`), deja las
columnas en 60 y el valor largo recortado a 60. Reaplicada después con `migrate deploy`.

## Salidas

Todas con `DATABASE_URL`/`DIRECT_URL` = `servi_slt221_desechable` y `NODE_OPTIONS=--max-old-space-size=8192`.

- `pnpm run typecheck`: `TC_EXIT=0` (sin errores).
- `pnpm exec eslint <los 11 archivos tocados>`: `LINT_EXIT=0`.
- `vitest run tests/unit/services/usuario-service-cedula.test.ts`: `Tests 11 passed (11)`.
- `vitest run tests/integration/db/usuario-cedula-corregida.test.ts`: `Tests 7 passed (7)`.
- `vitest run tests/unit/types/usuario-schema.test.ts`: `Tests 32 passed (32)`.
- `vitest run tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: `Tests 97 passed (97)`.
- `vitest run tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`: `Tests 31 passed (31)`.
- `vitest run tests/unit/services/usuario*`: `Test Files 10 passed (10)`, `Tests 175 passed (175)`.
- Los 90 archivos que nombran el enum o `valor_anterior` (tras ajustar conteos): `Tests 2 failed | 221
  passed` en los 13 que fallaban antes; los 2 rojos son `abono-tienda-457-migration` y
  `wallet-461-migration`, del baseline (`tests/baseline-rojos.json`; ya en `impl_SLT-211.md`).
- `vitest related --run` de los 5 archivos de `lib/` del usuario: `Test Files 2 failed | 443 passed
  (445)`, `Tests 2 failed | 5746 passed | 26 skipped`. Los 2 son timeouts de componentes bajo carga
  (`AnaliticaNoSustitucion`, `DeudasD39D40ModeloEnPantalla`); aislados: `Tests 26 passed (26)`.
- `./init.sh` (rápido): `✓ typecheck paso`, `✓ lint paso` (0 errores, 249 avisos previos),
  `disparadores: 274`, 7 tandas de `test:rapido` todas en verde (635 archivos), `3 rojo(s)
  heredado(s) del baseline no cuentan`, `✓ todas las migraciones tienen down.sql`, tamaño del PR
  `25/40 archivos, 500/1000 líneas de producción, 694/3000 de tests`. **`INIT_EXIT=0`**.

## Desvíos del spec

1. **La guardia `historial-accion-sin-datos-cliente` ahora barre también los objetos de entrada**
   (`{ accion: "<tipo>", ... }`), no solo el recorte `appendAccion(...)`. Sin eso la contraprueba
   pedida («`email` en el bloque de `usuario_rol_cambiado` la pone roja») no podía cumplirse: en
   `UserRepository.update` las entradas se arman con `entradas.push({...})` ANTES de
   `appendAccion(tx, entradas)`, y el recorte de hoy no las veía (hueco previo). Ningún otro punto
   de escritura dio hallazgos con el barrido nuevo.
2. **Archivos fuera de `## Archivos esperados — PR 1`**: los 11 tests de conteo de catálogo y de
   orden de migraciones (mismo patrón que el commit de SLT-211). Sin ellos el gate sale rojo.
3. **`VALOR_MAX_CHARS = 60`** (`lib/types/historial-accion-etiquetas.ts`) no se tocó: lo usa
   `valorDeCatalogo` para recortar nombres geográficos y subirlo cambiaría ese comportamiento. Su
   comentario («anchura de la columna, VarChar(60)») queda desfasado; la columna ahora es 254.
4. **`down.sql` borra filas** (lo pide el design §2.1), a diferencia del molde SLT-211, que aborta
   si hay filas. El encabezado lo explica.

## Veredicto

Tanda 1 backend (T1.1-T1.5) hecha: cédula editable en servicio y repositorio con su fila del Histórico,
migración ida y vuelta probada, gate local verde (`INIT_EXIT=0`). Faltan T1.6 (formulario), T1.7 (E2E) y T1.8.
