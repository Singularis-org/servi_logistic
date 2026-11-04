# SL-42 — bitácora de implementación (backend_dev)

## Tanda T1 (T1.1, T1.2) — 2026-11-03

### Archivos
Creados:
- `db/migrations/20261103120000_vehiculo_activo/migration.sql` + `down.sql`
- `db/migrations/20261103120100_vehiculo_rastro/migration.sql` + `down.sql`
- `lib/repositories/registrar-rastro-vehiculo.ts` (`appendRastroVehiculo(tx, entrada)`, escritor único)
- `tests/integration/db/vehiculos-plataforma.test.ts` (R22; T2 añade R6, R7, R21)

Modificados:
- `db/schema.prisma`: `activo Boolean @default(true)` en `Vehiculo`; `enum VehiculoRastroAccion`; `model VehiculoRastro`
- `lib/db/modelos-de-negocio.ts`: `VehiculoRastro` en `MODELOS_DE_PLATAFORMA`
- `tests/integration/db/vehiculos-migration.test.ts`: bloques SL-42/R23 (estático + Postgres)

### R → test
- R22 → `tests/integration/db/vehiculos-plataforma.test.ts` › «R22 — SQL a mano con servi_app: SELECT, INSERT, UPDATE y DELETE de `vehiculo_rastro` dan 42501» y «R22 — por el cliente de la app en contexto de empresa: leer o escribir el rastro se rechaza»
- R23 → `tests/integration/db/vehiculos-migration.test.ts` › «SL-42/R23 — el up y el down, contra Postgres» (filas previas activas; el down quita la columna con las mismas filas) y «SL-42/R23 — `servi_app` sigue sin escribir `vehiculos`» (INSERT/UPDATE/DELETE → 42501); más la forma en disco.

### Verificación
Con `DATABASE_URL` en la base local `logistic` (2026-11-03, `NODE_OPTIONS=--max-old-space-size=8192`):
- `pnpm exec prisma migrate deploy`: aplicó `20261103120000_vehiculo_activo` y `20261103120100_vehiculo_rastro`
  («All migrations have been successfully applied»).
- `pnpm run typecheck` (`tsc --noEmit`): sin errores.
- `pnpm run lint`: `✖ 234 problems (0 errors, 234 warnings)`, todos heredados; ninguno en los archivos de esta tanda.
- `pnpm exec vitest run tests/unit/guards/organizacion-en-modelos.guardia.test.ts tests/integration/db/vehiculos-migration.test.ts tests/integration/db/vehiculos-plataforma.test.ts`:
  `Test Files 3 passed (3)`, `Tests 33 passed (33)`, **0 skipped**. Los casos contra Postgres CORRIERON:
  R22 (SQL con servi_app → 42501; cliente de la app en contexto de empresa → rechazo), R23 (up: filas previas
  activas; down: quita la columna, idempotente; servi_app: INSERT/UPDATE/DELETE en `vehiculos` → 42501).
- Tras los tests la base quedó con las dos migraciones aplicadas: columna `vehiculos.activo` presente, tabla
  `vehiculo_rastro` presente, ambas filas de `_prisma_migrations` terminadas y sin rollback.
- `pnpm exec vitest related --run <archivos cambiados>`: **no terminó**. Claude Code lo paró por falta de
  memoria en el sistema, así que no hay resultado. Queda para CI (`gate-completo`) o para correrlo a mano.

### Veredicto
T1.1 y T1.2 hechas: migraciones aplicadas, guardia y tests de R22/R23 en verde contra Postgres; `vitest related` pendiente (lo paró la falta de memoria).

## Tanda T2 (T2.1 hecha; T2.2–T2.6 PARADAS) — 2026-11-04

### Archivos
Modificados:
- `lib/types/vehiculos.ts`: `activo` en `VehiculoDTO`; `renombrarVehiculoSchema` y `cambiarActivacionVehiculoSchema` (`strict`, con `id` dentro del objeto) y sus tipos de entrada.
- `lib/repositories/VehiculoRepository.ts`: `toDTO` devuelve `activo` (solo eso, para que compile; el resto de T2.2 no se tocó).
- `tests/unit/types/vehiculos.test.ts`: bloque «SL-42/R9».
- Fixtures con `activo: true`: `tests/unit/services/vehiculo-service.test.ts`, `tests/integration/actions/vehiculos-action.test.ts`, `tests/components/TarifasAlineacionRejilla.test.tsx`, `tests/components/TarifasClaridadMontos.test.tsx`.

### R → test (esta tanda)
- R9 → `tests/unit/types/vehiculos.test.ts` › «SL-42/R9 — renombrar y cambiar la activacion validan la entrada entera» (vacío, <2 y >40 tras normalizar, campo desconocido en los tres schemas, id vacío, `activo` no booleano). La parte del borde (`validation_error` por campo) queda para T2.4.

### Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck`: sin errores (tras añadir `activo` a las fixtures tipadas como `VehiculoDTO`).
- `pnpm exec eslint` sobre los archivos de lib y el test de tipos: sin salida (0 problemas).
- `pnpm exec vitest run tests/unit/types/vehiculos.test.ts tests/unit/services/vehiculo-service.test.ts tests/integration/actions/vehiculos-action.test.ts tests/components/TarifasAlineacionRejilla.test.tsx tests/components/TarifasClaridadMontos.test.tsx`: `Test Files 5 passed (5)`, `Tests 46 passed (46)`. Sin integración contra Postgres en esta task.

### Bloqueo de T2.2 (hueco del design, sin decidir)
R21 pide congelar el **nombre** del actor en `vehiculo_rastro`. El nombre está en `usuario`, que es modelo de **negocio** (`lib/db/modelos-de-negocio.ts`). El design §3 (alternativa A3) descarta `comoPlataforma` porque supone que «ninguna operación toca una tabla de negocio». Pero sin contexto, la extensión rechaza todo modelo de negocio con `EmpresaNoResuelta` (`lib/db/extension-empresa.ts`, `aplicar`, rama `!ctx`), también dentro de la `$transaction` interactiva. `resolverActorCongelado(tx, id)` fallaría así, y R7 lo prohíbe. Los precedentes leen el actor dentro de `comoPlataforma`: `PlanesRepository` (SL-24, en `EXCEPCIONES_DE_PLATAFORMA`) y `geografia-plataforma.ts` (SL-20). Hace falta decisión humana; opciones en el informe al leader.

Un segundo punto para T2.4: `app/(app)/configuracion/vehiculos/_components/VehiculosModule.tsx` importa `crearVehiculo`, `actualizarVehiculo` y `borrarVehiculo`. Sacarlos de `lib/actions/vehiculos.ts` antes de T4.2 deja el typecheck rojo, y backend no toca `app/`.

### Veredicto
T2.1 hecha y verde. T2.2–T2.6 paradas por el hueco del contexto de datos para el actor del rastro (R7 contra R21).

## Tanda T2, continuación (T2.2–T2.6) — 2026-11-04

Desbloqueo: decisión del humano del 2026-11-04, enmienda del spec en `7ae9e721`:
- el borde corre dentro de `comoPlataforma("SL-42", …)` y entra en `EXCEPCIONES_DE_PLATAFORMA`;
- T2.4 se commitea junto con T4.2, sin stubs.

### Commits
- `763ff8d1` T2.2 — `VehiculoRepository`: `findMany({ soloActivos })`, `create`/`rename`/`setActivo` con su rastro en la misma `$transaction`; el no-op se decide otra vez dentro de la tx. Sin `delete` ni `contarUsos`.
- `44b5c879` T2.3 — `VehiculoService`:
  - `GESTION_ROLES = ROLES_PLATAFORMA`; `listar` sigue con `READ_ROLES = ["maestro"]`;
  - nuevos `listarTodos`, `renombrar` y `cambiarActivacion`;
  - sin `actualizar` ni `borrar`.
- `dc4da3eb` T2.5 — `vehiculo_borrado` sin escritor (`SIN_ESCRITOR_DESDE`, SL-42). El valor se queda en el enum y en las categorías; las contrapruebas que usaban `VehiculoRepository.delete` ahora usan `PlantillaMensajeRepository.softDelete`.
- `ffe58d9b` T2.6 — guardia `superadmin-fuera-de-empresa`:
  - `GESTION_ROLES` de `VehiculoService` en `EXCEPCIONES_DE_LISTA` (`soloPlataforma: true`);
  - `/plataforma/vehiculos` en `HREFS_ITEMS_PLATAFORMA`;
  - dos contrapruebas: el servicio real mutado con `maestro` sale rojo, y «Vehículos» con literal, con `maestro` o con subítems sale rojo.
- Entre `763ff8d1` y `44b5c879` el typecheck queda rojo: el servicio todavía llamaba a `update`, `delete` y `contarUsos`. En `44b5c879` solo quedan los errores de `lib/actions/vehiculos.ts`, que se resuelven en T2.4.

### T2.4 — SIN COMMIT (va con T4.2, decisión 2026-11-04)
En el árbol de trabajo, sin commitear:
- `lib/actions/vehiculos-plataforma.ts` (nuevo): sesión → `exigirSuperadmin` → zod → servicio dentro de `comoPlataforma("SL-42", MOTIVO)`.
  - Errores: `conflict` solo si `esViolacionDeUnico`; cualquier otro fallo, `error` con `console.error("[vehiculos-plataforma] fallo <op> causa=<error.name>")`.
- `lib/actions/vehiculos.ts`: solo `listarVehiculos`.
- `lib/db/excepciones-aislamiento.ts`: entrada `lib/actions/vehiculos-plataforma.ts`, ficha SL-42, motivo del design §3.
- `lib/modulos/reparto.ts`: `"vehiculos-plataforma": "nucleo"`.
- `lib/types/vehiculos.ts`: fuera `actualizarVehiculoSchema`, `ActualizarVehiculoInput` y `VehiculoActionError` (con su `in_use`), que no tienen más llamadores.
- `lib/types/gestion-orden.ts`: un comentario que nombraba `VehiculoActionError`.
- `tests/unit/actions/vehiculos-plataforma-action.test.ts` (nuevo).
- `tests/integration/actions/vehiculos-action.test.ts`: doble del servicio nuevo; afirma que el archivo solo exporta `listarVehiculos`.
- `tests/integration/db/vehiculos-plataforma.test.ts`: bloque del borde (R7, R21).
- `specs/.../tasks.md`: T2.4 marcada `[x]`.

**Rojos esperados hasta T4.1/T4.2:**
- **typecheck:** solo los 3 `TS2305` de `app/(app)/configuracion/vehiculos/_components/VehiculosModule.tsx`, que importa `crearVehiculo`, `actualizarVehiculo` y `borrarVehiculo`. T4.2 borra la pantalla.
- **guardia `superficie-de-uso`:** las 4 actions de `vehiculos-plataforma.ts` no tienen superficie hasta que exista la página `app/(app)/plataforma/vehiculos/` (T4.1). No se anotó `@sin-superficie`: la superficie llega en la tanda de frontend.

### R → test (esta continuación)
- R2 → `vehiculo-service.test.ts` › «listarTodos — R2»; integración › «R6/R21 — desactivar…» (`findMany()` trae el inactivo; `soloActivos` no).
- R4 → `vehiculo-service.test.ts` › «crear › R4»; `vehiculos-plataforma-action.test.ts` › «R4: el servicio recibe el nombre ya normalizado»; integración del borde › «R7/R21: alta, renombre…» (normaliza y queda activo).
- R5 → `vehiculo-service.test.ts` › «renombrar › R5» (incluido «a su propio nombre es ok sin escribir»); integración › «R5/R21 — el renombre deja anterior y nuevo…».
- R6 → `vehiculo-service.test.ts` › «cambiarActivacion › R6» y «pedir el estado que ya tiene»; integración › «R6/R21 — desactivar no borra la fila ni toca al mensajero ni a la tarifa…».
- R7 → integración › «R7/R21 — el alta del superadmin sin empresa…» (repositorio) y bloque «el borde del superadmin sin empresa, por el cliente de la app» (cliente real `conAislamientoPorEmpresa`, sin empresa; con control: sin `comoPlataforma` → `EmpresaNoResuelta`).
- R8 → `vehiculos-plataforma-action.test.ts` › «R8: el modulo exporta exactamente las cuatro actions»; el contrato del servicio y del repositorio ya no tiene borrado.
- R9 → `vehiculos-plataforma-action.test.ts` › «R9 — `validation_error` con el error en su campo» (más `tests/unit/types/vehiculos.test.ts` de T2.1).
- R10 → `vehiculo-service.test.ts` › «R10» (activo o inactivo); acción › «R10: el unico violado en carrera es conflict»; integración (repo y borde).
- R11 → `vehiculos-plataforma-action.test.ts` › «R11 %s: permission denied -> error…» en las tres escrituras (log con causa y sin el nombre del vehículo ni el mensaje de la base) y «causa=desconocido».
- R12 → servicio, acción e integración (`not_found` sin rastro).
- R14 → servicio › «R14 — cada rol de empresa (maestro incluido)…» (barrido de `RolValue`, sin tocar el repositorio); acción › «R14 — sin sesion o con un rol de empresa…» en las cuatro actions; `vehiculos-action.test.ts` › «el archivo de empresa ya no exporta escrituras»; guardia `superadmin-fuera-de-empresa` (contraprueba con `maestro`).
- R17 → `vehiculo-service.test.ts` › «R17: el maestro sigue listando»; `vehiculos-action.test.ts`.
- R20 → `vehiculo-service.test.ts` › «R20» (ni servicio ni repositorio importan `appendAccion`/`historialAccion`); guardia `historial-accion-escrituras-cubiertas` › «SL-42 (P1): `vehiculo_borrado` esta sin escritor…» con su contraprueba.
- R21 → integración, repo y borde: una fila por escritura con la acción, el id, el nombre congelado, el actor (id y nombre) y, en el renombre, el anterior y el nuevo; ninguna fila en los no-op.

### Verificación (NODE_OPTIONS=--max-old-space-size=8192; DATABASE_URL local, comprobado `localhost` sin imprimirla)
- `vitest run tests/integration/db/vehiculos-plataforma.test.ts`: `Tests 10 passed (10)`, **0 skipped**. CORRIÓ contra Postgres.
  - R22: 2 casos.
  - Repositorio en una transacción revertida: 5 casos.
  - Borde por el cliente de la app con datos commiteados: 3 casos. `afterAll` los borra; comprobado después con una consulta: 0 vehículos `sl42 %` y 0 filas de rastro.
  - La base local ya tiene un superadmin con filas que lo referencian, así que no se puede borrar ni pasar a una empresa (SL017). En la tx revertida los casos usan ese superadmin con el nombre fijado solo dentro de la tx; el borde lo usa tal cual. En CI, sin superadmin, se siembra uno y se borra al final.
- `vitest run tests/unit/services/vehiculo-service.test.ts tests/unit/services/usuario-vehiculo.test.ts`: `Tests 25 passed (25)`.
- `vitest run tests/unit/actions/vehiculos-plataforma-action.test.ts tests/integration/actions/vehiculos-action.test.ts`: `Tests 33 passed (33)`. Tras corregir el tipado de un doble, el de la acción corrió solo: `30 passed (30)`.
- Guardias en una sola llamada:
  - archivos: `plataforma-solo-en-lista`, `modulos-reparto`, `superadmin-fuera-de-empresa`, `organizacion-en-modelos`, `379-maestro-sin-bloqueo`, `landing-sin-maqueta`, `superficie-de-uso`, las 7 `historial-accion*`, `catalogo-y-choke-point` y `guard-dependencias-aprobadas`;
  - resultado: `Test Files 1 failed | 15 passed (16)`, `Tests 1 failed | 363 passed (364)`. El único rojo es el esperado de `superficie-de-uso`.
- `pnpm run typecheck`: solo los 3 `TS2305` esperados de `VehiculosModule.tsx` (tras el arreglo del doble).
- `pnpm run lint`: `✖ 234 problems (0 errors, 234 warnings)`, el mismo número que en T1: ninguno nuevo.

### Veredicto
T2.2, T2.3, T2.5 y T2.6 commiteadas. T2.4 está hecha y sin commitear, a la espera de T4.2. Los únicos rojos son los esperados: typecheck de `VehiculosModule.tsx` y `superficie-de-uso` hasta T4.1.

## T4 — Interfaz (frontend_dev, 2026-11-04)

T4.1–T4.4 hechas. Van en el mismo commit que T2.4. T4.2 tenía que ir con T2.4 (decisión 2026-11-04). T4.3 y T4.4 también entran ahí, porque sin ellas ese commit queda rojo: el menú y la ayuda apuntarían a la ruta borrada (`ayuda-pantalla-ruta-existe`, R16 del menú).

### Archivos
- Creados:
  - `app/(app)/plataforma/vehiculos/page.tsx`: `notFound()` antes de leer y `cargaError` como bandera.
  - `app/(app)/plataforma/vehiculos/_components/VehiculosPlataformaModule.tsx`: tabla con nombre y estado; acciones «Crear», «Renombrar» y «Desactivar»/«Activar»; sin borrar.
  - `app/(app)/plataforma/vehiculos/_components/vehiculos-plataforma-textos.ts`.
  - `tests/unit/components/vehiculos-plataforma-page.test.tsx`.
- Borrados:
  - `app/(app)/configuracion/vehiculos/page.tsx`
  - `app/(app)/configuracion/vehiculos/_components/VehiculosModule.tsx`
  - `docs/ayuda/oficina/configuracion-vehiculos.md`
- Modificados:
  - `lib/modulos/reparto.ts`: sale `/configuracion/vehiculos` y entra `/plataforma/vehiculos` en `MODULO_POR_RUTA`.
  - `lib/auth/menu-visibility.ts`: sale el subítem del `maestro`; entra el ítem «Vehículos» con `ROLES_PLATAFORMA` y `IconKey` `"car"`, después de «Geografía».
  - `app/(app)/_components/Sidebar.tsx`: `car: Car`.
  - `tests/unit/auth/menu-visibility.test.ts`
  - `tests/components/Sidebar.test.tsx`
  - `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`: `maestro` pasa de 25 a 24 y `superadmin` de 3 a 4.
  - `tests/unit/guards/asistente-sin-frontmatter.guardia.test.ts`: pasa de 38 a 37 documentos.
  - `specs/.../tasks.md`: T4.1–T4.4 `[x]`.

### R → test (T4)
- R1:
  - `vehiculos-plataforma-page.test.tsx` › «R1 — la puerta, antes de leer»: 404 a los 6 roles de empresa y sin sesión, sin llamar a la action.
  - `menu-visibility.test.ts` › «SL-42 — ítem «Vehículos» del superadmin» › R1 (solo el superadmin lo ve; un ítem con `car` y sin subítems).
- R2 → `vehiculos-plataforma-page.test.tsx` › «R2 — el listado»: activos e inactivos por nombre con su estado; un fallo de carga muestra el aviso, sin estado vacío ni tabla; el vacío real sí dice «aún no hay».
- R3 → `menu-visibility.test.ts` › «R3: el aterrizaje del superadmin sigue en «Empresas»…» y «R36: el superadmin ve exactamente…».
- R4, R5, R6 (UI) → `vehiculos-plataforma-page.test.tsx` › «R4–R6, R8».
- R8 (UI) → `vehiculos-plataforma-page.test.tsx` › «R8: no ofrece borrar».
- R13 → `vehiculos-plataforma-page.test.tsx` › «R13 — un mensaje por desenlace»:
  - `conflict` y `validation_error` junto al campo;
  - `not_found`, `forbidden`, `unauthenticated` y `error` con su propio mensaje, nunca «ya existe»;
  - los seis desenlaces son distintos entre sí, y solo `conflict` dice «ya existe»;
  - el cambio de estado también.
- R15 → `menu-visibility.test.ts` › «R15: el maestro no ve /configuracion/vehiculos en ningún ítem…».
- R16:
  - `vehiculos-plataforma-page.test.tsx` › «R16 — /configuracion/vehiculos ya no existe»;
  - `menu-visibility.test.ts` › «R16: ningún ítem ni subítem…».
  - El E2E es T5.1.
- R19 → la guardia `ayuda-pantalla-ruta-existe` sigue verde y no queda ninguna ayuda con `configuracion-vehiculos` ni con `/configuracion/vehiculos`.

### Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck`: 0 errores. Los 3 `TS2305` esperados desaparecen con el borrado.
- Tests de esta tanda, en una llamada, por ruta:
  - archivos: `vehiculos-plataforma-page`, `menu-visibility`, `Sidebar`, `vehiculos-plataforma-action` y las guardias `superficie-de-uso`, `superadmin-fuera-de-empresa`, `modulos-reparto`, `ayuda-pantalla-ruta-existe`, `asistente-sin-frontmatter` y `pwa-manifiesto-atajos`;
  - resultado: `Test Files 10 passed (10)`, `Tests 248 passed (248)`.
- `pnpm run test:guardias`: `Test Files 2 failed | 321 passed | 3 skipped (326)`, `Tests 5 failed | 4530 passed`.
  - `dependencias-declaradas-presentes` (4): está en la baseline.
  - `geografia-predicado-unico` › «ningun otro archivo de `lib/` escribe `activo: true`…» (1): **no lo causa esta tanda**. Señala `lib/repositories/VehiculoRepository.ts:32` y `:50` (`{ activo: true }`), del commit 763ff8d1 (T2.2, backend). Lo tiene que resolver backend_dev; frontend no toca ese archivo.
- `pnpm run lint`: `✖ 234 problems (0 errors, 234 warnings)`, el mismo número que en T1/T2, así que ninguno es nuevo. `eslint` sobre los archivos tocados no da ningún aviso.

### Veredicto
T2.4 y T4.1–T4.4 hechas, en el commit 564b6532. Typecheck en 0 y `superficie-de-uso` en verde. Queda un rojo de backend que viene de T2.2, no de esta tanda: `geografia-predicado-unico` sobre `VehiculoRepository.ts`.
