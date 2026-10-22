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
- **ABIERTO, se cierra en T0:** si SL-17 deja `organizacion_id` nulable, ¿quién impide que un usuario
  de empresa quede con `NULL`? SL-17 no puede escribir un `CHECK` que nombre el rol `superadmin`,
  porque cuando corre su migración ese rol aún no existe. Si al leer su migración no hay regla, se
  propone al humano que la segunda migración de SL-32 añada
  `CHECK (("organizacion_id" IS NULL) = ("rol_id" = '<UUID_ROL_SUPERADMIN>'))`. No se añade sin su OK.

### País

El tipo de documento (`tipo_identificacion`: `cedula`, `ruc` o `pasaporte`) es un dato que depende
del país. Sale del catálogo existente, nunca de un literal del comando, y lo valida contra la base
(P2). Que el catálogo sea por país es de SL-20/21.

## Migraciones

Van **encima de la migración de SL-17** (T0), porque las dos tocan `usuario`. Llevan dos carpetas
por el error 55P04 de Postgres:
un valor de enum no se puede usar en la misma transacción que lo añade.

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

`seedRoles` hace upsert por `value`, así que conserva el `id` fijo de la migración. El
`<UUID_ROL_SUPERADMIN>` se genera una vez al escribir la migración, y `lib/auth/plataforma.ts` no
lo repite: el código busca el rol por valor.

Los timestamps se fijan cuando SL-17 esté en `dev`: los dos tienen que ser posteriores a su
migración. SL-28 consolida después, y su línea base las absorberá. Eso es de SL-28. Ninguna de las dos inserta en `usuario`: es la guardia de SL-11 R6.

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
| Menú (`menu-visibility.ts`) | Para el superadmin nada cambia: ningún ítem lo lista, así que `itemsVisibles` devuelve `[]`, `primerDestino` devuelve `null` y `/dashboard` pinta «Bienvenido». Para el `maestro` sale el subítem «Geografía». Es el último hijo, así que no mueve `primerDestino` (R46 de la 374). | R6, R26 |
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
  menú (R6), y su pantalla es de SL-26, que la consumirá con estas mismas acciones. Por eso la
  página no recibe `puedeCambiarActivacion`, y `GeografiaAdminModule` no cambia.
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
camino (R18).

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
| `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (SL-11 R2) | `faltasDeScripts` admite **exactamente** `arranque:superadmin` → `tsx scripts/arranque-superadmin.ts`, como excepción declarada con su ficha. Una contraprueba sintética comprueba que un segundo script con `superadmin`, o el mismo nombre con otro comando, sigue en rojo. R6 (ninguna migración inserta en `usuario`) no cambia. |
| `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (SL-16 R6/R16) | Lo de D7, arriba. |
| `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts` | Pasa de seis `RolValue` a siete. La partición ternaria sigue cubriéndolos, con `superadmin` en `ROLES_SIN_ANALITICA`. |
| **Nueva:** `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` | (a) Ningún ítem ni subítem de `SIDEBAR_ITEMS`, ni `ROLES_ACCESO_TOTAL`, `ROLES_AYUDA`, `ROLES_ANALITICA`, `ROLES_HISTORICO_CONVERSACIONES`, `ROLES_HISTORIAL_ACCIONES`, `ROLES_MI_WALLET`, `ROLES_MI_BODEGA` ni `ALLOWED_ROLES`/`READ_ROLES`/`WRITE_ROLES` de los servicios contiene un rol de plataforma. Hay dos excepciones declaradas: `GESTION_ROLES` y `READ_ROLES` de `GeografiaService` (R24, R25), y tienen que leer `ROLES_PLATAFORMA` por import. Cualquier otra lista que lo incluya es rojo. (b) El literal `superadmin` solo aparece en `lib/` y `app/` en `plataforma.ts` y en la lista declarada de tablas exhaustivas (R4). Lleva contraprueba sintética. |

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
- **J. Dejar la autorización de geografía para SL-20.** Era la recomendación inicial. Carlos la
  descartó el 2026-10-22: el permiso cambia ya.

## Riesgos

- **Nadie gestiona la geografía desde la interfaz hasta SL-26.** El `maestro` pierde el módulo
  (R26) y el superadmin todavía no tiene pantalla. Las acciones del servidor sí funcionan para el
  superadmin. Es la consecuencia aceptada de mover el permiso ya (Carlos), y SL-26 tiene que
  incluir la pantalla de geografía de plataforma.

## Límite del alcance

- El `maestro` no crea superadmins ni asciende a nadie a superadmin: lo cubren R8–R11 y R27.
- El superadmin tendrá su propio alta de empresas y de los usuarios de cada una. Eso es de SL-25 y
  SL-26, no de esta ficha: SL-32 solo deja el rol, su arranque y `lib/auth/plataforma.ts`.
- Fuera de Geografía, los módulos del `maestro` no cambian (Carlos): Usuarios, Tarifas, API,
  Plantillas, Vehículos, Envíos automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes.
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
