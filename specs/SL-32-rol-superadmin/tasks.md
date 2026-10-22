# SL-32 — Tareas

Cada tanda cierra con `./init.sh` en verde en el worktree. El log lleva `INIT_EXIT=$?` escrito
dentro, y se hace un commit por tanda.

## Precondición

- [ ] **T0. SL-17 integrada en `dev`.** Cambió el 2026-10-22 (Carlos): SL-28 va después de SL-17, y
  la migración de SL-32 va encima de la de SL-17, porque las dos tocan `usuario`. Solo bloquea la
  **tanda 3** y lo que depende de ella. Antes de crear las migraciones:
  1. `git fetch` y merge de `origin/dev` en la rama;
  2. comprobar que la última migración de `db/migrations/` es la de SL-17, o posterior;
  3. leer cómo dejó SL-17 `usuario.organizacion_id` (`design.md > Multi-empresa`):
     - que admite `NULL`; si no, se para y se pregunta;
     - qué únicos dejó para el email y el documento, que fijan el `conflicto` del comando;
     - si hay una regla que impida `NULL` a un usuario de empresa. Si no la hay, se propone el `CHECK`
       al humano antes de la tanda 3;
  4. `pnpm exec prisma migrate status` en limpio sobre una base local recién migrada.

  **Hecho cuando:** el SHA de `dev` con SL-17 y las respuestas del punto 3 quedan anotados en
  `progress/impl_SL-32.md`.

## Tanda 1 — D7: gestionar la geografía es de la plataforma (no depende de T0)

- [x] **T1. Texto y guardia** (R22, R23). Antes, confirmar con `scripts/archivos-en-vuelo.mjs` que
  SL-15 y SL-16 no tienen esos archivos en vuelo.
  - `lib/api/openapi-spec.ts:2006` pasa a `${MARCA.nombre}`; si `EMPRESA` deja de usarse, se quita
    el import.
  - En el YAML (l. 1944) y en el CHANGELOG (l. 572), «La empresa» pasa a «Servi Logistic».
  - En la guardia de SL-16, las dos frases salen de `FRASES_OPERADOR` y entran en
    `FRASES_PLATAFORMA` con su forma nueva, y `DESCRIPCIONES_QUE_CAMBIAN` cambia a
    `"Servi Logistic puede retirar una"`.
  - Si el suelo `>= 156` de `FRASES_OPERADOR` deja de cumplirse, se baja a mano con su motivo.

  **Hecho cuando:**
  - `pnpm exec vitest related --run lib/api/openapi-spec.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts`
    sale en verde;
  - una mutación que devuelve «La empresa» al YAML la pone en rojo (se prueba y se revierte).
- [x] **T1b. Texto de la ayuda** (R26, la parte de la ayuda). Entra con el cambio de alcance del
  2026-10-22.
  - `docs/ayuda/oficina/configuracion-geografia.md` dice que la geografía la gestiona la plataforma,
    Servi Logistic: alta, cambio de nombre, retiro y reactivación. La oficina se la pide (`design.md >
    GeografiaService, la acción y la pantalla`).
  - Deja de describir controles que la oficina ya no tendrá, y se actualiza `actualizado:`.
  - El permiso y el menú no cambian aquí: van en T11.

  **Hecho cuando:** las guardias de ayuda (`vitest related` sobre el archivo) están en verde, y el
  texto no dice que la oficina da de alta, renombra, retira ni reactiva.

## Tanda 2 — La regla del comando, sin Prisma (no depende de T0)

- [x] **T2. [P] Tipos, contratos y servicio** (R12–R16).
  - `lib/types/arranque-superadmin.ts`: schema zod de las seis variables de R12 y el tipo
    `ArranqueSuperadminResultado`.
  - `lib/interfaces/services/IArranqueSuperadminService.ts` y
    `lib/interfaces/repositories/IArranqueSuperadminRepository.ts`.
  - `lib/services/ArranqueSuperadminService.ts`: valida, hashea **antes** de llamar al repositorio
    y traduce los desenlaces. No importa `@prisma/client`.

  Tests en `tests/unit/services/arranque-superadmin-service.test.ts`, con un repositorio doble:
  - cada variable ausente o inválida da `entrada_invalida` con su nombre y sin su valor, y el
    repositorio no se llama;
  - una contraseña débil se rechaza con la regla de `strongPasswordSchema`;
  - `ya_existe`, `conflicto` y `catalogo_incompleto` se propagan;
  - el repositorio recibe un hash bcrypt verificable y nunca la contraseña en claro;
  - la salida serializada no contiene ni la contraseña ni el email.

  **Hecho cuando:** los tests están en verde y cada aserción de R13/R16 ha matado una mutación
  (devolver el valor en el mensaje, pasar la contraseña en claro).

## Tanda 3 — El rol en la base (depende de T0)

- [ ] **T3. Enum, migraciones e índice de un solo superadmin** (R1, R2, R21, R27).
  - `db/schema.prisma`: `superadmin` en `RolValue`.
  - Dos carpetas encima de la migración de SL-17, `<ts>_rol_superadmin` y `<ts+1>_seed_rol_superadmin`, con
    sus `migration.sql` y `down.sql` (`design.md > Migraciones`). Incluyen:
    - el `id` fijo de la fila de `rol`;
    - la comprobación de que esa fila no exista con otro `id`;
    - el índice parcial `usuario_un_solo_superadmin`.
  - `pnpm exec prisma generate`.

  Test nuevo en `tests/integration/db/un-solo-superadmin.test.ts`, con datos propios:
  - un segundo `INSERT` de un usuario con el rol `superadmin` falla por el índice;
  - un `UPDATE` del `rol_id` de otro usuario al de `superadmin` también falla;
  - el primero se inserta bien.

  Una mutación que quita el índice del `migration.sql` lo pone en rojo.

  Tests: `tests/unit/types/roles.test.ts` pasa de 6 a 7, y `tests/unit/scripts/seed-catalogos.test.ts`
  si cuenta roles.

  **Hecho cuando:**
  - `migrate deploy`, luego `db:rollback` dos veces, y otra vez `migrate deploy`, sobre una base
    local, sin errores;
  - con un usuario superadmin creado a mano en esa base, el rollback de la segunda migración
    **falla** y el usuario sigue ahí;
  - sin superadmin, el rollback quita el índice y la fila;
  - la prueba de drift y `un-solo-superadmin.test.ts` están en verde.

## Tanda 4 — El rol en el código y el comando entero (depende de la tanda 3)

- [ ] **T4. Fuente única y tablas exhaustivas** (R4, R6, R7).
  - Nace `lib/auth/plataforma.ts` (`ROLES_PLATAFORMA` y `esPlataforma`).
  - `ROL_LABELS` añade «Superadmin», `QUIEN_PREGUNTA` añade su frase y `ROLES_SIN_ANALITICA` pasa a
    `["superadmin"]`.
  - Se completan los `Record<RolValue,string>` de `tests/integration/db/push-destinatarios-equivalencia.test.ts`
    y `tests/integration/db/_whatsapp-envios-474.ts`.
  - `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts` pasa de 6 a 7.

  Tests en `tests/unit/auth/plataforma.test.ts`:
  - `esPlataforma` solo para `superadmin`;
  - `itemsVisibles(SIDEBAR_ITEMS, superadmin)` es `[]` y `primerDestino` da `null`;
  - `esAccesoTotal(superadmin)` es `false`.

  **Hecho cuando:** `pnpm run typecheck` está en verde y los tests nuevos también.
- [ ] **T5. [P] Tests que usaban `superadmin` como rol inventado** (R7).
  - En `tests/unit/analytics/productos-alcance.test.ts:132` y
    `tests/unit/analytics/conteo-productos-action.test.ts:130,240,260`, el inventado pasa a otro
    nombre que no exista (por ejemplo `rolInventado`), y se añade un caso real: `superadmin`
    produce `rol_sin_analitica`, o `forbidden` en la action.
  - Test de `AsistenteService`: `superadmin` se rechaza sin componer nada.
  - Se revisan los tests que iteran `Object.values(RolValue)` con una tabla de expectativas
    exhaustiva.

  **Hecho cuando:** `vitest related` sobre `lib/analytics/alcance.ts`, `lib/auth/rol-label.ts` y
  `lib/asistente/instrucciones.ts` sale en verde.
- [ ] **T6. [P] Guardia «superadmin fuera de empresa»** (R3, R4, R5).
  `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`, según
  `design.md > Guardias que cambian`.

  **Hecho cuando:**
  - la guardia está en verde y lleva su contraprueba sintética;
  - añadir `superadmin` a `ROLES_ACCESO_TOTAL` la pone en rojo (se prueba y se revierte).
- [ ] **T7. `UsuarioService` y `UserRepository`** (R8–R11).
  Lo de `design.md > UsuarioService y UserRepository`, incluido `ROLES_FILTRO` menos plataforma.
  Tests:
  - `tests/unit/services/usuario-service-superadmin.test.ts`: R8, R9 y R11, uno por operación,
    con aserción de cero escrituras;
  - `tests/integration/db/usuarios-sin-superadmin.test.ts`: con datos propios (un superadmin y un
    mensajero), `listar`, `listarCompleto` y el conteo no devuelven al superadmin, con y sin filtros.

  Los tests de `usuario-schema.test.ts:253` y `usuarios.test.ts:333` siguen en verde sin cambios.

  **Hecho cuando:** quitar el `notIn` del `where` pone en rojo el test de integración. Se prueba
  contra la base, no con un doble.
- [ ] **T8. Repositorio, script y documentación del comando** (R12–R20).
  - `lib/repositories/ArranqueSuperadminRepository.ts`: transacción, `pg_advisory_xact_lock` y
    traducción de `P2002`.
  - `scripts/arranque-superadmin.ts`, como entrypoint.
  - En `package.json`, `"arranque:superadmin": "tsx scripts/arranque-superadmin.ts"`.
  - En `.env.example`, las variables vacías.
  - En el README, la sección «Usuarios» explica el comando sin valores: se corre a mano, una vez por
    entorno, y fuera del build y de CI (R20).
  - En `fuera-datos-ordenex.guardia.test.ts`, la excepción única con su contraprueba.

  Tests:
  - `tests/integration/db/arranque-superadmin.test.ts`:
    - la primera ejecución crea el superadmin, con `organizacion_id` a `NULL`;
    - repetida, da `ya_existe` sin escrituras;
    - con el email o el documento ocupados, da `conflicto` sin cambiar el rol del otro;
    - sin catálogo, da `catalogo_incompleto`;
    - dos ejecuciones en paralelo dejan un solo superadmin y terminan las dos con código 0 (R17).
      Un `P2002` del índice se traduce a `ya_existe`.
  - `tests/unit/scripts/arranque-superadmin.test.ts`: el código de salida de cada desenlace, y que
    stdout y stderr no contienen ni la contraseña ni el email.

  **Hecho cuando:** los tests están en verde y la guardia de SL-11 sigue en verde con la excepción.
- [ ] **T9. E2E** (R18, R6). `e2e/superadmin-arranque.spec.ts`:
  1. el setup corre el comando con credenciales de prueba;
  2. el superadmin entra por `/login` y pasa el OTP por el emisor de consola;
  3. ve `/dashboard` sin ningún ítem de menú;
  4. `/configuracion` le devuelve 404.

  **Hecho cuando:** `pnpm exec playwright test e2e/superadmin-arranque.spec.ts` sale en verde en
  local.

- [ ] **T11. El módulo de geografía pasa al superadmin** (R24, R25, R26; depende de T4).
  - En `GeografiaService`, `READ_ROLES` y `GESTION_ROLES` según
    `design.md > GeografiaService, la acción y la pantalla`.
  - La página de Geografía cambia su puerta a `esPlataforma(actor.rol)`: `notFound()` al `maestro`.
  - En `lib/auth/menu-visibility.ts`, sale el subítem «Geografía».
  - Se decide el `roles: [maestro, admin]` del frontmatter de la ayuda (T1b lo dejó igual), y se
    revisa que las guardias de ayuda acepten una ayuda de oficina sobre una pantalla que el
    `maestro` ya no abre. Si alguna lo rechaza, se para y se pregunta: no se borra la ayuda por
    cuenta propia.
  - Se ajustan los tests de geografía que lista el design. Se revisan los demás que nombran sus
    operaciones: `geografia-nodo.test.ts`, `geografia-sin-borrado-fisico.guardia.test.ts`,
    `geografia.composition-root.test.ts`, `geografia-admin-page.test.tsx` y
    `geografia-ordenes-sin-entregar.test.ts`. Los tests de Tarifas que leen el árbol siguen en
    verde sin cambios.

  Casos nuevos:
  - en el servicio, el `maestro` da de alta, renombra, retira, reactiva y cuenta → `forbidden`, con
    el repositorio sin llamar;
  - en el servicio, el `maestro` lista el árbol → `ok` (R25, Tarifas);
  - en el servicio, el `superadmin` da de alta, renombra, retira, reactiva, cuenta y lista → `ok`;
  - en la integración, el `maestro` no deja fila en el historial de acciones;
  - en la página, el `maestro` recibe `notFound()`;
  - en el menú, el `maestro` no ve «Geografía» y su `primerDestino` no cambia.

  **Hecho cuando:**
  - `vitest related` sobre `lib/services/GeografiaService.ts`, `lib/auth/menu-visibility.ts` y
    `app/(app)/configuracion/geografia/page.tsx` sale en verde;
  - devolver `"maestro"` a `GESTION_ROLES` pone en rojo el caso del servicio y la guardia de T6
    (se prueba y se revierte);
  - quitar `"maestro"` de `READ_ROLES` pone en rojo el caso de Tarifas (se prueba y se revierte).

## Tanda 5 — Cierre

- [ ] **T10. Deudas y trazabilidad.**
  - En `progress/deudas.md`, D7 queda resuelta con la decisión del 2026-10-22, sin deuda nueva.
  - `progress/impl_SL-32.md` lleva el mapa `R<n> → test`.
  - `./init.sh` en verde.

  **Hecho cuando:** el mapa cubre de R1 a R27 y `INIT_EXIT=0` queda en el log.

## Mapa R → test (previsto)

| R | Test |
|---|---|
| R1, R2 | `tests/unit/types/roles.test.ts`, `tests/unit/scripts/seed-catalogos.test.ts` y la migración en T3 |
| R3, R4, R5 | `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` y la suite existente sin cambios de expectativas para los seis roles |
| R6 | `tests/unit/auth/plataforma.test.ts` y `e2e/superadmin-arranque.spec.ts` |
| R7 | `tests/unit/analytics/productos-alcance.test.ts`, `tests/unit/analytics/conteo-productos-action.test.ts`, `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts` y el test de `AsistenteService` |
| R8, R9, R11 | `tests/unit/services/usuario-service-superadmin.test.ts` |
| R10 | `tests/integration/db/usuarios-sin-superadmin.test.ts`, `tests/unit/types/usuario-schema.test.ts` y `tests/unit/actions/usuarios.test.ts` |
| R12–R15, R17 | `tests/integration/db/arranque-superadmin.test.ts` y `tests/unit/services/arranque-superadmin-service.test.ts` |
| R16 | `tests/unit/services/arranque-superadmin-service.test.ts` y `tests/unit/scripts/arranque-superadmin.test.ts` |
| R18 | `e2e/superadmin-arranque.spec.ts` |
| R19 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R20 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (formas de secreto) y revisión del diff de `.env.example` y el README |
| R21 | verificación de T3 (deploy, rollback y rollback que falla con el superadmin presente), anotada en `progress/impl_SL-32.md` |
| R22, R23 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` |
| R24, R25 | `tests/unit/services/geografia-service.test.ts`, `tests/unit/actions/geografia-action.test.ts`, `tests/integration/db/geografia-registro-accion.test.ts`, `tests/integration/db/geografia-cascada-reversible.test.ts` y `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` |
| R26 | `tests/unit/components/geografia-admin-page.test.tsx` (`notFound()` al `maestro`), `tests/unit/auth/menu-visibility.test.ts` y la revisión del diff de la ayuda (T1b) |
| R27 | `tests/integration/db/un-solo-superadmin.test.ts`, `tests/integration/db/arranque-superadmin.test.ts` (ejecuciones en paralelo) y `tests/unit/services/usuario-service-superadmin.test.ts` (R9) |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/<ts>_rol_superadmin/migration.sql`
- `db/migrations/<ts>_rol_superadmin/down.sql`
- `db/migrations/<ts>_seed_rol_superadmin/migration.sql`
- `db/migrations/<ts>_seed_rol_superadmin/down.sql`
- `lib/auth/plataforma.ts`
- `lib/auth/menu-visibility.ts` (y su test)
- `lib/auth/rol-label.ts`
- `lib/asistente/instrucciones.ts`
- `lib/analytics/alcance.ts`
- `lib/types/usuario.ts`
- `lib/types/arranque-superadmin.ts`
- `lib/interfaces/services/IArranqueSuperadminService.ts`
- `lib/interfaces/repositories/IArranqueSuperadminRepository.ts`
- `lib/services/ArranqueSuperadminService.ts`
- `lib/repositories/ArranqueSuperadminRepository.ts`
- `lib/services/UsuarioService.ts`
- `lib/repositories/UserRepository.ts`
- `lib/api/openapi-spec.ts`
- `lib/services/GeografiaService.ts`
- `app/(app)/configuracion/geografia/page.tsx`
- `app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx`
- `docs/ayuda/oficina/configuracion-geografia.md`
- `tests/unit/services/geografia-service.test.ts`
- `tests/unit/actions/geografia-action.test.ts`
- `tests/unit/components/geografia-admin.ui.test.tsx`
- `tests/unit/components/geografia-admin-page.test.tsx`
- `tests/unit/types/geografia-nodo.test.ts`
- `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts`
- `tests/unit/actions/geografia.composition-root.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`
- `tests/integration/db/un-solo-superadmin.test.ts`
- `scripts/arranque-superadmin.ts`
- `package.json`
- `.env.example`
- `README.md`
- `docs/api/api-key-openapi.yaml`
- `docs/api/CHANGELOG.md`
- `progress/deudas.md`
- `progress/impl_SL-32.md`
- `tests/unit/guards/docs-marca-heredada.guardia.test.ts`
- `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`
- `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts`
- `tests/unit/analytics/productos-alcance.test.ts`
- `tests/unit/analytics/conteo-productos-action.test.ts`
- `tests/unit/types/roles.test.ts`
- `tests/unit/scripts/seed-catalogos.test.ts`
- `tests/unit/auth/plataforma.test.ts`
- `tests/unit/services/arranque-superadmin-service.test.ts`
- `tests/unit/scripts/arranque-superadmin.test.ts`
- `tests/unit/services/usuario-service-superadmin.test.ts`
- `tests/integration/db/arranque-superadmin.test.ts`
- `tests/integration/db/usuarios-sin-superadmin.test.ts`
- `tests/integration/db/push-destinatarios-equivalencia.test.ts`
- `tests/integration/db/_whatsapp-envios-474.ts`
- `e2e/superadmin-arranque.spec.ts`
