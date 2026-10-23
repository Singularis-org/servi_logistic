# SL-32 — Tareas

Cada tanda cierra con `./init.sh` en verde en el worktree. El log lleva `INIT_EXIT=$?` escrito
dentro, y se hace un commit por tanda. El gate de cierre corre cuando acaba toda la tanda, nunca en
paralelo con un subagente que muta el árbol.

## Tandas: qué espera a SL-17 y qué avanza ya

Rehecha el 2026-10-22 con la pantalla «Empresas». «SL-17 en `dev`» quiere decir T0 hecho.

| Tanda | Tasks | ¿Espera a SL-17 en `dev`? | Por qué |
|---|---|---|---|
| 1 | T1, T1b | No. **Hechas** | Texto de la API y de la ayuda |
| 2 | T2 | No. **Hecha** | La regla del comando, sin Prisma |
| 2b | T12 (`/design`), T13 [P] (componente de la pantalla), T14a [P] (servicio del listado con un doble) | **No. Avanzan ya** | No importan `RolValue.superadmin` ni `organizacion`. T13 recibe todo por props |
| 0 | T0 | Es la puerta | Merge de `dev` con SL-17 y lectura de su contrato (P10) |
| 3 | T3 | **Sí** | El enum, el índice y el `CHECK` de R28 van encima de las migraciones de SL-17, y el `CHECK` necesita su columna |
| 4 | T4, T5 [P], T6 [P], T7, T8, T11, T14b | **Sí** (después de T3) | Necesitan el enum generado. T8 y T14b, además, `comoPlataforma` y `EXCEPCIONES_DE_PLATAFORMA` de SL-17 |
| 5 | T15, T16 | **Sí** (después de T4 y T14b) | La página, el menú, el marco del portal y la comprobación de rol de la action de SL-17 |
| 6 | T9, T17 | **Sí** (después de la tanda 5) | Los E2E, con la app entera |
| 7 | T19 | Espera a **P8 y P9**, no a SL-17 | Volver a montar «recuperar contraseña» solo con correo verificado |
| 8 | T10 | Al final | Deudas y trazabilidad |

**Camino crítico para mañana:** SL-17 en `dev` → T0 → T3 → T4 → T8 y T14b → T15 → T17. En
paralelo: T12 y T13 ya, y P8 resuelta antes de dar de alta la primera empresa real.

## Precondición

- [x] **T0. SL-17 integrada en `dev`.** *Adelantado el 2026-10-23 (leader): **la base es la rama
  `origin/feature/SL-17-organizacion-y-aislamiento` (PR #3) hasta que entre en `dev`**. Se integró
  con merge (no rebase): primero `origin/dev`, luego la rama de SL-17 (`d9df97f`). Cuando SL-17 esté
  en `dev`, se hace merge de `origin/dev` y se abre el PR. Respuestas en `progress/impl_SL-32.md > T0`.*
  Cambió el 2026-10-22 (Carlos): SL-28 va después de SL-17, y
  las migraciones de SL-32 van encima de las de SL-17, porque las dos tocan `usuario`. Bloquea las
  tandas 3 a 6. Antes de crear las migraciones:
  1. `git fetch` y merge de `origin/dev` en la rama;
  2. comprobar el nombre de la última migración de `db/migrations/`. Según el spec de SL-17 es
     `20261022130300_misma_empresa_en_fk`. Las tres de SL-32 van detrás (R21);
  3. leer cómo dejó SL-17 `usuario.organizacion_id` (`design.md > Multi-empresa`):
     - que admite `NULL`; si no, se para y se pregunta;
     - que email y cédula siguen únicos globales (R36 de SL-17), lo que fija el `conflicto` del
       comando;
     - que no hay ya un `CHECK` sobre la columna (R28 lo pone SL-32);
  4. leer el contrato de la action de alta (P10): ruta y nombre, forma de cada error, si exporta
     el schema zod de la entrada, si hay un listado de empresas y cómo guarda «sin contraseña» con
     `password_hash` `NOT NULL`. Si falta algo que la pantalla necesita, se para y se pregunta;
  5. añadir a `## Archivos esperados` la ruta real de la action y, si SL-17 trae listado, quitar
     las piezas de T14;
  6. `pnpm exec prisma migrate status` en limpio sobre una base local recién migrada.

  **Hecho cuando:** el SHA de `dev` con SL-17 y las respuestas de los puntos 2 a 4 quedan anotados en
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

## Tanda 2b — La pantalla «Empresas» sin base (no depende de T0)

- [x] **T12. `/design` de la pantalla «Empresas»** (R29–R34, R37). Es una pantalla nueva: su diseño
  **pasa por `/design` antes de implementarse** (`docs/perfil-agentes.md > frontend_dev`). Se
  mantiene **mínimo y coherente con las pantallas de configuración que ya hay**
  (`app/(app)/configuracion/vehiculos/`, `UsuariosModule`): el mismo `PageHeader`, una tabla con su
  estado vacío y un formulario con los componentes de `components/ui/`. Sin marca nueva.
  Cubre:
  - la tabla: nombre, slug, fecha de alta y los maestros;
  - el formulario, con siete campos y el selector de tipo de documento;
  - los errores por campo y el genérico;
  - el aviso tras el alta: el maestro entra con «¿Olvidaste tu contraseña?».

  **Hecho cuando:** Carlos aprueba la maqueta y su referencia queda en `progress/impl_SL-32.md`.

  *Estado (2026-10-22):* la propuesta está en `design.md > Diseño visual > Propuesta de T12`, y el
  leader la dio por buena para codificar. **Carlos la aprobó el 2026-10-22.**
- [x] **T13. [P] `EmpresasModule`** (R29–R34, R37; depende de T12).
  `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`, cliente. Recibe por props el
  listado, el catálogo de tipos y la action, que se inyecta para poder probarla. No importa Prisma
  ni `RolValue`.

  Tests en `tests/components/empresas-module.test.tsx` (jsdom), con una action doble:
  - pinta las filas con nombre, slug, fecha y maestros, y el estado vacío sin empresas (R29);
  - el envío válido llama a la action con la forma exacta del contrato, `tipoDocumento` del
    catálogo incluido, y deja el formulario vacío (R30);
  - slug repetido, email repetido y documento repetido: cada error junto a su campo, con lo
    escrito conservado (R31–R33);
  - `fieldErrors` por campo y un error genérico sin detalle (R34);
  - tras el éxito aparece el aviso de primer acceso, y ningún nodo contiene un campo de contraseña
    (R37).

  **Hecho cuando:** los tests están en verde, y una mutación que pinta el error de slug en el campo
  email pone en rojo R31 (se prueba y se revierte).
- [x] **T14a. [P] Servicio del listado, sin Prisma** (R29, R35).
  `lib/types/empresas-plataforma.ts`, `lib/interfaces/services/IEmpresasPlataformaService.ts`,
  `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts` y
  `lib/services/EmpresasPlataformaService.ts`. Mientras no exista T4, el servicio recibe por
  constructor el predicado de plataforma, y T14b lo cablea a `esPlataforma`.

  Tests en `tests/unit/services/empresas-plataforma-service.test.ts`: un actor de cada rol de
  empresa recibe `forbidden` y el repositorio no se llama; el de plataforma recibe el listado del
  doble.

  **Hecho cuando:** los tests están en verde. Si T0 dice que SL-17 trae su propio listado, T14a se
  descarta y se anota.

## Tanda 3 — El rol en la base (depende de T0)

- [x] **T3. Enum, migraciones, índice de un solo superadmin y regla de empresa** (R1, R2, R21,
  R27, R28).
  - `db/schema.prisma`: `superadmin` en `RolValue`.
  - Tres carpetas detrás de la última migración de SL-17 (`design.md > Migraciones`):
    `<ts>_rol_superadmin`, `<ts+1>_seed_rol_superadmin` y `<ts+2>_usuario_empresa_o_superadmin`,
    con sus `migration.sql` y `down.sql`. Incluyen:
    - el `id` fijo de la fila de `rol`;
    - la comprobación de que esa fila no exista con otro `id`;
    - el índice parcial `usuario_un_solo_superadmin`;
    - el `CHECK` `usuario_empresa_o_superadmin`.
  - `pnpm exec prisma generate`.

  Test nuevo en `tests/integration/db/un-solo-superadmin.test.ts`, con datos propios:
  - un segundo `INSERT` de un usuario con el rol `superadmin` falla por el índice;
  - un `UPDATE` del `rol_id` de otro usuario al de `superadmin` también falla;
  - el primero se inserta bien.

  Test nuevo en `tests/integration/db/usuario-empresa-o-superadmin.test.ts` (R28), con datos
  propios y una organización de la fábrica de SL-17:
  - un superadmin con `organizacion_id` no nulo falla con `23514`;
  - un `maestro` con `organizacion_id` nulo falla con `23514`;
  - el `UPDATE` que pone a `NULL` la empresa de un `maestro` falla;
  - un superadmin con `NULL` y un `maestro` con empresa pasan.

  Una mutación que quita el índice del `migration.sql` pone en rojo el primer test, y una que
  quita el `CHECK` pone en rojo el segundo.

  Tests: `tests/unit/types/roles.test.ts` pasa de 6 a 7, y `tests/unit/scripts/seed-catalogos.test.ts`
  si cuenta roles. Se corre la suite de integración que inserta en `usuario`, para encontrar los
  tests que insertan sin empresa (`design.md > Migraciones > Consecuencia en los tests`).

  **Hecho cuando:**
  - `migrate deploy`, luego `db:rollback` tres veces, y otra vez `migrate deploy`, sobre una base
    local, sin errores;
  - con un usuario superadmin creado a mano en esa base, el rollback de la segunda migración
    **falla** y el usuario sigue ahí;
  - sin superadmin, el rollback quita el índice y la fila;
  - la prueba de drift, `un-solo-superadmin.test.ts` y `usuario-empresa-o-superadmin.test.ts` están
    en verde.

## Tanda 4 — El rol en el código y el comando entero (depende de la tanda 3)

- [x] **T4. Fuente única y tablas exhaustivas** (R4, R6, R7).
  - Nace `lib/auth/plataforma.ts` (`ROLES_PLATAFORMA` y `esPlataforma`).
  - `ROL_LABELS` añade «Superadmin», `QUIEN_PREGUNTA` añade su frase y `ROLES_SIN_ANALITICA` pasa a
    `["superadmin"]`.
  - Se completan los `Record<RolValue,string>` de `tests/integration/db/push-destinatarios-equivalencia.test.ts`
    y `tests/integration/db/_whatsapp-envios-474.ts`.
  - `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts` pasa de 6 a 7.

  Tests en `tests/unit/auth/plataforma.test.ts`:
  - `esPlataforma` solo para `superadmin`;
  - `esAccesoTotal(superadmin)` es `false`.

  (El menú del superadmin lo prueba T16, cuando exista el ítem.)

  **Hecho cuando:** `pnpm run typecheck` está en verde y los tests nuevos también.
- [x] **T5. [P] Tests que usaban `superadmin` como rol inventado** (R7).
  - En `tests/unit/analytics/productos-alcance.test.ts:132` y
    `tests/unit/analytics/conteo-productos-action.test.ts:130,240,260`, el inventado pasa a otro
    nombre que no exista (por ejemplo `rolInventado`), y se añade un caso real: `superadmin`
    produce `rol_sin_analitica`, o `forbidden` en la action.
  - Test de `AsistenteService`: `superadmin` se rechaza sin componer nada.
  - Se revisan los tests que iteran `Object.values(RolValue)` con una tabla de expectativas
    exhaustiva.

  **Hecho cuando:** `vitest related` sobre `lib/analytics/alcance.ts`, `lib/auth/rol-label.ts` y
  `lib/asistente/instrucciones.ts` sale en verde.
- [x] **T6. [P] Guardia «superadmin fuera de empresa»** (R3, R4, R5).
  `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`, según
  `design.md > Guardias que cambian`. Lleva sus tres excepciones declaradas: `GESTION_ROLES` y
  `READ_ROLES` de `GeografiaService`, y el ítem «Empresas», que llega en T16. Las tres leen
  `ROLES_PLATAFORMA` por import.

  **Hecho cuando:**
  - la guardia está en verde y lleva su contraprueba sintética;
  - añadir `superadmin` a `ROLES_ACCESO_TOTAL` la pone en rojo (se prueba y se revierte);
  - escribir `"superadmin"` literal en el `roles` de un ítem la pone en rojo.
- [x] **T7. `UsuarioService` y `UserRepository`** (R8–R11).
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
    traducción de `P2002`. Inserta dentro de `comoPlataforma("SL-32", …)` con `organizacionId: null`
    explícito (R35 de SL-17).
  - `lib/db/excepciones-aislamiento.ts`: la fila del comando, con `ficha: "SL-32"` y su motivo.
  - `scripts/arranque-superadmin.ts`, como entrypoint.
  - En `package.json`, `"arranque:superadmin": "tsx scripts/arranque-superadmin.ts"`, junto a lo
    que SL-17 haya dejado.
  - En `.env.example`, las variables vacías.
  - En el README, la sección «Usuarios» explica el comando sin valores: se corre a mano, una vez por
    entorno, después de `migrate deploy`, y fuera del build y de CI (R20). Explica también las
    dependencias operativas del correo (`design.md > Dependencias operativas`), sin ningún valor.
  - En `fuera-datos-ordenex.guardia.test.ts`, `faltasDeScripts` pasa a una lista de excepciones con
    su fila de SL-32 y su contraprueba (R19). Si SL-17 ya trajo la suya, se conservan las dos.

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

  **Hecho cuando:** los tests están en verde, la guardia de SL-11 sigue en verde con la lista, y la
  guardia `plataforma-solo-en-lista` de SL-17 también.
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
  - **P7 abierta:** la rama del `superadmin` se prueba con dobles. Con SL-17, sus escrituras de
    `historial_accion` y su conteo de `orden` fallan por falta de empresa. Ningún test de
    integración afirma su éxito hasta que Carlos decida, y no se inventa una empresa.

  Casos nuevos:
  - en el servicio, el `maestro` da de alta, renombra, retira, reactiva y cuenta → `forbidden`, con
    el repositorio sin llamar;
  - en el servicio, el `maestro` lista el árbol → `ok` (R25, Tarifas);
  - en el servicio, el `superadmin` da de alta, renombra, retira, reactiva, cuenta y lista → `ok`,
    con dobles;
  - en la integración, el `maestro` no deja fila en el historial de acciones;
  - en la página, el `maestro` recibe `notFound()`;
  - en el menú, el `maestro` no ve «Geografía» y su `primerDestino` no cambia.

  **Hecho cuando:**
  - `vitest related` sobre `lib/services/GeografiaService.ts`, `lib/auth/menu-visibility.ts` y
    `app/(app)/configuracion/geografia/page.tsx` sale en verde;
  - devolver `"maestro"` a `GESTION_ROLES` pone en rojo el caso del servicio y la guardia de T6
    (se prueba y se revierte);
  - quitar `"maestro"` de `READ_ROLES` pone en rojo el caso de Tarifas (se prueba y se revierte).
- [ ] **T14b. Repositorio del listado** (R29, R35; depende de T0 y T4).
  - `lib/repositories/EmpresasPlataformaRepository.ts`, dentro de
    `comoPlataforma("SL-32", "listado de empresas del superadmin")`. Selecciona solo nombre, slug,
    fecha y el nombre y el email de los maestros.
  - Su fila en `lib/db/excepciones-aislamiento.ts`.
  - El servicio de T14a se cablea a `esPlataforma`.

  Test en `tests/integration/db/empresas-plataforma.test.ts`, con dos organizaciones propias, un
  maestro en cada una y un `admin` en la primera:
  - el listado trae las dos, la más reciente primero, cada una con su maestro y sin el `admin`;
  - ninguna fila trae `password_hash`, teléfono ni documento;
  - sin organizaciones, devuelve `[]`.

  **Hecho cuando:** el test está en verde, y quitar el filtro por rol `maestro` del repositorio lo
  pone en rojo (se prueba contra la base, no con un doble).

## Tanda 5 — La pantalla «Empresas» entera (depende de T4, T13 y T14b)

- [ ] **T15. Página, marco del portal y comprobación de rol** (R6, R30, R35).
  - `app/(app)/plataforma/empresas/page.tsx`: `notFound()` si `!esPlataforma(actor.rol)`. Lee el
    listado y el catálogo `tipo_identificacion`, y monta `EmpresasModule` con la action de SL-17.
  - `app/(app)/layout.tsx`, según `design.md > El marco del portal para el superadmin`: el nombre
    del pie en `comoPlataforma("SL-32", …)`, sin `avisosPushDe`, y su fila en
    `lib/db/excepciones-aislamiento.ts`.
  - Si la action de SL-17 trae un stub de rol que falla cerrado, se cambia por `esPlataforma` y nada
    más.

  Tests:
  - `tests/integration/empresas-page.test.tsx`: con `maestro`, `admin` y los demás roles de empresa,
    `notFound()`; con `superadmin`, pinta el listado (R35);
  - `tests/unit/actions/alta-empresa-rol.test.ts`: con un `maestro`, la action de SL-17 responde
    `forbidden` y el servicio no se llama; con un `superadmin`, se llama (R35);
  - `tests/integration/app-layout-superadmin.test.tsx`: con un superadmin, el pie lleva su nombre y
    `UsuarioPreferenciaRepository` no recibe llamadas (R6).

  **Hecho cuando:** los tests están en verde, y cambiar `esPlataforma` por `() => true` en la página
  pone en rojo `empresas-page.test.tsx` (se prueba y se revierte).
- [ ] **T16. [P] Ítem de menú «Empresas»** (R6, R36).
  - En `lib/auth/menu-visibility.ts`, el ítem al final de `SIDEBAR_ITEMS`, con
    `roles: ROLES_PLATAFORMA`.
  - En `Sidebar.tsx`, `IconKey` gana `"building"`.

  Tests:
  - `tests/unit/auth/menu-visibility.test.ts`: `itemsVisibles(SIDEBAR_ITEMS, superadmin)` es
    exactamente `[Empresas]`, y ningún otro rol lo ve;
  - `tests/unit/auth/destino-post-login.test.ts`: el superadmin aterriza en `/plataforma/empresas`,
    y el aterrizaje de los otros seis roles no cambia. La lista literal de ítems marcados
    `destinoInicial: false` sigue igual;
  - `tests/unit/auth/plataforma.test.ts` gana el caso del menú.

  **Hecho cuando:** los tests están en verde, y dar el ítem al `maestro` pone en rojo
  `menu-visibility.test.ts` y la guardia de T6.

## Tanda 6 — E2E (depende de la tanda 5)

- [ ] **T9. E2E del arranque** (R18, R6). `e2e/superadmin-arranque.spec.ts`:
  1. el setup corre el comando con credenciales de prueba;
  2. el superadmin entra por `/login` y pasa el OTP por el emisor de consola;
  3. aterriza en `/plataforma/empresas`, y el menú tiene exactamente el ítem «Empresas»;
  4. `/configuracion` le devuelve 404.

  **Hecho cuando:** `pnpm exec playwright test e2e/superadmin-arranque.spec.ts` sale en verde en
  local.
- [ ] **T17. E2E: dos empresas desde la pantalla** (R29–R35, R37). `e2e/superadmin-empresas.spec.ts`,
  local, con la base local (lo aborta una base remota, como `e2e/marca.spec.ts`):
  1. con el superadmin de T9, abre «Empresas» y ve el estado vacío;
  2. crea la empresa A y la empresa B desde el formulario, con slugs, emails y documentos
     aleatorios. Las dos aparecen en el listado con su maestro;
  3. repetir el slug de A, el email del maestro de A y su documento muestra cada error junto a su
     campo, y el listado sigue con dos empresas;
  4. un slug inválido muestra el error sin crear nada;
  5. el maestro de A entra con el cambio de contraseña de T19 y el código del emisor de consola.
     Si T19 no está hecha, lo hace por `PasswordResetService` desde el setup. Después entra por
     `/login`, y la pantalla «Empresas» le da 404 (R35);
  6. el maestro de A no ve el ítem «Empresas».

  Sustituye, en el humo de SL-17 (`e2e/dos-empresas-humo.spec.ts`), el alta por fixture, como dice
  D19 de SL-17. Ese cambio lo hace quien mergee segundo.

  **Hecho cuando:** `pnpm exec playwright test e2e/superadmin-empresas.spec.ts` sale en verde en
  local, y su salida queda en `progress/impl_SL-32.md`.

## Tanda 7 — Primer acceso con correo (espera a P8 y P9)

- [x] **T19. Volver a montar «recuperar contraseña»** (R38). Solo con el OK de Carlos (P9) y con el
  correo verificado en el entorno (P8):
  - `app/recuperar-contrasena/page.tsx` monta `RecuperarContrasenaForm` en vez de
    `RecuperacionDesactivadaAviso`, y devuelve el subtítulo del panel de marca;
  - `app/login/_components/LoginForm.tsx` devuelve el enlace «¿Olvidaste tu contraseña?»;
  - se revierten `tests/integration/login-form-reset-link.test.tsx` y
    `tests/integration/recuperar-contrasena-page.test.tsx`, como señala el aviso.

  **Hecho cuando:** los dos tests están en verde con el formulario montado, y un correo de OTP real
  llega en el entorno. El envío queda anotado en `progress/impl_SL-32.md`, sin el código ni el
  email.

  *Estado (2026-10-22):* P8 y P9 resueltas por el leader: SMTP de Brevo, que Carlos pone en Vercel.
  El código y los tests están hechos, y la degradación a `ConsoleEmailSender` tiene test. **Falta
  verificar un correo de OTP real** en cada entorno, después de que Carlos configure el SMTP.

## Tanda 8 — Cierre

- [ ] **T10. Deudas y trazabilidad.**
  - En `progress/deudas.md`, D7 queda resuelta con la decisión del 2026-10-22, sin deuda nueva.
    Si P8 se resuelve con `AUTH_OTP_DEBUG_LOG`, entra como deuda nueva con su fecha.
  - `progress/impl_SL-32.md` lleva el mapa `R<n> → test`.
  - `./init.sh` en verde.

  **Hecho cuando:** el mapa cubre de R1 a R38 y `INIT_EXIT=0` queda en el log.

## Mapa R → test (previsto)

| R | Test |
|---|---|
| R1, R2 | `tests/unit/types/roles.test.ts`, `tests/unit/scripts/seed-catalogos.test.ts` y la migración en T3 |
| R3, R4, R5 | `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` y la suite existente sin cambios de expectativas para los seis roles |
| R6 | `tests/unit/auth/menu-visibility.test.ts`, `tests/unit/auth/destino-post-login.test.ts`, `tests/integration/app-layout-superadmin.test.tsx` y `e2e/superadmin-arranque.spec.ts` |
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
| R24, R25 | `tests/unit/services/geografia-service.test.ts`, `tests/unit/actions/geografia-action.test.ts`, `tests/integration/db/geografia-registro-accion.test.ts`, `tests/integration/db/geografia-cascada-reversible.test.ts` y `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`. La rama del `superadmin`, solo con dobles hasta P7 |
| R26 | `tests/unit/components/geografia-admin-page.test.tsx` (`notFound()` al `maestro`), `tests/unit/auth/menu-visibility.test.ts` y la revisión del diff de la ayuda (T1b) |
| R27 | `tests/integration/db/un-solo-superadmin.test.ts`, `tests/integration/db/arranque-superadmin.test.ts` (ejecuciones en paralelo) y `tests/unit/services/usuario-service-superadmin.test.ts` (R9) |
| R28 | `tests/integration/db/usuario-empresa-o-superadmin.test.ts` |
| R29 | `tests/components/empresas-module.test.tsx`, `tests/integration/db/empresas-plataforma.test.ts` y `e2e/superadmin-empresas.spec.ts` |
| R30–R34 | `tests/components/empresas-module.test.tsx` y `e2e/superadmin-empresas.spec.ts` |
| R35 | `tests/integration/empresas-page.test.tsx`, `tests/unit/actions/alta-empresa-rol.test.ts`, `tests/unit/services/empresas-plataforma-service.test.ts` y `e2e/superadmin-empresas.spec.ts` |
| R36 | `tests/unit/auth/menu-visibility.test.ts`, `tests/unit/auth/destino-post-login.test.ts` y `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` |
| R37 | `tests/components/empresas-module.test.tsx` (sin campo de contraseña, aviso) y `e2e/superadmin-empresas.spec.ts` (el maestro entra) |
| R38 | `tests/integration/login-form-reset-link.test.tsx` y `tests/integration/recuperar-contrasena-page.test.tsx` (T19) |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/<ts>_rol_superadmin/migration.sql`
- `db/migrations/<ts>_rol_superadmin/down.sql`
- `db/migrations/<ts>_seed_rol_superadmin/migration.sql`
- `db/migrations/<ts>_seed_rol_superadmin/down.sql`
- `db/migrations/<ts>_usuario_empresa_o_superadmin/migration.sql`
- `db/migrations/<ts>_usuario_empresa_o_superadmin/down.sql`
- `lib/db/excepciones-aislamiento.ts`
- `lib/auth/plataforma.ts`
- `lib/auth/menu-visibility.ts` (y su test)
- `lib/auth/rol-label.ts`
- `lib/asistente/instrucciones.ts`
- `lib/analytics/alcance.ts`
- `lib/types/usuario.ts`
- `lib/types/arranque-superadmin.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/interfaces/services/IArranqueSuperadminService.ts`
- `lib/interfaces/repositories/IArranqueSuperadminRepository.ts`
- `lib/interfaces/services/IEmpresasPlataformaService.ts`
- `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts`
- `lib/services/ArranqueSuperadminService.ts`
- `lib/services/EmpresasPlataformaService.ts`
- `lib/repositories/ArranqueSuperadminRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/services/UsuarioService.ts`
- `lib/repositories/UserRepository.ts`
- `lib/api/openapi-spec.ts`
- `lib/services/GeografiaService.ts`
- `lib/actions/organizaciones.ts` y `lib/auth/exigir-superadmin.ts` (la Server Action de alta de SL-17 y su comprobación de rol; ruta fijada en T0)
- `app/(app)/layout.tsx`
- `app/(app)/_components/Sidebar.tsx`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/configuracion/geografia/page.tsx`
- `app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx`
- `app/recuperar-contrasena/page.tsx`
- `app/login/_components/LoginForm.tsx`
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
- `tests/integration/db/usuario-empresa-o-superadmin.test.ts`
- `tests/integration/db/empresas-plataforma.test.ts`
- `tests/integration/empresas-page.test.tsx`
- `tests/integration/app-layout-superadmin.test.tsx`
- `tests/integration/login-form-reset-link.test.tsx`
- `tests/integration/recuperar-contrasena-page.test.tsx`
- `tests/components/empresas-module.test.tsx`
- `tests/unit/services/empresas-plataforma-service.test.ts`
- `tests/unit/actions/alta-empresa-rol.test.ts`
- `tests/unit/auth/destino-post-login.test.ts`
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
- `e2e/superadmin-empresas.spec.ts`

Choques declarados con SL-17 (`design.md > Choques con SL-17`): `db/schema.prisma`, `package.json`,
`tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`, `lib/db/excepciones-aislamiento.ts`, la
action de alta y `e2e/dos-empresas-humo.spec.ts` (este último lo ajusta SL-17).
