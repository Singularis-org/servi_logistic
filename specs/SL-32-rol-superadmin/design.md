# SL-32 — Diseño

## Lo que ya existe

El MCP del grafo no estaba entre las herramientas de este agente, así que el código se buscó con
Grep y Read. Términos buscados: `superadmin`, `maestro`, `rol_value`, `ROLES_SEED`, `seed`,
`arranque`, `crear-usuario`, `puede retirar` y `provincia`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-25 (alta de empresas) y SL-26 (panel) dependen del superadmin. SL-17 (`organizacion`), SL-20 (geografía por país) y SL-28 (línea base de migraciones) se tocan con esta. Ninguna ficha crea el rol. | No hay duplicado. SL-32 da el rol y el predicado, y SL-25/26 los consumen. La migración espera a SL-17, que va antes que SL-28 (tasks T0). |
| Specs | SL-11 y SL-15 dejan escrito que el superadmin no es `maestro` y que su arranque es de SL-32. SL-11 R2/R6 prohíben scripts que creen usuarios y migraciones que los inserten. | Se reutiliza. La guardia de SL-11 R2 recibe **una** excepción declarada (R19). |
| `db/schema.prisma` | Enum `RolValue` con seis valores y modelo `Rol` (catálogo). `Usuario` exige `nombre`, `telefono`, `cedula @unique` y `tipoIdentificacionId`. | Se añade un valor al enum. Los campos obligatorios salen de variables de entorno (P2, decidida). |
| `lib/types/roles.ts` y `scripts/seed-catalogos.ts` | `ROLES_SEED = Object.values(RolValue)`, y `seedRoles` hace upsert de cada uno. | Se reutiliza tal cual: el rol nuevo se siembra solo (R2). |
| Migraciones `20260716140000_rol_api_key` y `20260716150000_api_key` | Precedente de rol nuevo en dos migraciones (`ADD VALUE`, luego `INSERT`) y un `down.sql` que recrea el enum. | Se copia el patrón (R21). |
| `lib/auth/` | `acceso-total.ts`, `menu-visibility.ts` (todas las listas son *whitelist*), `resolve-actor.ts` y `session-guard.ts`. | Nace `lib/auth/plataforma.ts`. El resto no cambia: un rol nuevo queda fuera de todas las whitelists por defecto (R5). |
| `lib/analytics/alcance.ts` | `ROLES_SIN_ANALITICA`, declarada y vacía. | El superadmin entra ahí (R7). |
| `lib/services/AsistenteService.ts` | Rechaza todo rol fuera de `ROLES_AYUDA`. | Ya cubre R7. Solo hace falta la frase exhaustiva de `QUIEN_PREGUNTA`. |
| `lib/services/UsuarioService.ts` y `UserRepository` | `listRoles` devuelve **todos** los roles, y `crear`/`actualizar` aceptan cualquier `rolId`. | Hay que cerrarlo, o el `maestro` podría crear un superadmin o ascender a alguien (R8–R11). |
| `lib/services/GeografiaService.ts` (fichas 374/375) | `READ_ROLES` y `WRITE_ROLES` son `["maestro"]`. `cambiarActivacion` retira o reactiva un nodo de cualquier nivel, con cascada reversible y registro de acciones. Lo prueban 12 archivos de test. | `crear`, `renombrar`, `cambiarActivacion` y `contarOrdenesSinEntregar` pasan a `ROLES_PLATAFORMA`. `listarArbol` sigue abierto al `maestro`, porque `/configuracion/tarifas` lo usa para armar zonas (R24, R25). |
| `lib/utils/password.ts` y `lib/types/password-policy.ts` | `hashPassword` (bcrypt) y `strongPasswordSchema`. | Se reutilizan en el comando (R13, R16). |
| `lib/api/openapi-spec.ts:2006`, el YAML (l. 1944) y el CHANGELOG (l. 572) | «La empresa puede retirar una provincia…» y «La empresa pasa a poder **retirar**». La guardia de SL-16 las lista en `FRASES_OPERADOR`. | Pasan a la plataforma (R22, R23). |
| Spec de SL-17 (sin commitear, worktree `SL-17-organizacion-y-aislamiento`) | D18: `OrganizacionService.altaEmpresa({nombre, slug, maestro})` y una Server Action que exige superadmin con `lib/auth/plataforma.ts`; sin él, falla cerrado. D12: `vehiculos` es de plataforma. R35 y §10: el `CHECK` NULL ⇔ superadmin lo pone SL-32. Última migración: `20261022130300_misma_empresa_en_fk`. `EXCEPCIONES_DE_PLATAFORMA` en `lib/db/excepciones-aislamiento.ts`. | Se consume el contrato; no se reescribe nada de SL-17. Las incoherencias del spec de SL-17 van a `requirements.md > P10`. |
| `lib/services/PasswordResetService.ts`, `lib/actions/password-reset.ts` y `app/recuperar-contrasena/` | El flujo «recuperar contraseña» por OTP de correo existe y tiene tests, pero la página monta `RecuperacionDesactivadaAviso` desde el 2026-09-04, porque el SMTP fallaba. El aviso dice cómo volver a montarlo (dos cambios) y qué tests revertir. | Es el primer acceso del maestro (R37). Se vuelve a montar solo con correo verificado (R38, P8, P9). |
| `lib/services/EmailProvider.ts`, `ConsoleEmailSender.ts` y `lib/config/email.ts` | Sin `SMTP_USER`/`SMTP_PASSWORD` se degrada a consola. El código del OTP solo sale con `AUTH_OTP_DEBUG_LOG=1`, que `.env.example` pide dejar vacío en producción. | Dependencia operativa (`> Dependencias operativas`). |
| `lib/utils/password-generator.ts` y `ContrasenaGeneradaPanel.tsx` (fichas 25 y 287) | Contraseña generada que se muestra una sola vez. | **No** se usa: el contrato de SL-17 crea al maestro sin contraseña (alternativa K). |
| `app/(app)/dashboard/page.tsx` | Redirige a `primerDestino(itemsVisibles(...))` si no es `null`. | Con el ítem «Empresas», el superadmin aterriza en él solo, sin tocar la página (R6). |
| `app/(app)/layout.tsx` | En toda página del portal lee `UserRepository.findById` y `UsuarioPreferenciaRepository.avisosPushDe` del actor. Con SL-17, `usuario` y `usuario_preferencia` son de negocio y el superadmin no tiene empresa. | Se adapta para el superadmin (`> Pantalla «Empresas» > El marco del portal`). |
| `app/(app)/configuracion/vehiculos/` y `configuracion/page.tsx` (`UsuariosModule`) | Las pantallas de configuración: cabecera, tabla y formulario. | La referencia visual de «Empresas», que se mantiene mínima (T12). |
| Tests que usan `"superadmin"` como **rol inventado** | `productos-alcance.test.ts:132`, `conteo-productos-action.test.ts:130,240,260`, `usuario-schema.test.ts:253` y `usuarios.test.ts:333`. | Los de analítica cambian de significado: se les da otro nombre inventado y se añade un caso real (T7). Los de usuarios siguen valiendo por R10. |

## Modelo de datos

- **Enum** `RolValue` (`rol_value`): se añade `superadmin`. No lleva `@map`: la etiqueta en la base
  es `superadmin`.
- **Catálogo** `rol`: una fila `superadmin`. La siembran la segunda migración y `seedRoles`, de
  forma idempotente. No tiene filas en `rol_permiso`, igual que `apiKey`.
- **Un único superadmin (R27):** el índice único parcial `usuario_un_solo_superadmin` sobre
  `usuario`, explicado en `> Migraciones`.
- **No hay tablas nuevas.** No hace falta RLS nueva ni `organizacion_id` nuevo.
- **El usuario superadmin** es una fila normal de `usuario`, con `estado = activo` y su `rol_id`.
  `zona_id`, `vehiculo_id` y `placa` van a `NULL`, y `fulfillment` a `false`.

### Multi-empresa (SL-17 va antes)

Decisión de Carlos del 2026-10-22: SL-17 entra en `dev` **antes** que la migración de SL-32, y
añade `usuario.organizacion_id`. SL-32 parte de ahí y no inventa ningún aislamiento:

- el superadmin **no pertenece a ninguna empresa**: su `organizacion_id` es `NULL`, y nunca pasa
  por el filtro de empresa;
- **el índice de R27 es global, no por empresa.** `usuario_un_solo_superadmin` filtra solo por
  `rol_id` y no lleva `organizacion_id`. Ponerle esa columna lo rompería: en un índice único,
  Postgres trata cada `NULL` como distinto, así que dejaría pasar varios superadmins;
- **el comando** inserta al superadmin con `organizacion_id = NULL` de forma explícita. No resuelve
  ninguna empresa, porque no tiene sesión ni la necesita. Las comprobaciones de `conflicto` (email y
  documento) siguen los únicos que SL-17 deje en `usuario`, sean globales o por empresa. Se leen en
  T0, no se suponen;
- **la autorización** no cambia de forma. Las páginas y los servicios de empresa resuelven la
  empresa desde la sesión. El superadmin no tiene empresa, así que no llega a ningún filtro: lo
  paran antes las whitelists de rol (R5). `UsuarioService` conserva el `notIn` de plataforma (R10)
  aunque el filtro por `organizacion_id` ya lo excluya por su `NULL`. Así no depende de que SL-17
  filtre en todas las consultas;
- la empresa activa del superadmin no existe. Lo que SL-25/26 hagan «sobre una empresa» recibe la
  empresa por parámetro validado en el servidor, nunca de su sesión;
- **Cerrado el 2026-10-22 (R28).** SL-17 deja `organizacion_id` nulable y sin regla (R3 y R35 de
  SL-17), porque cuando corre su migración el rol `superadmin` aún no existe. La regla la pone
  SL-32, como contrato de SL-17 (§10), en su **tercera** migración:
  `CHECK (("organizacion_id" IS NULL) = ("rol_id" = '<UUID_ROL_SUPERADMIN>'))`. Va como literal
  porque un `CHECK` no admite subconsultas, y por eso el `id` del rol es fijo (`> Migraciones`).
  Las dos caras de la igualdad nunca son `NULL`: `IS NULL` siempre da verdadero o falso, y `rol_id`
  es `NOT NULL`.
- **El contexto de plataforma** (`comoPlataforma` de SL-17) lo abren tres sitios de SL-32: el
  repositorio del comando de arranque, el del listado de empresas y la lectura del marco del portal
  para el superadmin. Cada uno entra en `EXCEPCIONES_DE_PLATAFORMA` con `ficha: "SL-32"` y su
  motivo, o la guardia `plataforma-solo-en-lista` de SL-17 lo pone en rojo.

### País

El tipo de documento (`tipo_identificacion`: `cedula`, `ruc` o `pasaporte`) es un dato que depende
del país. Sale del catálogo existente, nunca de un literal del comando, y lo valida contra la base
(P2). Que el catálogo sea por país es de SL-20/21.

## Migraciones

Van **encima de las migraciones de SL-17** (T0), porque las dos tocan `usuario`. Son tres
carpetas. Las dos primeras van separadas por el error 55P04 de Postgres: un valor de enum no se
puede usar en la misma transacción que lo añade. La tercera es la regla de R28.

1. `<ts>_rol_superadmin/`
   - `migration.sql`: `ALTER TYPE "rol_value" ADD VALUE IF NOT EXISTS 'superadmin';`
   - `down.sql`: recrea el tipo sin `superadmin`, con el patrón de `20260716140000_rol_api_key/down.sql`,
     y lista los seis valores de antes. Si queda una fila de `rol` con ese valor, falla.
2. `<ts+1>_seed_rol_superadmin/`
   - `migration.sql`, en dos pasos:
     1. `INSERT INTO "rol" ("id","value") VALUES ('<UUID_ROL_SUPERADMIN>','superadmin') ON CONFLICT ("value") DO NOTHING;`
        El `id` es **fijo** y se escribe aquí: el índice de R27 lo necesita.
     2. Un bloque `DO $$` que lanza una `EXCEPTION` si la fila `superadmin` existe con otro `id`,
        para no dejar un índice que no protege nada.
   - El índice único parcial (R27):
     `CREATE UNIQUE INDEX "usuario_un_solo_superadmin" ON "usuario" ((true)) WHERE "rol_id" = '<UUID_ROL_SUPERADMIN>';`
     Rechaza el segundo `INSERT` **y** el `UPDATE` que pasaría a alguien a superadmin, y lo hace en
     la base, venga de donde venga la escritura.
   - `down.sql`, en este orden:
     1. un bloque `DO $$` que lanza una `EXCEPTION` si hay algún `usuario` con ese rol;
     2. si no hay ninguno, `DROP INDEX "usuario_un_solo_superadmin"`;
     3. borra la fila de `rol`.

     Así falla ruidosamente sin borrar al superadmin (R21).

3. `<ts+2>_usuario_empresa_o_superadmin/` (R28)
   - `migration.sql`: `ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_o_superadmin" CHECK (("organizacion_id" IS NULL) = ("rol_id" = '<UUID_ROL_SUPERADMIN>'));`.
     Postgres la valida contra las filas que ya hay. En las bases nuevas de producción y QA no hay
     filas. En una base local con usuarios de antes de SL-17, que tienen `NULL`, la migración
     falla: esa base se rehace con `pnpm run db:reset`, como dice D9 de SL-17.
   - `down.sql`: `ALTER TABLE "usuario" DROP CONSTRAINT "usuario_empresa_o_superadmin";`.
   - Va en carpeta propia, y no dentro de la segunda, para que se pueda revertir sin tocar el
     índice de R27.

**Timestamps.** Los tres son posteriores a `20261022130300_misma_empresa_en_fk`, la última de
SL-17 según su spec: por ejemplo `20261022140000`, `20261022140100` y `20261022140200`. Se fijan en
T0, con SL-17 ya en `dev`. Si SL-17 añade otra migración, van detrás de esa.

`seedRoles` hace upsert por `value`, así que conserva el `id` fijo de la migración. El
`<UUID_ROL_SUPERADMIN>` se genera una vez al escribir la migración, y `lib/auth/plataforma.ts` no
lo repite: el código busca el rol por valor.

SL-28 consolida después, y su línea base las absorberá. Eso es de SL-28. Ninguna de las tres
inserta en `usuario`: es la guardia de SL-11 R6.

**Consecuencia en los tests.** Con la regla de R28, todo `INSERT` de un usuario que no sea
superadmin necesita empresa. Lo cubren el `DEFAULT` de SL-17 y `enTransaccionRevertida` con empresa
por defecto (§9.1 de SL-17). Un test que inserte usuarios fuera de ese helper se pone en rojo con
`23514` (`check_violation`). T3 corre la suite de integración de `usuario` para encontrarlos.

## Fuente única: `lib/auth/plataforma.ts`

```ts
export const ROLES_PLATAFORMA = ["superadmin"] as const satisfies readonly RolValue[];
export function esPlataforma(rol: RolValue): boolean;
```

- Es la **única** declaración de quién es plataforma (R4). La leerán SL-25 y SL-26 para autorizar en
  sus Server Actions y páginas.
- Va en un archivo propio, y no en `acceso-total.ts`. `esAccesoTotal` responde «acceso total de
  **empresa**» (`maestro` y `admin`). Mezclar las dos preguntas en un archivo invita a que alguien
  añada `superadmin` a `ROLES_ACCESO_TOTAL` y le regale el dinero de las empresas.
- Hay sitios que nombran `superadmin` a la fuerza, porque el tipo los obliga a ser exhaustivos. La
  guardia nueva los lista explícitamente:
  - `ROL_LABELS` (`lib/auth/rol-label.ts`), con la etiqueta «Superadmin»;
  - `QUIEN_PREGUNTA` (`lib/asistente/instrucciones.ts`), con «administra la plataforma; no
    pertenece a ninguna empresa». No llega nunca al modelo, porque el servicio lo rechaza antes;
  - `ROLES_SIN_ANALITICA` (`lib/analytics/alcance.ts`), con `["superadmin"]`;
  - los `Record<RolValue, string>` de los tests de integración, que la compilación obliga a completar.

## Autorización

| Capa | Qué hace con el superadmin | Requisito |
|---|---|---|
| Menú (`menu-visibility.ts`) | Para el superadmin, un solo ítem, «Empresas», con `roles: ROLES_PLATAFORMA` por import. `itemsVisibles` devuelve ese ítem, `primerDestino` devuelve su `href` y `/dashboard` le redirige ahí. Para el `maestro` sale el subítem «Geografía». Es el último hijo, así que no mueve `primerDestino` (R46 de la 374). | R6, R26, R36 |
| Pantalla «Empresas» | La página hace `notFound()` si `!esPlataforma(actor.rol)`. El servicio del listado y la action de SL-17 responden `forbidden` con la misma pregunta. | R35 |
| Páginas y servicios de empresa | Nada cambia. Todas las whitelists lo excluyen y devuelven `notFound()` o `forbidden`. | R5 |
| Analítica | `resolverAlcance` lo deniega con `rol_sin_analitica`. | R7 |
| Asistente | `AsistenteService` lo rechaza por estar fuera de `ROLES_AYUDA`. | R7 |
| `UsuarioService` | Ver abajo. | R8–R11 |
| `GeografiaService` | El superadmin hace todo el módulo. El `maestro` solo conserva `listarArbol`, que es la lectura operativa de Tarifas. Ver abajo. | R24, R25 |

No hay módulo que tenga que estar encendido: el de módulos es SL-23.

### `GeografiaService`, la acción y la pantalla

En el servicio, dos conjuntos de roles con otro reparto:

```ts
const READ_ROLES = new Set<string>(["maestro", ...ROLES_PLATAFORMA]); // listarArbol: lectura operativa de Tarifas (R25)
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);              // crear, renombrar, cambiarActivacion, contarOrdenesSinEntregar (R24)
```

- Cada operación de gestión comprueba `GESTION_ROLES` **antes** de llamar al repositorio, así que un
  `forbidden` no escribe ni el nodo ni la fila del historial de acciones. Las reglas de hoy (sin
  borrado físico, cascada reversible, historial) no cambian.
- `GESTION_ROLES` y `READ_ROLES` leen `ROLES_PLATAFORMA` por import, nunca un literal (R4).
- `contarOrdenesSinEntregar` va con la gestión: solo la pide la pantalla de Geografía, para avisar
  antes de un retiro. `listarArbol` se queda abierto al `maestro`: lo usan
  `app/(app)/configuracion/tarifas/page.tsx` y `ZonasTarifasModule` por `listarArbolGeografico`, y
  Tarifas sigue siendo del `maestro` (R25). Los selectores de geografía de las órdenes no pasan por
  `GeografiaService` y no cambian.
- La página `app/(app)/configuracion/geografia/page.tsx` cambia su puerta a `esPlataforma(actor.rol)`.
  Al `maestro` le responde `notFound()` (R26). Al superadmin tampoco se le abre todavía: no tiene
  ítem de geografía en el menú (R6), y su pantalla es de SL-26, que la consumirá con estas mismas
  acciones. Por eso la
  página no recibe `puedeCambiarActivacion`, y `GeografiaAdminModule` no cambia.
- **Con SL-17 en `dev` (P7, abierta).** `cambiarActivacion` y `renombrar` escriben
  `historial_accion` con `appendAccion` en la misma transacción (`GeoRepository`), y
  `contarOrdenesSinEntregar` lee `orden`. Las dos son tablas de negocio, y el superadmin no tiene
  empresa: con su sesión, esas operaciones lanzan `EmpresaNoResuelta`. Hasta que Carlos decida,
  T11 prueba la rama del `superadmin` con dobles y la del `maestro` (`forbidden` sin escrituras)
  entera. No se inventa una empresa para el registro.
- `lib/auth/menu-visibility.ts` quita el subítem «Geografía» de Configuración.
- `lib/actions/geografia.ts` no cambia de forma: la autorización vive en el servicio.
- La ayuda `docs/ayuda/oficina/configuracion-geografia.md` dice que la geografía (alta, cambio de
  nombre, retiro y reactivación) la gestiona la plataforma, Servi Logistic, y que la oficina se la
  pide. Deja de describir controles que la oficina ya no tiene. Las fuentes del frontmatter no
  cambian, y se actualiza `actualizado:`. Este texto entra en la tanda 1, con el de la API.

**Tests de geografía que cambian.** Los que afirman hoy que el `maestro` da de alta, renombra,
retira, reactiva o cuenta con éxito pasan a usar un actor `superadmin`. Ganan un caso nuevo en el
que el `maestro` recibe `forbidden` sin escrituras, y otro en el que `listarArbol` le sigue dando
`ok`. Son:
- `tests/unit/services/geografia-service.test.ts`;
- `tests/unit/actions/geografia-action.test.ts`;
- `tests/unit/components/geografia-admin.ui.test.tsx`;
- `tests/integration/db/geografia-registro-accion.test.ts`;
- `tests/integration/db/geografia-cascada-reversible.test.ts`;
- `tests/unit/components/geografia-admin-page.test.tsx` (la puerta de la página);
- `tests/unit/auth/menu-visibility.test.ts`, que lista los subítems del `maestro`.

Los demás tests de geografía que nombran estas operaciones se revisan en T11.

### `UsuarioService` y `UserRepository`

`ALLOWED_ROLES` sigue siendo `["maestro"]`. Lo que cambia:

- **`listarRoles`**: filtra en el servicio los roles de `ROLES_PLATAFORMA` (R8). `repo.listRoles()`
  se queda completo, porque lo usan los resolvedores internos (`valorDelRol`, `resolverZona`,
  `resolverVehiculo` y `resolverFulfillment`).
- **`crear` y `actualizar`**: si el `rolId` pedido resuelve a un rol de plataforma, responden
  `{ status: "validation_error", fieldErrors: { rolId: [...] } }`. La comprobación va antes del hash
  y de cualquier escritura (R9).
- **`listar`, `listarCompleto` y el conteo**: el repositorio añade
  `rol: { value: { notIn: ROLES_PLATAFORMA } }` al `where` base. Es un `WHERE` en el repositorio, así
  que lo prueba un test de integración contra la base, no un doble (R10).
- **`usuarioRolFiltroSchema`**: `ROLES_FILTRO` se deriva de `ROL_LABELS` **menos** `ROLES_PLATAFORMA`.
  Así un filtro `rol=superadmin` sigue siendo un rol inexistente en el borde (R10), y los tests
  `usuario-schema.test.ts:253` y `usuarios.test.ts:333` siguen valiendo sin cambios.
- **`obtener`, `actualizar`, `cambiarEstado`, `restablecerContrasena` y `consultarImpactoCambio`**:
  leen el objetivo, y si su rol es de plataforma responden `not_found` antes de escribir (R11). Es
  `not_found` y no `forbidden` para no confirmar que el id existe.

## El comando de arranque

### Piezas, por capa

| Archivo | Papel |
|---|---|
| `scripts/arranque-superadmin.ts` | Punto de entrada (`tsx`), igual que `seed-catalogos.ts`: carga `.env` con `process.loadEnvFile()`, construye Prisma, llama al servicio, imprime el desenlace y sale con su código. Solo se ejecuta cuando es el entrypoint. |
| `lib/types/arranque-superadmin.ts` | Schema zod de la entrada (variables de entorno → `ArranqueSuperadminInput`) y tipo del desenlace. |
| `lib/interfaces/services/IArranqueSuperadminService.ts` | Contrato del servicio. |
| `lib/interfaces/repositories/IArranqueSuperadminRepository.ts` | Contrato del repositorio. |
| `lib/services/ArranqueSuperadminService.ts` | La regla: validar, hashear y delegar. No importa Prisma ni `RolValue`, así que se puede escribir antes de T0. |
| `lib/repositories/ArranqueSuperadminRepository.ts` | Prisma: transacción, cerrojo y escritura. |

### Entrada (variables de entorno)

| Variable | Regla | Origen |
|---|---|---|
| `SUPERADMIN_EMAIL` | `z.string().trim().email()` | ficha |
| `SUPERADMIN_PASSWORD` | `strongPasswordSchema` | ficha |
| `SUPERADMIN_NOMBRE`, `SUPERADMIN_TELEFONO`, `SUPERADMIN_DOCUMENTO` y `SUPERADMIN_TIPO_DOCUMENTO` | no vacías tras el `trim`; el tipo, del catálogo | P2, decidida por Carlos el 2026-10-22 |

El email se guarda tal como llega, solo con el `trim`, igual que el alta de `UsuarioService`. El login
no lo normaliza: cambiar eso no es de esta ficha.

### Desenlaces

```ts
type ArranqueSuperadminResultado =
  | { status: "creado" }                                            // exit 0
  | { status: "ya_existe" }                                         // exit 0, sin escrituras (R14)
  | { status: "entrada_invalida"; variables: { nombre: string; regla: string }[] } // exit 1 (R13)
  | { status: "conflicto"; campo: "email" | "documento" }           // exit 1 (R15)
  | { status: "catalogo_incompleto"; falta: "rol" | "tipo_identificacion" }; // exit 1
```

Los mensajes son fijos y en castellano. Nombran la variable, la regla o el campo, **nunca un valor**:
ni la contraseña, ni el email, ni el documento (R16; `docs/architecture.md`: sin PII en logs). Si
falta el catálogo, el mensaje pide correr `pnpm db:seed`, que es un script declarado (SL-11 R3).

### Flujo del repositorio, en una transacción

1. `pg_advisory_xact_lock(<constante>)`: serializa dos ejecuciones simultáneas (R17).
2. Si existe un `usuario` cuyo rol es `superadmin`, devuelve `ya_existe` sin escribir.
3. Resuelve el `rol` `superadmin` y el `tipo_identificacion` pedido. Si falta alguno, devuelve
   `catalogo_incompleto`. No los crea: son catálogo, y el comando no siembra.
4. Si el email o la cédula ya existen, devuelve `conflicto`. Un `P2002` en el `INSERT` se traduce
   según el índice que lo produjo:
   - `usuario_un_solo_superadmin` → `ya_existe`, con código 0 (R17);
   - email o cédula → `conflicto`.
5. Inserta el usuario con `organizacion_id = NULL` y el hash, que el servicio calcula **antes** de abrir la transacción para
   no tener el cerrojo durante el bcrypt.

### Login

No cambia. El superadmin entra por `/login`. En su primer dispositivo, `AuthService` le pide el OTP
por correo: con SMTP se envía, y sin SMTP (dev o CI) sale por `ConsoleEmailSender`. El E2E usa ese
camino (R18). En Production y Preview depende del correo (`> Dependencias operativas`).

## Pantalla «Empresas» del superadmin (R29–R36)

Es un trozo de SL-26 que se adelanta. Consume la pieza de dominio de SL-17 y no la reescribe.

### Ruta y piezas

| Archivo | Papel |
|---|---|
| `app/(app)/plataforma/empresas/page.tsx` | Server Component. Resuelve el actor y hace `notFound()` si `!esPlataforma(actor.rol)` (R35). Llama al servicio del listado y lee el catálogo `tipo_identificacion`, y los pasa por props. |
| `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` | Cliente. La tabla del listado, con su estado vacío, y el formulario «Crear empresa». Llama a la action de SL-17 y pinta los errores por campo. No fetchea: recibe los datos por props y, tras un alta, refresca con `router.refresh()`. |
| `lib/services/EmpresasPlataformaService.ts` | `listarEmpresas(actor)`: `forbidden` si `!esPlataforma(actor.rol)`. Si no, delega en el repositorio. |
| `lib/repositories/EmpresasPlataformaRepository.ts` | Dentro de `comoPlataforma("SL-32", "listado de empresas del superadmin")`: `organizacion` ordenada por `created_at` descendente, con sus usuarios de rol `maestro` (`nombre`, `email`), por `created_at`. Solo esas columnas: nada de `password_hash`, documento ni teléfono. |
| `lib/interfaces/services/IEmpresasPlataformaService.ts`, `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts` y `lib/types/empresas-plataforma.ts` | Contratos y el tipo `EmpresaListada = { id, nombre, slug, creadaEn, maestros: { nombre, email }[] }`. |
| `lib/auth/menu-visibility.ts` | El ítem `{ label: "Empresas", href: "/plataforma/empresas", iconKey: "building", roles: ROLES_PLATAFORMA }`, justo antes de «Mi bodega», de modo que «Ayuda» sigue siendo el último y «Mi bodega» el penúltimo (contratos previos de la 433 y la 429, que afirman `menu-ayuda` y `menu-mi-bodega`). Ningún otro rol lo ve, así que su posición no mueve el aterrizaje de nadie más (R36). |
| `app/(app)/_components/Sidebar.tsx` | `IconKey` gana `"building"` (`Building2` de `lucide-react`, que ya está en el repo), con el mismo comentario de «icono propio» que las demás. |

- **La ruta va fuera de `/configuracion`.** `/configuracion` es del `maestro` y le da 404 al
  superadmin (R5, T9). `plataforma/` es el prefijo de lo que SL-26 añada después.
- **Por qué el listado es de SL-32 y no un método nuevo de `OrganizacionService`.** El archivo es de
  SL-17, que se implementa en paralelo; añadirle un método sería otro choque. Si SL-17 ya expone un
  listado con estos campos, se usa el suyo y estas cuatro piezas no nacen (P10).
- **El catálogo de tipos de documento** es de plataforma (§2.2 de SL-17) y se lee sin contexto de
  empresa. Lo lee la página y lo pasa por props, igual que el formulario de Usuarios.

### Contrato con la action de SL-17

Entrada, tal como la transmite el leader:
`{ nombre, slug, maestro: { nombre, email, telefono, documento, tipoDocumento } }`.

| Respuesta de la action | Lo que hace la pantalla | R |
|---|---|---|
| éxito | Limpia el formulario, `router.refresh()` y aviso «Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?» y su email.» | R30, R37 |
| slug ya existe (conflicto, o «ya existe» si SL-17 lo hace idempotente) | Error junto a «Slug». No se presenta como creada | R31 |
| email ya existe | Error junto a «Email del maestro» | R32 |
| documento ya existe | Error junto a «Documento» | R33 |
| `validation_error` con `fieldErrors` | Un error por campo | R34 |
| `forbidden` u otro error | Mensaje genérico, sin detalle | R34, R35 |

- **Validación en el cliente.** El mismo schema zod de la entrada de SL-17, importado de su
  `lib/types/`, si lo exporta. Si no lo exporta, la pantalla no copia reglas: deja validar a la action
  y pinta sus `fieldErrors`. Dos schemas escritos a mano divergen.
- **La comprobación de rol de la action.** SL-17 la deja enganchada a `lib/auth/plataforma.ts`, y
  hasta entonces falla cerrado. Si SL-17 entra en `dev` antes con un stub, T15 cambia ese stub por
  `esPlataforma` y nada más. El test de R35 vive en SL-32: con un `maestro`, la action responde
  `forbidden` y no escribe.
- La ruta y el nombre de la action, la forma exacta de cada error y cómo se guarda «sin
  contraseña» se leen en T0 (P10).

### El marco del portal para el superadmin (R6)

`app/(app)/layout.tsx` lee en cada página `UserRepository.findById(actor.usuarioId)` (el nombre del
pie) y `avisosPushDe` (`usuario_preferencia`). Con SL-17, las dos son tablas de negocio, y el
superadmin no tiene empresa: las dos lecturas lanzarían `EmpresaNoResuelta` y tumbarían todas sus
páginas. El cambio es mínimo:

- si `esPlataforma(actor.rol)`, el nombre se lee con un `findById` dentro de
  `comoPlataforma("SL-32", "nombre del superadmin en el pie")`;
- `avisosPushDe` no se llama, y se pasa `false`: el superadmin no recibe avisos de empresa;
- la tercera lectura (`revisionSinpe`) ya es `null` para él, porque `puedeEditarAlgunSinpe` no lo
  incluye.

Lo prueba `tests/integration/app-layout-superadmin.test.tsx`: con un actor superadmin, ni
`UsuarioPreferenciaRepository` ni el cliente de empresa reciben llamadas, y el pie lleva su nombre.

**Añadido el 2026-10-23 (implementación; review de SL-32, punto 6).** Las actions que el marco dispara en cada página
(`lib/actions/notificaciones.ts` y `lib/actions/push.ts`) devuelven su desenlace vacío o neutro a un
actor de plataforma sin construir servicio ni repositorio, y sin `comoPlataforma`, que le abriría todas
las empresas. Lo prueba `tests/unit/actions/marco-superadmin-sin-empresa.test.ts`.

**El contexto de datos, compartido por proceso (2026-10-23).** El `AsyncLocalStorage` de
`lib/db/contexto-empresa.ts` (SL-17) vivía como constante de módulo. En `next dev`, el middleware y la
app cargan copias distintas de ese módulo y comparten el cliente de Prisma de `globalThis`, así que
el `comoPlataforma` de una copia no lo veía la extensión atada a la otra: tras un login real,
`/dashboard` daba 404. El almacén pasa a `globalThis` con `Symbol.for`, el mismo patrón que el cliente.
Lo prueba `tests/unit/db/contexto-empresa-una-instancia.test.ts`. Hay que llevarlo a `dev`.

### Diseño visual

Es una pantalla nueva, así que **pasa por `/design` antes de implementarse** (T12;
`docs/perfil-agentes.md > frontend_dev`). Se mantiene mínima y coherente con las pantallas de
configuración que ya hay (`configuracion/vehiculos`, `UsuariosModule`): el mismo `PageHeader`, una
tabla y un formulario con los componentes de `components/ui/`. No hay marca nueva: la marca es de la
fase 7 (`docs/perfil-agentes.md`).

#### Propuesta de T12 (2026-10-22, implementer)

Pantalla mínima: un listado y un formulario. No hay piezas nuevas. Todo sale de lo que ya usan
`configuracion/vehiculos` y `UsuariosModule`.

**Marco.** `AppPage title="Empresas"`, como `configuracion/vehiculos/page.tsx`. La página (T15) es
un Server Component y le pasa a `EmpresasModule` tres props: `empresas: EmpresaListada[]`,
`tiposDocumento: { id, value }[]` (la forma de `ListarTiposIdentificacionResult`) y
`altaEmpresa`, la action inyectada.

**Orden vertical**, de teléfono a escritorio con una sola columna:

1. **El aviso tras un alta**, solo después de un éxito. Es un `Alert` (`components/ui/alert`) con
   `role="status"` y este texto: «Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?»
   y su email.» Se cierra al empezar a escribir otra empresa (R37).
2. **El formulario «Crear empresa»**, siempre visible. No va en un modal: es la acción principal
   de la pantalla, y un modal esconde los errores al cerrarse. Son dos grupos con su subtítulo
   (`h2` de `text-sm font-medium`):
   - **Empresa:** «Nombre» y «Slug». El slug lleva la ayuda corta «minúsculas, números y guiones».
   - **Primer maestro:** «Nombre», «Email», «Teléfono», «Tipo de documento» y «Documento». El tipo
     es un `Select` (`components/ui/select`) con los valores del catálogo, como en `UsuarioForm`.

   Cada campo es `FormField` (`components/shared/FormField`) con su `error`, y el control es un
   `Input`. Se usan dos columnas desde `md` (`grid md:grid-cols-2`) y una en móvil. El botón
   «Crear empresa» (`Button` con `loading`) va al final. No hay campo de contraseña (R37).
3. **El error genérico**, si lo hay. Va encima del botón, como `Alert variant="destructive"`, con
   el texto «No se pudo crear la empresa. Inténtalo de nuevo.», sin detalle (R34, R35).
4. **El listado**, `Table` (`components/ui/table`), con cuatro columnas: Nombre, Slug, Alta (fecha
   corta, `es`) y Maestros. Cada maestro va en su línea, como «nombre · email». Las filas llegan
   ordenadas del servidor y la pantalla no reordena. Sin empresas, la tabla deja su sitio a
   `EmptyState` (`components/shared/EmptyState`): «Aún no hay empresas. Crea la primera con el
   formulario.» (R29).

**Errores de la action.** Siguen la tabla `> Contrato con la action de SL-17`, con los desenlaces
de §7.7 de SL-17. En todos los casos de error se conserva lo escrito:

| Respuesta | Dónde se pinta |
|---|---|
| `conflicto` con `campo: "slug"`, o `ya_existe` | bajo «Slug»: «Ya hay una empresa con ese slug.» |
| `conflicto` con `campo: "email"` | bajo «Email»: «Ese email ya pertenece a otro usuario.» |
| `conflicto` con `campo: "documento"` | bajo «Documento»: «Ese documento ya pertenece a otro usuario.» |
| `invalida` con `campo` | bajo ese campo: «Revisa este campo.». Si el `campo` no corresponde a ninguno, el genérico |
| cualquier otra cosa, o una excepción | el genérico |

Tras un éxito (`creada`), el formulario se vacía, se muestra el aviso y se llama a
`router.refresh()` (R30).

**Lo que no se hace.** No hay validación de cliente que copie reglas. El schema zod de SL-17 aún no
está en la rama, así que valida la action (`> Contrato con la action de SL-17`). Tampoco hay
búsqueda, paginación ni edición: eso es SL-26.

Mientras no llegue T0, el tipo de la action es local al componente y copia §7.7 de SL-17. T15 lo
cambia por el import de `lib/types/organizacion.ts`. `tipoDocumento` viaja como el `value` del
catálogo (`cedula`, `ruc` o `pasaporte`), igual que `SUPERADMIN_TIPO_DOCUMENTO`. Si SL-17 espera el
`id`, se cambia en T0.

## Primer acceso del maestro creado (R37, R38)

**Lo que ya existe, mirado en el código:**

1. **Contraseña generada que se muestra una vez** (`generateStrongPassword`, fichas 25 y 287). Es el
   camino del `maestro` cuando da de alta a alguien. **No se usa aquí**: el contrato de SL-17 crea al
   maestro sin contraseña (alternativa K).
2. **«Recuperar contraseña»** (`PasswordResetService`): `solicitar` emite un OTP por correo,
   `verificarCodigo` lo comprueba y `restablecer` guarda el hash nuevo. Es el que elige el contrato
   de SL-17. **Pero está desactivado**: `app/recuperar-contrasena/page.tsx` monta
   `RecuperacionDesactivadaAviso` desde el 2026-09-04, y el login no enlaza a la página.
3. **Restablecer desde Usuarios** (ficha 287): solo el `maestro`, sobre usuarios de su empresa. No
   sirve para el primer maestro.

**Lo que hace SL-32.** La pantalla no maneja contraseñas (R37). Cuando el correo esté verificado en
el entorno, T19 vuelve a montar `RecuperarContrasenaForm` y el enlace del login con los dos cambios
que describe el propio aviso, y revierte los dos tests que señala:
`tests/integration/login-form-reset-link.test.tsx` y
`tests/integration/recuperar-contrasena-page.test.tsx` (R38). Requiere el OK de Carlos (P9).

## Dependencias operativas (no son código)

Sin ellas, las pantallas funcionan pero **nadie entra**: ni el superadmin en un dispositivo nuevo
(R18) ni el maestro creado (R37).

| Dependencia | Dónde | Estado | Quién decide |
|---|---|---|---|
| Correo que envía de verdad: `SMTP_USER` y `SMTP_PASSWORD` (contraseña de aplicación de Google), por entorno | Vercel, Production y Preview por separado | **No configurado.** El último SMTP fallaba con `535` (aviso del 2026-09-04) | Carlos (P8) |
| Alternativa sin SMTP: `AUTH_OTP_DEBUG_LOG=1`, y leer el código en los logs de Vercel | Vercel, por entorno | Existe en el código. `.env.example` dice «DEJALO VACIO EN PRODUCCION: es un secreto en los logs» | Carlos (P8). Si se usa, es temporal y queda como deuda |
| Verificación: un correo de OTP que llega, antes de dar de alta la primera empresa real | cada entorno | Pendiente. Se anota en `progress/impl_SL-32.md` | quien despliega |
| `pnpm arranque:superadmin`, a mano, una vez por entorno, después de `migrate deploy` y de T4.1 de SL-17 | producción y QA | Pendiente | Carlos (P4) |

## Gestionar la geografía es de la plataforma (D7)

| Archivo | Antes | Después |
|---|---|---|
| `lib/api/openapi-spec.ts:2006` | `` `… ${EMPRESA.alInicio} puede retirar una provincia, un cantón` `` | `` `… ${MARCA.nombre} puede retirar una provincia, un cantón` `` |
| `docs/api/api-key-openapi.yaml:1944` | `La empresa puede retirar una provincia, un cantón` | `Servi Logistic puede retirar una provincia, un cantón` |
| `docs/api/CHANGELOG.md:572` | `La empresa pasa a poder **retirar** una provincia, … de su` | `Servi Logistic pasa a poder **retirar** una provincia, … del` |
| guardia de SL-16 | dos entradas en `FRASES_OPERADOR` y `"La empresa puede retirar una"` en `DESCRIPCIONES_QUE_CAMBIAN` | las mismas frases, con la marca, en `FRASES_PLATAFORMA`, y `"Servi Logistic puede retirar una"` en la paridad |

- Se usa `MARCA.nombre` y no «la plataforma». `MARCAS_PLATAFORMA` reconoce «la plataforma» solo en
  minúscula, y la frase empieza oración. SL-15 ya escribe así lo técnico de la plataforma
  (`docs/plan-saas.md`, decisión 4).
- Los suelos de la guardia: `FRASES_OPERADOR.length >= 156` y `FRASES_PLATAFORMA.length >= 50`. Si
  mover dos frases deja el primero por debajo, se baja a mano con su motivo en el comentario.
- **No cambia** `docs/api/guia-integracion/guia-integracion.html:537` («…pida a la empresa
  reactivarlo»). Quien integra es cliente de la empresa, y su interlocutor es la empresa, aunque
  quien ejecute sea la plataforma. Si el humano lo quiere distinto, es un cambio de una línea.
- La ayuda de la pantalla, el menú y la autorización también cambian: ver `> Autorización >
  GeografiaService`. La ayuda entra en la tanda 1, con este texto; el menú y la autorización, en la
  tanda 4.
- Al cerrar: D7 pasa a resuelta en `progress/deudas.md`, sin deuda nueva.

## Guardias que cambian

| Guardia | Cambio |
|---|---|
| `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (SL-11 R2) | `faltasDeScripts` pasa a leer una **lista** de excepciones `{ nombre, comando, ficha }`, y SL-32 añade una sola fila: `arranque:superadmin` → `tsx scripts/arranque-superadmin.ts`, ficha SL-32 (R19). Si SL-17 conserva `alta:empresa`, es otra fila con ficha SL-17. Quien mergea segundo rebasa y deja **las dos** filas. Una contraprueba sintética comprueba que un script con `superadmin` fuera de la lista, o el mismo nombre con otro comando, sigue en rojo. Ninguna aserción supone que la lista tiene un solo elemento. R6 (ninguna migración inserta en `usuario`) no cambia. |
| `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (SL-16 R6/R16) | Lo de D7, arriba. |
| `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts` | Pasa de seis `RolValue` a siete. La partición ternaria sigue cubriéndolos, con `superadmin` en `ROLES_SIN_ANALITICA`. |
| **Nueva:** `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` | (a) Ningún ítem ni subítem de `SIDEBAR_ITEMS`, ni `ROLES_ACCESO_TOTAL`, `ROLES_AYUDA`, `ROLES_ANALITICA`, `ROLES_HISTORICO_CONVERSACIONES`, `ROLES_HISTORIAL_ACCIONES`, `ROLES_MI_WALLET`, `ROLES_MI_BODEGA` ni `ALLOWED_ROLES`/`READ_ROLES`/`WRITE_ROLES` de los servicios contiene un rol de plataforma. Hay tres excepciones declaradas: `GESTION_ROLES` y `READ_ROLES` de `GeografiaService` (R24, R25), y el ítem «Empresas» de `SIDEBAR_ITEMS` (R36). Las tres tienen que leer `ROLES_PLATAFORMA` por import. Cualquier otra lista que lo incluya es rojo. (b) El literal `superadmin` solo aparece en `lib/` y `app/` en `plataforma.ts` y en la lista declarada de tablas exhaustivas (R4). Lleva contraprueba sintética. |

## Dependencias

Ninguna nueva. Se usan `bcryptjs`, `zod`, `tsx` y `@prisma/client`, que ya están en el repo.

## Alternativas descartadas

- **A. Una migración que inserta el superadmin con el hash.** La contraseña, aunque fuera su hash,
  quedaría en la historia del repo, y sería la misma en todos los entornos. Choca con la guardia de
  SL-11 R6 y con la regla «sin seeds».
- **B. Sembrarlo en `db:seed`.** Mezcla catálogos, que son producto, con un usuario, que es dato de
  cada entorno. Además `db:seed` se corre en CI y en cada base de test, y cada una tendría un
  superadmin sin pedirlo.
- **C. Una marca `es_plataforma` en `usuario` en vez de un rol.** Todas las whitelists de roles
  dejarían de bastar: un `maestro` con la marca pasaría todas las puertas de empresa **y** las de
  plataforma, y cada servicio tendría que mirar dos cosas. Con un rol, el «denegado por defecto» de
  las whitelists protege gratis (R5).
- **D. Ampliar `maestro` o reutilizarlo.** Descartado por el humano: el superadmin no es `maestro`.
- **E. Pedir la contraseña por consola, de forma interactiva.** No sirve en un despliegue ni en el
  E2E, y la ficha dice «por variable de entorno».
- **F. Volver nulables `cedula`, `telefono` y `tipo_identificacion_id`.** Toca columnas heredadas que
  leen la etiqueta, los listados y la postulación, que hoy asumen el valor. Es un cambio más grande
  que el problema (P2).
- **G. Que el comando, si ya hay superadmin, le reescriba la contraseña.** Correrlo dos veces con
  otro `.env` cambiaría la credencial en silencio. Para eso está «Recuperar contraseña» (P3).
- **H. Un trigger que cuente los superadmins en vez del índice único parcial.** Un trigger que
  cuenta no ve la fila que otra transacción aún no ha confirmado, así que dos inserciones a la vez
  pasarían las dos, salvo que añada su propio cerrojo. El índice parcial es atómico y declarativo,
  y cubre tanto el `INSERT` como el `UPDATE` de `rol_id`. A cambio fija el `id` de la fila de `rol`
  en la migración.
- **I. Mover solo retirar y reactivar a la plataforma**, y dejar alta y renombrado en el `maestro`.
  Era la primera lectura de D7. Carlos la amplió el 2026-10-22: el módulo entero es de la
  plataforma. Un paso más allá, cerrar al `maestro` también `listarArbol`, rompería Tarifas, que
  nadie decidió quitarle.
- **K. Que la pantalla genere una contraseña del maestro y la muestre una vez**, como hace hoy el
  alta de Usuarios (`generateStrongPassword` y `ContrasenaGeneradaPanel`). Es el mecanismo que no
  depende del correo, y por eso era el candidato natural sin SMTP. Se descarta porque el contrato
  de SL-17 crea al maestro sin contraseña y elige «recuperar contraseña» (leader, 2026-10-22). Si P8
  no se resuelve a tiempo, es la vuelta atrás más barata, pero cambia el contrato de SL-17 y
  necesita el OK de Carlos.
- **L. Poner «Empresas» como subítem de Configuración.** Configuración es del `maestro`, y
  `/configuracion` le da 404 al superadmin (R5). Abrírsela le regalaría Usuarios, Tarifas y API.
- **M. Añadir `listar` a `OrganizacionService`.** Es el archivo de SL-17, en vuelo en paralelo, y
  sería otro choque más. Se usa si SL-17 ya lo trae (P10).
- **N. Dejar la portada «Bienvenido» y llegar a «Empresas» por URL.** Un menú que no ofrece la
  única pantalla del rol obliga a saber la ruta. Con el ítem, `primerDestino` lo lleva solo.
- **J. Dejar la autorización de geografía para SL-20.** Era la recomendación inicial. Carlos la
  descartó el 2026-10-22: el permiso cambia ya.

## Riesgos

- **Nadie gestiona la geografía desde la interfaz hasta SL-26.** El `maestro` pierde el módulo
  (R26) y el superadmin todavía no tiene pantalla. Las acciones del servidor sí funcionan para el
  superadmin. Es la consecuencia aceptada de mover el permiso ya (Carlos), y SL-26 tiene que
  incluir la pantalla de geografía de plataforma. Lo mismo pasa con Vehículos desde SL-17 (D12):
  el `maestro` ya no escribe el catálogo, y la interfaz del superadmin llega con SL-26.
- **El primer acceso depende del correo** (P8, P9). Sin SMTP verificado, o sin el atajo de
  `AUTH_OTP_DEBUG_LOG`, la empresa se crea pero su maestro no puede poner contraseña ni pasar el OTP.
  Es el riesgo más alto para mañana, y no se arregla con código de esta ficha.
- **El marco del portal y SL-17.** Si SL-17 llega a `dev` y el layout no se adapta (T15), todas las
  páginas del superadmin caen con `EmpresaNoResuelta`, «Empresas» incluida.

## Límite del alcance

- El `maestro` no crea superadmins ni asciende a nadie a superadmin: lo cubren R8–R11 y R27.
- El alta de empresas desde el superadmin entra aquí solo como pantalla «Empresas»: listado y
  «Crear empresa» con su primer maestro. Editar o retirar empresas y gestionar sus demás usuarios es
  de SL-26. La pieza de dominio del alta es de SL-17.
- Fuera de Geografía, SL-32 no cambia los módulos del `maestro` (Carlos): Usuarios, Tarifas, API,
  Plantillas, Envíos automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes.
  **Vehículos cambia por SL-17**, no por SL-32 (D12 de SL-17): el catálogo es de plataforma y el
  `maestro` ya no lo escribe. SL-32 no toca `VehiculoService` ni el subítem «Vehículos» del
  menú del `maestro`, que SL-17 deja de solo lectura. La edición del superadmin llega con SL-26.

## Choques con SL-17 (quien mergea segundo rebasa; §10 de SL-17)

| Punto | Qué comparten | Cómo se resuelve |
|---|---|---|
| Migraciones | `usuario`, el enum y el orden | Las tres de SL-32 van con timestamp posterior a `20261022130300_misma_empresa_en_fk` (R21). Se fijan en T0 |
| `db/schema.prisma` | `Usuario` (`organizacionId String?` de SL-17) y `RolValue` | SL-32 solo añade el valor del enum. La regla de R28 no va en el schema: Prisma no modela `CHECK`, así que no hay drift |
| `CHECK` de R28 | La columna `usuario.organizacion_id` de SL-17 | Migración propia de SL-32 (§10 de SL-17). Necesita la columna: solo después de SL-17 en `dev` |
| `package.json > scripts` | `arranque:superadmin` (SL-32) y, si sigue en su spec, `alta:empresa` (SL-17) | Las dos líneas conviven |
| `fuera-datos-ordenex.guardia.test.ts` (`faltasDeScripts`) | La lista de excepciones | Una lista con una fila por ficha (`> Guardias que cambian`) |
| `lib/db/excepciones-aislamiento.ts` | `EXCEPCIONES_DE_PLATAFORMA` | SL-32 añade sus tres filas con `ficha: "SL-32"` |
| La action de alta de SL-17 | La comprobación de rol | SL-17 la engancha a `esPlataforma`; si queda un stub, T15 lo cambia |
| `e2e/dos-empresas-humo.spec.ts` de SL-17 | Recorre las rutas del menú del `maestro` y abre «geografía» y «vehículos» (§9.3, punto 5) | Con T11, «Geografía» sale del menú del `maestro` y su página le da 404. El humo deriva las rutas del menú, así que deja de visitarla, pero su punto 5 dice que la abre. SL-17 no lo ajustó al mergear: lo ajustó SL-32 el 2026-10-23 al mergear segundo (el punto 6 espera el 404 y que no quede ninguna provincia nueva) |
| `app/(app)/layout.tsx` | Lecturas de `usuario` y `usuario_preferencia` | T15 lo adapta para el superadmin (`> El marco del portal`) |
- **El `id` fijo del rol `superadmin`.** Si alguna base tuviera ya esa fila con otro `id`, la
  migración aborta en vez de dejar un índice que no protege nada. Hoy no puede pasar, porque el
  valor del enum no existe antes de la migración.
- **La tanda 3 espera a SL-17** (antes esperaba a SL-28, que ahora va después de SL-17). Las tandas 1
  y 2 avanzan sin ella. Lo que necesita el enum generado (tandas 3 y 4) espera, porque el schema y
  la migración van juntos, o la prueba de drift
  `tests/integration/db/schema-drift-saneamiento.test.ts` se pone en rojo.
- **SL-17 cambia `usuario` debajo de SL-32.** Si SL-17 deja `organizacion_id` como `NOT NULL`,
  contradice la decisión de Carlos (el superadmin va con `NULL`) y SL-32 no puede crearlo. Se
  comprueba en T0 y, si pasa, se para y se pregunta.
- **SL-15 y SL-16 siguen `in_progress` en el board** y son dueñas de los archivos de D7. Antes de la
  tanda 1, `scripts/archivos-en-vuelo.mjs` tiene que confirmar que no hay choque, o que ya están
  integradas en `dev`.
- **Tests que iteran `Object.values(RolValue)`** (unos doce) reciben un séptimo rol. La mayoría
  esperan `forbidden` para todo rol ajeno y pasan solos. Los que tienen una tabla de expectativas
  exhaustiva se completan en la tanda 3.
- **La suite de integración está en el baseline de rojos (D8).** Los tests de integración nuevos
  crean sus propios datos (rol, tipo de documento y usuarios) y tienen que pasar en verde, fuera del
  baseline.
