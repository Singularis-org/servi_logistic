# impl SLT-221 «Maestro: corregir correo y cédula de un usuario» — Tanda 1 (PR 1, backend)

> backend_dev, 2026-11-19. Tareas T1.1-T1.5 de `specs/SLT-221-corregir-correo-cedula/tasks.md`.
> T1.6 (formulario), T1.7 (E2E) y T1.8 (cierre) quedan para el siguiente agente.
> Base desechable: `servi_slt221_desechable` (Postgres local), `migrate deploy` + `db:seed`, exportada
> como `DATABASE_URL`/`DIRECT_URL` antes de cada vitest y de `./init.sh`.

## Archivos

Producción:
- `db/migrations/20261120130000_slt221_historial_correo_cedula/migration.sql` (nuevo): dos valores del
  enum `historial_accion_tipo` y `valor_anterior`/`valor_nuevo` a `varchar(254)`. `pg_depend`: ninguna
  vista depende de esas columnas.
- `db/migrations/20261120130000_slt221_historial_correo_cedula/down.sql` (nuevo): borra las filas de
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

---

# Vuelta 3: merge de origin/dev y renombre de la migración

- `git merge origin/dev`: entró SLT-214 con `20261120120000_plan_beneficio`, el mismo timestamp que la
  nuestra. El conflicto de `orden-traspaso-migration.test.ts` se resolvió conservando las dos entradas.
- La migración se renombró con `git mv` a `20261120130000_slt221_historial_correo_cedula`. Queda después de
  `20261120120000_plan_beneficio` y antes de `20261121120000_slt224_zona_de_ordenes_en_central`, que es de
  otra rama. Referencias actualizadas: 9 tests de integración, design, tasks y esta bitácora. La review
  (`progress/review_SLT-221-pr1.md`) conserva el nombre antiguo porque es el registro de lo revisado. Es un
  renombre seguro: Preview no migra y la migración solo se había aplicado en bases desechables locales.
- Base desechable NUEVA `servi_slt221_v3`: `prisma generate`, `migrate deploy` y seed, todos con exit 0.
- Tests de integración del diff (10 archivos): **124 passed**. SLT-214 (`migracion-plan-beneficio-ida-y-vuelta`,
  `plan-beneficio`, `plan-de-la-empresa`): **23 passed**.
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` sobre `servi_slt221_v3`: `== init OK ==`, `INIT_EXIT=0`; tamaño `31/40 archivos, 510/1000 líneas de producción, 1065/3000 de tests`.

---

# PR 2 — backend (T2.1-T2.6), 2026-11-19

> Base desechable NUEVA `servi_slt221_pr2` (Postgres local): `prisma generate`, `migrate deploy` y
> `db:seed`, todos con exit 0; exportada como `DATABASE_URL`/`DIRECT_URL` antes de cada vitest y del
> `./init.sh`. T3.x (UI) no se tocan: esperan el canvas de T2.0.

## Migración

`20261122120000_slt221_usuario_cambio_correo` (no `20261120120100`: ese timestamp queda por debajo de
migraciones ya aplicadas en prod; la última de `origin/dev` era `20261121140100_plan_nivel`). Nombre
corregido en `tasks.md` y `design.md`. Tabla, CHECK, índice único parcial
`usuario_cambio_correo_abierto`, índices, FK (usuario CASCADE, solicitante RESTRICT, empresa RESTRICT),
RLS `usuario_cambio_correo_por_empresa`, `REVOKE DELETE` + `GRANT SELECT, INSERT, UPDATE` a
`servi_app`, triggers de misma empresa generados con `generar-misma-empresa.ts --faltantes`.
`migrate deploy` (exit 0) → `db:rollback` (exit 0, «Rollback completado») → `migrate deploy` (exit 0).

## Ajustes al design (anotados en design §3.4)

1. `ICambioCorreoRepository` aparte de `IUserRepository` (mismo archivo, lo implementa el mismo
   `UserRepository`). Con los métodos dentro de `IUserRepository`, el typecheck rompía 16 archivos de
   test con dobles de ese contrato (medido) y el PR pasaba el tope de 40 archivos. Consecuencia:
   `correoDeCambio` (7.º parámetro) lleva también `repo`, y el composition root pasa el mismo
   `UserRepository` del 1.er parámetro (lo prueba `usuarios-composition.test.ts`). `UserPrismaClient`
   gana `usuarioCambioCorreo` como opcional, con un getter que lanza si falta (los dobles de Prisma
   existentes siguen valiendo).
2. `IConfirmarCorreoService` con dos métodos, uno por contexto: `empresaDelEnlace` (partir, limitador,
   empresa; en `comoPlataforma`) y `confirmar` (pendiente, secreto, canje; en `conEmpresa`).
3. Los tres métodos del maestro lanzan sin `correoDeCambio` justo después del permiso.
4. El índice único parcial es `(organizacion_id, usuario_id)`: la guardia `unicos-por-empresa`
   (SL-18 R22) exige `organizacion_id` primero. Mismo único (el usuario ya es de una empresa).
5. El aviso del envío fallido es `avisarEnvioFallidoCambioCorreo(causa)` en la plantilla: la guardia
   `contrasena-generada-superficie` (287) prohíbe todo `console` en `UsuarioService.ts`.
6. Las cuatro acciones nuevas llevan `@sin-superficie SLT-221 en curso` (la UI es T3.1/T3.2); caducan
   al montar la pantalla.
7. m1 de la review del PR 1: comentario de `VALOR_MAX_CHARS` reescrito (es el tope de
   `valorDeCatalogo`, no de la columna; el correo y la cédula no pasan por él). No cambia el 60.

## Archivos

Creados: `db/migrations/20261122120000_slt221_usuario_cambio_correo/{migration,down}.sql`,
`lib/utils/enlace-de-un-uso.ts`, `lib/services/email/plantillas/confirmar-correo.ts`,
`lib/interfaces/services/IConfirmarCorreoService.ts`, `lib/services/ConfirmarCorreoService.ts`,
`lib/actions/confirmar-correo.ts`, `tests/unit/services/usuario-service-cambio-correo.test.ts`,
`tests/unit/services/confirmar-correo-service.test.ts`, `tests/unit/actions/confirmar-correo.test.ts`,
`tests/integration/db/usuario-cambio-correo.test.ts`.

Modificados: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `lib/db/excepciones-aislamiento.ts`,
`lib/config/auth.ts`, `.env.example`, `lib/types/usuario.ts`, `lib/types/historial-accion-etiquetas.ts`
(m1, solo comentario), `lib/interfaces/repositories/IUserRepository.ts`,
`lib/repositories/UserRepository.ts`, `lib/interfaces/services/IUsuarioService.ts`,
`lib/services/UsuarioService.ts`, `lib/actions/usuarios.ts`, `tests/unit/actions/usuarios.test.ts`,
`tests/unit/actions/usuarios-composition.test.ts`,
`tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` (censo + pendiente vacío),
`tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts` (sin `escritorPendiente`; control
positivo con el correo), `tests/unit/guards/rls-por-empresa.guardia.test.ts` (95 → 96 tablas),
`tests/unit/password-reset-service.test.ts` (literal de `AuthConfig` con el campo nuevo),
`specs/.../{tasks,design}.md`, `lib/modulos/reparto.ts` (`confirmar-correo` núcleo),
`scripts/verificar-rls-despliegue.ts` (`TRIGGERS_MISMA_EMPRESA` 181 → 183; en la desechable hay 183
`sme_*`, medido), `tests/unit/scripts/verificar-rls-despliegue.test.ts` (96 tablas, 97 políticas, 183),
`tests/fixtures/api-key-dependencias-usuario.ts` (las dos FK nuevas a `usuario`, `no_alcanzable`),
`tests/integration/db/orden-traspaso-migration.test.ts` (lista de migraciones posteriores).

## R → test (PR 2, backend)

| R | Test |
|---|---|
| R1610, R1614, R1621 | `usuario-service-cambio-correo.test.ts` «crea el pendiente, escribe SOLO al correo nuevo…» |
| R1611 | ídem «conflict en `email`» + `usuario-cambio-correo.test.ts` (integración) «existeEmailEnEmpresa…» |
| R1612, R1613 | `usuario-service-cambio-correo.test.ts` |
| R1615 | `usuario-cambio-correo.test.ts` «con el pendiente abierto se entra con el correo anterior…» |
| R1616 | `usuario-cambio-correo.test.ts` «un solo pendiente abierto…» + servicio «reenviar…» |
| R1617 | `usuario-service-cambio-correo.test.ts` «si el envío falla…» + integración «anular… solo tocan el suyo» |
| R1619 | servicio «cancelar anula el abierto» + integración «anular el abierto…» (pantalla en T3.1) |
| R1618 | servicio «consultar devuelve el pendiente… vencido» (pantalla en T3.1) |
| R1620 | `usuario-service-cambio-correo.test.ts` «reenviar…» |
| R1622 | `usuario-cambio-correo.test.ts` «el canje cambia el correo…» + `confirmar-correo-service.test.ts` |
| R1623 | `confirmar-correo-service.test.ts` (roto, inexistente, anulado, usado, vencido, secreto) + integración «cambioCorreoParaCanje solo da el abierto y vigente» |
| R1624 | `usuario-cambio-correo.test.ts` «si el correo nuevo ya lo usa otro…» + servicio de canje |
| R1625 | `usuario-cambio-correo.test.ts` «dos canjes a la vez…» + servicio de canje |
| R1627, R1628 | `confirmar-correo-service.test.ts` (solo tres métodos de repo, sin sesión ni contraseña) + `confirmar-correo.test.ts` |
| R1629 | `confirmar-correo-service.test.ts` «superado el tope…» |
| R1630 | servicio (otra empresa y superadmin, x3 operaciones) + integración «no se ve ni se anula desde B (filtro y RLS)» |
| R1631 | `usuario-service-cambio-correo.test.ts` (x3) + `usuarios.test.ts` (unauthenticated) |
| R1632 | `usuario-service-cambio-correo.test.ts` «solo el hash… `#enlace=`» y «el log no lleva destinatario ni URL» |
| composition | `usuarios-composition.test.ts` «el correo de cambio en la séptima posición» |
| R1626 | pendiente de T3.2/T3.3 (pantalla) |

## Mutaciones (cada una aplicada sola, test corrido, archivo restaurado y comprobado)

`UserRepository.ts` contra `tests/integration/db/usuario-cambio-correo.test.ts` (9 tests ejecutados en
cada corrida, ninguno saltado): 13/13 MUERTAS — `existeEmailEnEmpresa` sin `id: { not }` y sin `email`;
`abrirCambioCorreo` sin anular el anterior; `cambioCorreoParaCanje` sin `anuladoAt`, sin
`confirmadoAt` y sin `expiraAt`; `aplicarCambioCorreo` sin `confirmadoAt` (carrera) y sin `expiraAt`;
`anularCambioCorreoAbierto` sin `usuarioId`; `anularCambioCorreo` sin `id`; `cambioCorreoAbierto` sin
`anuladoAt`; `valorAnterior` equivocado; P2002 sin traducir.

Servicio, canje y acciones contra sus tests unitarios: 14/14 MUERTAS — sin R1612, sin R1613, sin
anular en fallo, log con destinatario, secreto en claro, TTL ignorado, superadmin visible, sin
conflict; canje sin verificar el secreto, sin limitador, `correo_en_uso` perdido; canje fuera de
`conEmpresa`, sin corte por empresa `null`; composition root con otro `UserRepository`.

## Salida real

- `pnpm run typecheck` (dentro de init): `✓ typecheck paso`.
- `pnpm run lint`: `✓ lint paso` (0 errores; los warnings son previos).
- Tests del cambio (verbose, dos corridas): 111 passed (111) — `usuario-service-cambio-correo` 22,
  `confirmar-correo-service` 11, `confirmar-correo` (acción) 4, `usuarios.test` 46, `usuarios-composition` 4,
  `usuario-cambio-correo` (integración) 9, `orden-traspaso-migration` 15.
- `pnpm run test:guardias`: 360 passed, 5424 tests passed, 1 skipped.
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` sobre `servi_slt221_pr2`: `== init OK ==`, `INIT_EXIT=0`
  (quinta corrida; las cuatro anteriores destaparon los contadores y guardias de arriba, y dos veces un
  «Worker exited unexpectedly» de vitest en Windows: `demo-qa.test.ts` y un lote local, verdes al repetir).
- Tamaño: `34/40 archivos, 870/1000 líneas de producción, 1015/3000 de tests` (aviso del 80%). Con la
  UI de T3.x el PR 2 pasa de 1000 líneas de producción: hay que decidirlo antes de T3.

Veredicto: backend del PR 2 (T2.1-T2.6) hecho y verde; UI (T3.x) pendiente del canvas de T2.0.

---

# PR 2 — vuelta 2 tras la review (`progress/review_SLT-221-pr2.md`), 2026-11-20

## Arreglos

- **B1 (R1629).** `tests/unit/actions/confirmar-correo.test.ts` llama a `confirmarCambioCorreo` SIN
  `deps.service`, con `UserRepository` doblado por `vi.mock` (espía compartido entre instancias) e IP
  fija; repite el mismo enlace `tope + 3` veces y exige que `empresaDelCambioCorreo` se llame solo
  `tope` veces. El limitador ya era un singleton del módulo (`const limitador` en
  `lib/actions/confirmar-correo.ts`): no hizo falta tocar el código.
  - Mutación S4a (`new ResetRateLimiter()` por petición en `buildConfirmarCorreoService`): ROJO,
    «expected "vi.fn()" to be called 5 times, but got 8 times».
  - Mutación S4b (sin pasar limitador; usa el `= new ResetRateLimiter()` del constructor): ROJO, el
    mismo mensaje.
- **m1 (R1627).** El test de integración de R1622 crea dos filas `session` de la persona antes de
  `aplicarCambioCorreo` y exige que sigan las dos después. Mutación (`tx.session.deleteMany` del
  usuario dentro del canje): ROJO. El `afterAll` borra las sesiones de los usuarios del archivo.
- **m5.** `abrirCambioCorreo` traduce el P2002 del índice `usuario_cambio_correo_abierto` a
  `CambioCorreoSimultaneoError` (`IUserRepository.ts`); `solicitarCambioCorreo` lo devuelve como
  `{ status: "conflict", campo: "email", mensaje }` con «Se estaba pidiendo otro cambio de correo para
  este usuario al mismo tiempo. Vuelve a intentarlo.», sin enviar ni anular. El design no definía
  respuesta para la carrera; el `conflict` sin `mensaje` sigue siendo R1611 («Ya está en uso»). La UI
  del PR 3 debe mostrar `mensaje` cuando venga.
  - Integración: una transacción de otro cliente abre un pendiente sin confirmar; el `create` del
    repositorio espera en el índice (se comprueba en `pg_stat_activity`, no con un tiempo fijo) y al
    confirmar sale `CambioCorreoSimultaneoError`. Mutación (re-lanzar el P2002 crudo): ROJO.
  - Unit: conflict con mensaje, sin envío ni anulación; otro error se propaga. Mutación (no capturar):
    ROJO.
- **m7.** La plantilla dice «Tu administrador pidió cambiar el correo de tu cuenta a este. El cambio
  está pendiente: confírmalo para empezar a entrar con él.»; design §8 al día; el test de R1610 lo
  fija. Mutación (texto anterior): ROJO.

## Deuda anotada (no se toca en este PR)

- **m3:** diferencia de tiempo entre enlace inexistente/cerrado (sin hash) y abierto con secreto
  incorrecto. Mismo patrón que `PasswordResetService`; cierre posible con un `verifyPassword` contra
  un hash señuelo.
- **m4:** `ConsoleEmailSender` (previo) escribe `to=` sin SMTP o con dominios reservados, y con su
  bandera de debug el cuerpo con la URL. Choca con la letra de R1632 en dev/CI; es de SL-41.
- **m6:** un reenvío fallido deja al usuario sin pendiente (R1616 + R1617). Lo cubre la UI del PR 3,
  que debe mostrar que ya no hay nada pendiente.

## R → test (añadidos de esta vuelta)

| R | Test |
|---|---|
| R1629 | `tests/unit/actions/confirmar-correo.test.ts` › «R1629: sin deps.service, el límite por (enlace, IP) cuenta entre peticiones del composition root» |
| R1627 | `tests/integration/db/usuario-cambio-correo.test.ts` › «R1622/R1627: … y conserva las sesiones» |
| m5 | `tests/integration/db/usuario-cambio-correo.test.ts` › «m5 (review PR 2): dos «Pedir cambio» a la vez …»; `tests/unit/services/usuario-service-cambio-correo.test.ts` › dos tests «m5» |
| m7 | `tests/unit/services/usuario-service-cambio-correo.test.ts` › «R1610/R1614/R1621 …» |

## Salida real (vuelta 2)

- Tests de la vuelta (base `servi_slt221_fix`): `usuario-cambio-correo` (integración) 10 passed,
  `usuario-service-cambio-correo` 24 passed, `confirmar-correo` (acción) 5 passed.
- Mutaciones: 6/6 ROJAS (S4a, S4b, m1, m5 repo, m5 servicio, m7).
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` sobre `servi_slt221_fix`: `✓ typecheck paso`,
  `✓ lint paso`, lotes de tests en verde, `== init OK ==`, `INIT_EXIT=0` (primera corrida).
- Tamaño: `34/40 archivos, 908/1000 líneas de producción, 1131/3000 de tests` (aviso del 80%).

Veredicto: B1, m1, m5 y m7 arreglados y probados con mutación; m3, m4 y m6 quedan como deuda anotada.

---

# PR 3 — UI del cambio de correo (T3.1-T3.3), frontend_dev, 2026-11-20

T2.0 omitido por decisión de Carlos (2026-11-19): componentes de hoy, sin canvas. El bloque va en
`UsuarioForm`; la página pública copia el marco y las tarjetas de `/recuperar-contrasena`.

## Archivos

- Creados: `app/(app)/configuracion/_components/CambioCorreoUsuario.tsx`,
  `app/recuperar-contrasena/confirmar-correo/page.tsx`,
  `app/recuperar-contrasena/confirmar-correo/_components/ConfirmarCorreoForm.tsx`,
  `tests/unit/components/cambio-correo-usuario.test.tsx`, `e2e/usuario-cambio-correo.spec.ts`.
- Modificados: `app/(app)/configuracion/_components/UsuarioForm.tsx` (monta el bloque en edición; no
  para una cuenta `apiKey`, R1613), `lib/actions/usuarios.ts` y `lib/actions/confirmar-correo.ts` (solo
  se quitan los cuatro `@sin-superficie`), `tests/unit/components/usuario-form.test.tsx` (el mock de
  acciones gana las tres del bloque), `playwright.config.ts` (E2E en `aislamiento`),
  `specs/SLT-221-corregir-correo-cedula/tasks.md` (T2.0, T3.1-T3.3 y archivos esperados).
- Sin cambio de backend. La fecha del vencimiento usa `formatFechaHoraLegible` de Configuración › API.
- `docs/ayuda`: tasks.md no pide entrada.

## Mapa R → test

| R | Test |
|---|---|
| R1617 | `cambio-correo-usuario.test.tsx` (envio_fallido al pedir y al reenviar: aviso y relectura sin pendiente) |
| R1618 | `cambio-correo-usuario.test.tsx` (sin pendiente, con pendiente y fecha, vencido; error de lectura) + E2E paso 1 |
| R1619 | `cambio-correo-usuario.test.tsx` (cancelar y cancelar fallido) + E2E paso 2 (pendiente anulado en la base) |
| R1620 | `cambio-correo-usuario.test.tsx` (reenviar pide el MISMO correo y muestra el vencimiento nuevo) |
| conflict / validation_error | `cambio-correo-usuario.test.tsx` (junto al campo; el motivo del servidor tal cual) |
| R1622 | E2E pasos 6, 8 y 9 (correo cambiado en la base, entra con el nuevo y no con el anterior, fila del Histórico) |
| R1623 | E2E paso 7 (el mismo enlace otra vez: mensaje genérico) |
| R1624 | texto en `ConfirmarCorreoForm` (`correo_en_uso`); el caso lo prueban los tests de servicio y acción del PR 2 |
| R1626, R1628 | E2E paso 5 (sin sesión; al abrir, correo y pendiente intactos y el fragmento sale de la barra) |

## Salida real

- `pnpm run typecheck`: exit 0. `eslint` sobre los 9 archivos tocados: exit 0.
- `vitest run cambio-correo-usuario.test.tsx usuario-form.test.tsx`: 2 files, 51 passed (13 + 38).
- E2E local. `servi_slt221_e2e` ya existía (del PR 1) y no se resetea: base NUEVA `servi_slt221_e2e_pr3`,
  `prisma migrate deploy` exit 0, `pnpm run db:seed` exit 0, `next build` con
  `NEXT_PUBLIC_APP_URL`/`APP_BASE_URL` en `localhost:3321` exit 0.
  `E2E_PUERTO=3321 E2E_STORAGE_PUERTO=54521 pnpm exec playwright test e2e/usuario-cambio-correo.spec.ts
  e2e/usuario-corregir-cedula.spec.ts`: **12 passed, 0 failed, E2E_EXIT=0** (los 2 SLT-221 + 10 de la
  dependencia `plataforma-vacia`, que incluye `superadmin-empresas`, el otro spec de `/recuperar-contrasena`).
  Primera vuelta roja: `getByRole("alert")` chocaba con el anunciador de rutas de Next; se afirma por texto.
- `./init.sh`: ver la línea de la tanda en `progress/features/SLT-221.md`.

Veredicto: UI del cambio de correo hecha; E2E verde en local; el tamaño del PR mide contra `dev` sin el PR 2.

---

# PR 3 — m5 y m6 de la review del PR 2 en la UI, frontend_dev, 2026-11-20

Merge de `origin/feature/SLT-221-correo-backend` (vuelta 2 del PR 2): solo chocaban `progress/`.

## Archivos

- `app/(app)/configuracion/_components/CambioCorreoUsuario.tsx`: un `conflict` con `mensaje` muestra
  ese texto (junto al campo al pedir; en el aviso del bloque al reenviar); sin `mensaje`, «Ya está en
  uso por otro usuario» (R1611).
- `tests/unit/components/cambio-correo-usuario.test.tsx`: dos tests m5 y el de reenvío fallido
  reforzado para m6.

## R → test (añadidos)

| R | Test |
|---|---|
| m5 | `cambio-correo-usuario.test.tsx` › «m5 conflict con mensaje …» y «m5 al reenviar …» |
| m6 (R1616 + R1617) | `cambio-correo-usuario.test.tsx` › «R1617/m6 al reenviar: envio_fallido avisa, relee el estado y el bloque queda sin pendiente» |

## Salida real

- Componentes (`cambio-correo-usuario` + `usuario-form`): 2 files, 53 passed.
- Mutaciones: m5 (`return T.enUso` siempre) ROJO 2 tests; m6 (sin `mutate()` tras un error) ROJO 2 tests.
- `./init.sh` (servi_slt221_fix): `INIT_EXIT=1`, solo por tamaño (42/40 archivos, 1371/1000 líneas de
  producción contra `dev` sin #258).
- A mano: `typecheck` 0, `lint` 0, `test:guardias` 0 (360 files, 5424 passed, 1 skipped),
  `test:rapido` 1: un rojo NUEVO fuera del área, `satelite-detalle-sin-dinero-empresa-sql-real` (R460,
  `AppErrorCode inesperado INTERNAL`); solo pasa 8/8. Antes, una corrida en paralelo con las
  guardias tumbó un worker de vitest.
- E2E (`servi_slt221_e2e_pr3`, `next build` exit 0, `E2E_PUERTO=3321`): `usuario-cambio-correo` +
  `usuario-corregir-cedula`: 12 passed, `E2E_EXIT=0`.

Veredicto: m5 y m6 cubiertos en la UI y probados con mutación; rojo solo por tamaño (#258 fuera de dev) y un flaky ajeno.
