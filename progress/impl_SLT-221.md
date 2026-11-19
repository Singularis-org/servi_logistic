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
| R1603 | `usuario-service-cedula.test.ts` (conflict) + `usuario-cedula-corregida.test.ts` (índice real; otra empresa no choca) + `usuario-form.test.tsx` (mensaje bajo «Número de documento») + `usuarios.test.ts` (propaga el conflict) |
| R1604 | `usuario-cedula-corregida.test.ts` (fila con anterior, nuevo, usuario, maestro, empresa; mismo lote con el rol) |
| R1605 | `usuario-cedula-corregida.test.ts` (mismo documento, sin fila) + `usuario-service-cedula.test.ts` (no revalida) |
| R1606 | `usuario-form.test.tsx` (campo habilitado en edición; la cédula viaja en el payload sin email ni password) + `e2e/usuario-corregir-cedula.spec.ts` |
| R1607 | `usuario-schema.test.ts` (email y password siguen rechazados) + `tests/unit/actions/usuarios.test.ts` (el borde: email o password → `validation_error` sin llamar al service) |
| R1608 | `usuario-cedula-corregida.test.ts` (254 cabe; 255 aborta la transacción entera) |
| R1609 | `historial-accion-escrituras-cubiertas.guardia.test.ts` (categoría y etiquetas) + `historial-acciones-descarga-columnas.test.ts` (descarga: etiqueta, categoría, anterior y nuevo) + `e2e/usuario-corregir-cedula.spec.ts` (fila en pantalla; verde en local, vuelta 2) |

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

---

# Tanda 1 — T1.6 (formulario) y T1.7 (E2E), frontend_dev

## Archivos

- `app/(app)/configuracion/_components/UsuarioForm.tsx` — «Número de documento» editable en edición
  (fuera `disabled={isEditar}`) y `cedula` en el payload de `actualizarUsuario`. El `conflict` y el
  `validation_error` ya se pintaban por campo; no hubo que tocarlos.
- `tests/unit/components/usuario-form.test.tsx` — el caso de R16 ahora afirma que la cédula está
  habilitada; bloque nuevo SLT-221: payload (R1606/R1607), conflict (R1603), validation_error (R1602).
- `tests/unit/actions/usuarios.test.ts` — el borde: cédula entra, email/password rechazados, conflict y
  validation_error del service propagados.
- `e2e/usuario-corregir-cedula.spec.ts` — maestro edita la cédula de un `admin` sembrado, la ve al
  reabrir y ve la fila del Histórico con anterior y nuevo; comprueba el UPDATE por detrás.
- `playwright.config.ts` — el spec, en el proyecto `aislamiento` (junto a `zona-sin-distritos`).
- `specs/SLT-221-corregir-correo-cedula/tasks.md` — T1.6 [x]; T1.7 con su estado real.

## Primero rojo

Antes del cambio en el formulario: 4 rojos en `usuario-form.test.tsx` (campo deshabilitado y los tres
casos nuevos). Los de `usuarios.test.ts` salieron verdes de entrada: el borde ya lo dejó T1.3.
Mutación: quitar `cedula: form.cedula` del payload → rojo «R1606: el documento editado viaja…»; revertida.

## Salidas

- `npx vitest run tests/unit/components/usuario-form.test.tsx tests/unit/actions/usuarios.test.ts`:
  `Test Files 2 passed (2) · Tests 74 passed (74)`.
- `pnpm run typecheck`: exit 0, 0 errores. `eslint` sobre los 5 archivos: «No issues found».
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` (base desechable exportada): `== init OK ==`,
  `INIT_EXIT=0`; tamaño `30/40 archivos, 509/1000 líneas de producción, 999/3000 de tests`.
- E2E: **no corrido en local** (lo corre el CI, por indicación del leader).

## Desvíos

1. `playwright.config.ts` no está en `## Archivos esperados — PR 1`; la guardia `e2e-sin-saltos` lo exige.
2. El «Hecho» de T1.7 pide verde en local; queda abierto hasta el CI.

## Veredicto

T1.6 y T1.7 hechas (E2E sin correr en local); gate local verde, `INIT_EXIT=0`.

---

# Vuelta 2 tras la review del PR 1 (`progress/review_SLT-221-pr1.md`)

## Arreglos

- **B1** — `e2e/usuario-corregir-cedula.spec.ts` buscaba el tipo con `clave: "cedula"`; la clave del
  catálogo por país es `cedula_fisica` (`cedula` es el `value` heredado; migración
  `20261107120100_slt42_tipo_documento_por_pais`).
- **B3** — `UsuarioForm.tsx`: `cedula` solo viaja si difiere de la guardada, así que una guardada sin
  tocar no pasa por la validación de cliente ni del borde (SLT-42 R9). Test nuevo en
  `usuario-form.test.tsx`: con una cédula de 67 caracteres (`APIKEY-` + 60), editar el nombre da
  `ok` y el payload no lleva `cedula`. **Primero salió rojo** (`validation_error`) y luego verde.
- **m2** — `tests/unit/components/historial-acciones-descarga-columnas.test.ts`: la fila
  `usuario_cedula_cambiada` pasada por `aDTO` sale en la descarga con «Cambió la cédula de un usuario»,
  la categoría, el anterior y el nuevo; el filtro `cambia_permisos` la encuentra.

## Salidas

- `usuario-form.test.tsx`: 38/38. `historial-acciones-descarga-columnas.test.ts`: 18/18.
- `pnpm run typecheck`: exit 0. `eslint` sobre los 4 archivos: «No issues found».
- **B2, E2E en local.** Base desechable NUEVA `servi_slt221_e2e`: `prisma migrate deploy` (exit 0),
  `pnpm run db:seed` (exit 0) y `next build` con `NODE_OPTIONS=--max-old-space-size=8192` y
  `NEXT_PUBLIC_APP_URL`/`APP_BASE_URL` en el puerto del E2E (exit 0).
  `E2E_PUERTO=3221 E2E_STORAGE_PUERTO=54421 pnpm exec playwright test e2e/usuario-corregir-cedula.spec.ts
  e2e/tope-intentos-por-empresa.spec.ts e2e/tarifas-valor-propio-mensajero.spec.ts`:
  **34 passed (1.9m), 0 failed, 0 flaky, `E2E_EXIT=0`**. Por spec:
  - `[aislamiento] usuario-corregir-cedula`: 1 passed;
  - `[dinero] tope-intentos-por-empresa`: 12 passed;
  - `[dinero] tarifas-valor-propio-mensajero`: 11 passed;
  - dependencia `[plataforma-vacia]` (`superadmin-arranque` 3, `superadmin-empresas` 7): 10 passed.

## Observación

- R1609 nombra la categoría «Cambia quién puede hacer qué»; la etiqueta que sale en pantalla y en el
  archivo es «Cambia permisos» (`CATEGORIA_LABELS.cambia_permisos`). El test afirma la etiqueta real; no
  cambié la UI. Lo decide el leader.
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` (base desechable exportada): `== init OK ==`, `INIT_EXIT=0`;
  tamaño `31/40 archivos, 510/1000 líneas de producción, 1065/3000 de tests`.

## Veredicto (vuelta 2)

B1, B2, B3 y m2 resueltos; los 3 E2E afectados en verde en local y el gate local en verde.
