# impl SL-32 — Rol superadmin y su usuario de arranque

## T0 — base adelantada sobre la rama de SL-17 — 2026-10-23

- Merge de `origin/dev` (`f7fb97c`) y luego de `origin/feature/SL-17-organizacion-y-aislamiento`
  (`d9df97f`), con merge y no rebase, en `43bedad`. SL-17 aún no está en `dev` (PR #3): hasta que
  entre, la base es su rama. Conflictos: `progress/deudas.md` (SL-17 trae D10–D14; la D10 de SL-32
  pasa a **D15**, y se actualizan sus dos referencias) y `tests/baseline-rojos.json` (se conservan
  las tres filas de PG 17 que trae `dev`).
- **Última migración:** `20261023090000_unicos_por_empresa` (no la `…130300` que decía el spec). Las de
  SL-32 van detrás.
- **`usuario.organizacion_id`:** `String?`, nulable, `@default(dbgenerated())`, comentario «NULL =
  superadmin». Sin `CHECK` sobre la columna: R28 lo pone SL-32.
- **Únicos:** `email` y `cedula` siguen `@unique` globales (la migración `unicos_por_empresa` los deja
  globales a propósito). El `conflicto` del comando es global.
- **Contrato de la action (P10):** `altaEmpresaAction(input: unknown, deps?)` en
  `lib/actions/organizaciones.ts`. Devuelve `AltaEmpresaResultado | { estado: "no_autorizado" }`
  (no `forbidden`). `AltaEmpresaResultado` (`lib/types/organizacion.ts`): `creada{organizacionId,
  maestroId} | ya_existe{organizacionId} | conflicto{campo: slug|email|documento} | invalida{campo}`.
  Exporta `altaEmpresaInputSchema`, `SLUG_ORGANIZACION`, `SLUG_MIN`, `SLUG_MAX`. La comprobación de
  rol es `exigirSuperadmin` (`lib/auth/exigir-superadmin.ts`), un stub que falla cerrado
  (`return false`): T15 la cambia por `esPlataforma`. «Sin contraseña»: `OrganizacionService` guarda
  el hash de 32 bytes aleatorios descartados. **SL-17 no trae listado:** T14a/T14b se quedan.
- **`migrate status`** sobre `sl32_base` (local, desechable) recién migrada: «Database schema is up to
  date!».

## Tanda 1 — T1. Texto y guardia (R22, R23) — 2026-10-22

**Archivos en vuelo.** `node scripts/archivos-en-vuelo.mjs` lista SL-15, SL-16 y SL-34 «rama NO
publicada». SL-15 y SL-16 se ignoran: están finalizadas e integradas en dev, y el board local está
desactualizado (lo indicó el leader). SL-34 no toca estos archivos.

**Archivos modificados**
- `lib/api/openapi-spec.ts` (l. 2006): `${EMPRESA.alInicio}` pasa a `${MARCA.nombre}`. `MARCA` sale
  de `lib/config/marca.ts` (`{ nombre: "Servi Logistic" }`). El import de `EMPRESA` se queda porque
  la l. 1486 lo sigue usando.
- `docs/api/api-key-openapi.yaml` (l. 1944): «La empresa puede retirar» pasa a «Servi Logistic puede retirar».
- `docs/api/CHANGELOG.md` (l. 572): «La empresa pasa a poder **retirar** … de su» pasa a «Servi
  Logistic pasa a poder **retirar** … del», como dice el design.
- `tests/unit/guards/docs-marca-heredada.guardia.test.ts`: las dos frases salen de `FRASES_OPERADOR`
  y entran en `FRASES_PLATAFORMA`. El bloque de `CHANGELOG.md` en operador queda vacío y se quita.
  `DESCRIPCIONES_QUE_CAMBIAN` pasa a `"Servi Logistic puede retirar una"`. El suelo de operador baja de
  156 a 154, con el motivo en un comentario. Medido: hay 154 frases después del cambio.

Los cuatro archivos tienen el mismo fin de línea que antes (CRLF en la copia de trabajo). La guardia
salió en LF tras el Edit y se volvió a pasar a CRLF.

**R → test**
- R22 → `docs-marca-heredada.guardia.test.ts` > «R16: «Servi Logistic puede retirar una» dice lo mismo en
  el TS y en el YAML», y > «cada archivo contiene su forma final de cada frase de plataforma» (YAML y CHANGELOG).
- R23 → la misma guardia: las dos frases están en `FRASES_PLATAFORMA` y la paridad usa la forma nueva.

**Salida**
- `pnpm exec vitest related --run lib/api/openapi-spec.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts`
  → `Test Files 23 passed (23)`, `Tests 314 passed (314)`.
  La primera corrida dio 1 failed (`expected 154 to be greater than or equal to 156`). Se corrigió
  bajando el suelo.
- Mutación: «La empresa puede retirar» vuelve al YAML → `Tests 2 failed | 40 passed (42)`. Fallan
  «cada archivo contiene su forma final de cada frase de plataforma» y «R16: «Servi Logistic puede
  retirar una»…». Al revertirla → `Tests 42 passed (42)`, y el diff del YAML queda solo con el cambio de T1.
- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm exec eslint lib/api/openapi-spec.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts` → exit 0, sin salida.

**Gate de la tanda** (`TEST_RAPIDO_BASE=dev ./init.sh`, log en `_trabajo/init-SL-32-t1.log`):
`INIT_EXIT=1`, con `Tests 1 failed | 3992 passed | 20 skipped (4013)`. El único rojo es ajeno al diff:
`tests/unit/guards/test-citado-desaparecido.guardia.test.ts > ninguna excepción temporal sobrevive a su
motivo (D4 de SL-13)`. Dice que las dos excepciones de `specs/461-cobro-a-tienda-y-nombres-claros/design.md`
(`reclasificacion-459-migration.test.ts` y `reclasificacion-459-lista.guardia.test.ts`) ya no tienen su
borrado en la historia de git. La historia se aplanó en `86d70bf`, y el propio mensaje lo da como
esperado. Ese archivo no está en `tests/baseline-rojos.json`. SL-32 no lo toca: se lo paso al leader.

**Veredicto:** T1 está hecha. R22 y R23 tienen test, y la mutación del YAML pone la guardia en rojo.

## Tanda 1 (cont.) — T1b. Texto de la ayuda (R26)

**Archivos**
- `docs/ayuda/oficina/configuracion-geografia.md` (modificado; LF conservado). `actualizado:` pasa
  a 2026-10-22. `fuentes` y `roles` no cambian (el permiso y el menú van en T11).
- «Qué podés hacer» (añadir, activar y desactivar) se reemplaza por «Quién lo gestiona»: la
  plataforma, Servi Logistic, da de alta, renombra, retira y reactiva, y la oficina se lo pide.
  No se nombra ningún canal de contacto porque docs no da ninguno.
- «Antes de tocar el catálogo» pasa a ser «Qué pasa cuando un nodo se retira», con el mismo
  contenido (las órdenes viejas quedan intactas y el nodo «desaparece» de los selectores).
- Salen los dos errores de «Cosas que te pueden pasar» («Ese nodo ya no está en el catálogo» y
  «Este campo es obligatorio»), porque son de los controles de edición que la oficina pierde.

**R26 → test:** la parte de la ayuda se revisa en el diff (tasks.md, tabla de trazabilidad). Con
grep (`añad|agreg|alta|renombr|retir|reactiv|activ|desactiv|podés`) quedan 6 líneas, y todas
tienen a Servi Logistic como sujeto o describen el efecto de un retiro. No queda ninguna que diga
que la oficina gestiona el catálogo.

**Salida**
- `pnpm exec vitest related --run docs/ayuda/oficina/configuracion-geografia.md` →
  `No test files found, exiting with code 0`: no relaciona nada con un `.md`.
- Las guardias y tests de ayuda, corridos a mano: `asistente-sin-frontmatter`, `ayuda-columna-retirada`,
  `ayuda-md-viajan-a-produccion`, `ayuda-pantalla-ruta-existe`, `ayuda-render-sin-filtracion`,
  `docs-marca-heredada`, `etiqueta-fuente-diferida`, `nombres-estado-retirados`, `nombres-wallet-461`,
  `rechazo-nombre-466`, `censo-order-status-rename`, `tests/unit/ayuda/`,
  `asistente/contexto-documental`, `asistente/acotamiento-por-rol` y `auth/menu-ayuda` →
  `Test Files 17 passed (17)`, `Tests 257 passed (257)`, exit 0.
- `hilo-ventana-alcanzable`, `novedad-acciones-una-tabla`, `wallet-barra-unica-467`, `wallet-sin-uuid`,
  `asistente-panel-hermano` y `asistente/citas` → `Test Files 6 passed (6)`, `Tests 79 passed (79)`, exit 0.
- No se corrió typecheck ni lint: el cambio no toca código.

**Veredicto:** T1b está hecha. La ayuda atribuye la gestión de la geografía a Servi Logistic y las
guardias de ayuda están en verde (23 archivos y 336 tests).

## Tanda 2 — T2. Tipos, contratos y servicio del comando de arranque (R12–R16) — 2026-10-22

**Archivos creados** (todos en LF, como sus vecinos de `lib/` y `tests/unit/services/`)
- `lib/types/arranque-superadmin.ts`:
  - `VARIABLES_ARRANQUE_SUPERADMIN`, las seis de R12, y `arranqueSuperadminEnvSchema`. El schema
    pasa de `process.env` a `ArranqueSuperadminInput`. El email solo se recorta; la contraseña usa
    `strongPasswordSchema` y no se recorta.
  - `ArranqueSuperadminResultado`, con los cinco desenlaces del design y sus nombres exactos.
  - `codigoSalidaArranqueSuperadmin` y `mensajeArranqueSuperadmin`, puros, para que el script de T8
    solo imprima. Los mensajes son fijos.
- `lib/interfaces/services/IArranqueSuperadminService.ts`: `arrancar(entorno)`.
- `lib/interfaces/repositories/IArranqueSuperadminRepository.ts`:
  - `crearSiNoExiste(CrearSuperadminData)` → `CrearSuperadminResultado`, que es el desenlace sin
    `entrada_invalida`;
  - sin tipos de Prisma, y el rol lo resuelve la implementación.
- `lib/services/ArranqueSuperadminService.ts`:
  - valida; ante una variable ausente (`invalid_type`), la regla pasa a ser `REGLA_OBLIGATORIA`;
  - hashea con `hashPassword` (`lib/utils/password.ts`, `bcryptjs`) antes del repositorio;
  - reconstruye el desenlace del repositorio campo a campo.
  - No importa `@prisma/client` ni `RolValue`.
- `tests/unit/services/arranque-superadmin-service.test.ts`: 34 tests con un repositorio doble y valores
  ficticios (`example.test`).

No se tocan `db/`, `package.json`, `.env.example`, el README ni el script: todo eso es de T8.

**R → test** (todos en `arranque-superadmin-service.test.ts`)
- R12 → «sin ninguna variable nombra las seis, sin valor por defecto», «sin %s responde
  entrada_invalida…» (x6) y «el repositorio recibe los datos recortados…».
- R13:
  - «sin %s…» (x6) y «%s invalida responde entrada_invalida con su nombre y su regla, sin su valor» (x6);
  - «una contrasena debil se rechaza con todas las reglas que incumple de strongPasswordSchema», con un
    ancla literal de las cuatro reglas;
  - «…justo en el minimo se acepta»;
  - «mensajes y codigo de salida» (x9).
- R14 → «propaga ya_existe tal cual» y «ya_existe termina con codigo 0».
- R15 → «propaga conflicto (email / documento)» y su código 1.
- R16:
  - «el repositorio recibe un hash bcrypt… y nunca la contrasena en claro» (`bcrypt.compare`);
  - «si el repositorio devuelve datos de mas, no llegan al desenlace»;
  - `expectSinValoresSensibles(salida(...))` sobre `JSON.stringify` del resultado y su mensaje,
    con contraseña, email y documento, en todos los desenlaces.
- `catalogo_incompleto` (rol / tipo_identificacion) → «propaga catalogo_incompleto…» y «…pide correr pnpm db:seed».

**Salida**
- `pnpm exec vitest related --run <los 5 archivos>`: `Test Files 1 passed (1)`, `Tests 34 passed (34)`, exit 0.
- `pnpm run typecheck` (`tsc --noEmit`): exit 0.
- `pnpm exec eslint <los 5 archivos>`: exit 0, sin salida. La primera corrida dio 1 warning
  `no-unused-vars` en el doble; se corrigió con `vi.fn<IArranqueSuperadminRepository["crearSiNoExiste"]>`.

**Mutaciones**, una por una sobre `ArranqueSuperadminService.ts`. Cada una se revirtió con la copia
previa y `cmp` confirmó que el archivo quedó idéntico.
- (a) El valor recibido entra en la regla (`… (recibido: ${entorno[nombre]})`):
  - `Tests 13 failed | 21 passed (34)`;
  - fallan las 6 de ausente, las 6 de inválida y la de contraseña débil.
- (a2) El servicio deja la regla intacta y añade un campo `recibido` con los valores del entorno.
  Sirve para aislar la aserción `not.toContain`:
  - `Tests 13 failed | 21 passed (34)`;
  - 6 fallan por `not to contain 'Ficticia#2026x'` o `'superadmin-ficticio@example.test'`, y 7 por `toEqual`.
- (b) La contraseña en claro va como `passwordHash`: `Tests 1 failed | 33 passed (34)`, por
  `expected 'Ficticia#2026x' to match /^\$2[aby]\$\d{2}\$/`.
- (b2) Se pasa al repositorio el hash y además `password`: `Tests 2 failed | 32 passed (34)`, por
  `not to contain 'Ficticia#2026x'` y el test de claves.
- (b3) Se hashea otra cadena: `Tests 1 failed | 33 passed (34)`, por `bcrypt.compare` → `expected false to be true`.
- (c) Se devuelve el resultado del repositorio sin traducirlo: `Tests 1 failed | 33 passed (34)`,
  en «si el repositorio devuelve datos de mas…».
- Tras revertir: `Tests 34 passed (34)`.

**Decisiones ante lo ambiguo**
- Un `SUPERADMIN_TIPO_DOCUMENTO` que no está en el catálogo sale como
  `catalogo_incompleto { falta: "tipo_identificacion" }` y no como `entrada_invalida`. Así lo dicen
  el design (flujo del repositorio, paso 3) y la nota de la tabla de Entrada. El servicio solo
  exige que no esté vacío.
- `entrada_invalida.variables` lleva una entrada por cada regla incumplida, deduplicada. Una
  contraseña débil lista todas las reglas de `strongPasswordSchema` que no cumple, no solo la primera.
- Los mensajes y el código de salida viven en `lib/types/arranque-superadmin.ts` y no en el script,
  para que T2 pruebe ya que no filtran valores. El script de T8 los importa.

**Fuera de alcance:** las guardias (`pnpm run test:guardias`) y `./init.sh` no se corrieron, porque el
leader pidió solo los tres comandos de arriba. Tampoco son míos los cambios en `docs/ayuda/…`,
`specs/…/tasks.md` ni la sección T1b de este archivo.

**Veredicto:** T2 está hecha. R12–R16 tienen test en verde, y las mutaciones (a) y (b) los ponen en rojo.

## Gate de las tandas 1 (T1b) y 2 — 2026-10-22

`scripts/test-rapido.mjs` selecciona por `git diff dev...HEAD`, así que no ve lo que no está
commiteado. El primer gate de la tanda 2 (`_trabajo/init-SL-32-t2.log`) corrió antes del commit y no
incluyó el test nuevo (`Tests 314 passed (314)` en la selección). Se repitió tras los commits
`7f2eaee` (T1b) y `df9fdbd` (T2), en `_trabajo/init-SL-32-t2b.log`:

- tests relacionados con el diff: `Test Files 24 passed (24)`, `Tests 348 passed (348)`, con los 34 de
  `arranque-superadmin-service.test.ts`;
- suite rápida: `Tests 1 failed | 3992 passed | 20 skipped (4013)`, `INIT_EXIT=1`;
- el único rojo es el ajeno de la tanda 1, `test-citado-desaparecido.guardia.test.ts > ninguna
  excepción temporal sobrevive a su motivo`, por las dos excepciones de `specs/461-…` que perdieron
  su historia al aplanar en `86d70bf`. No está en `tests/baseline-rojos.json` y no lo toca SL-32.
  Lo decide el leader.

## Cambios de alcance aplicados al spec (2026-10-22)

- `e7ad16c`: toda la gestión de geografía pasa al superadmin. `listarArbol` sigue abierto al `maestro`,
  porque Tarifas lo usa (R25). Se añade T1b, la ayuda en la tanda 1.
- Commit siguiente: T0 espera a SL-17, no a SL-28. El superadmin va con `organizacion_id = NULL`, el
  índice de R27 es global, y queda ABIERTO para T0 quién impide `NULL` a un usuario de empresa
  (`design.md > Multi-empresa`).

## T19 — recuperar contraseña reactivada (R38), frontend_dev — 2026-10-22

**Archivos:** modificados `app/recuperar-contrasena/page.tsx` (monta `RecuperarContrasenaForm`, subtítulo «Recupera el acceso a tu cuenta de forma segura»), `app/login/_components/LoginForm.tsx` (enlace `/recuperar-contrasena` repuesto; párrafo «Pídele a un administrador…» y comentarios de desactivación borrados), `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx` (fuera la cabecera de desactivación y su `@sin-superficie`, que la guardia R-B exige quitar al recuperar superficie), `tests/integration/login-form-reset-link.test.tsx`, `tests/integration/recuperar-contrasena-page.test.tsx`, `tests/components/LoginForm.test.tsx` (borrado el bloque de la feature 373, que exigía el párrafo). Borrados: `app/recuperar-contrasena/_components/RecuperacionDesactivadaAviso.tsx` y `tests/components/RecuperacionDesactivadaAviso.test.tsx` (nadie más lo montaba).

**R38 → test:** `tests/integration/recuperar-contrasena-page.test.tsx > sin cookie de sesion monta el formulario de recuperacion (R38)` y `tests/integration/login-form-reset-link.test.tsx > muestra un enlace hacia la ruta de reset en la fase de credenciales`.

**Salida:** `vitest related` sobre page, LoginForm y los dos tests: `Test Files  5 passed (5)`, `Tests  46 passed (46)`. Lint sin errores. Typecheck: 1 error ajeno en `tests/unit/services/empresas-plataforma-service.test.ts` (otro agente). Mutación (formulario sustituido por texto en la página y `href` del enlace cambiado a `/login`): `Tests  3 failed | 3 passed (6)`; revertida, `Tests  6 passed (6)`.

**Pendiente fuera de mi alcance:** `lib/actions/password-reset.ts:63` conserva `@sin-superficie` en `solicitarRecuperacion`, y por eso `superficie-de-uso.guardia > R-A > ninguna anotación @sin-superficie de acción sobrevive a su motivo` queda en ROJO hasta que se borre.

**Veredicto:** T19 hecha en UI; falta quitar la anotación en `lib/`.

## T14a — servicio del listado de empresas, sin Prisma (R29, R35), backend_dev — 2026-10-22

**Archivos creados:** `lib/types/empresas-plataforma.ts`, `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts`, `lib/interfaces/services/IEmpresasPlataformaService.ts`, `lib/services/EmpresasPlataformaService.ts`, `tests/unit/services/empresas-plataforma-service.test.ts`.

- El actor se tipa `{ rol: string } | null`: `RolValue` aun no tiene `superadmin` (T3). El predicado llega por constructor; T14b lo cablea a `esPlataforma`.
- Los roles de empresa del test salen de `Object.values(RolValue)` (sin `superadmin`), y un caso fija que son los seis conocidos.

| Requisito | Test |
|---|---|
| R35 | `empresas-plataforma-service.test.ts > acceso (R35)`: cada rol de empresa y actor nulo dan `forbidden` sin llamar al repositorio; dos casos prueban que manda el predicado inyectado |
| R29 | `empresas-plataforma-service.test.ts > listado (R29)`: el actor de plataforma recibe exactamente lo del doble, y `[]` sin empresas. El SQL lo prueba T14b contra la base |

**Mutaciones** (revertidas, sin diff):
1. `if (!actor && false)`: `Tests  8 failed | 4 passed (12)`.
2. Literal `actor.rol !== "superadmin"` en vez del predicado: `Tests  2 failed | 10 passed (12)`.
Tras revertir: `Tests  12 passed (12)`.

## T19 — parte de servidor: la degradacion del correo tiene test (R38), backend_dev — 2026-10-22

**Archivo creado:** `tests/unit/actions/password-reset-degrada-a-consola.test.ts`. No hay codigo nuevo.

- La action real `solicitarRecuperacion`, construida por su composition root (sin `deps.service`), termina en `ConsoleEmailSender.enviar` sin SMTP y devuelve `ok`. Prisma, `UserRepository`, `EmailOtpChallengeRepository` y `nodemailer` son dobles.
- Con `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587` y credenciales falsas: `crearEmailSender()` da `NodemailerEmailSender` sin llamar a `createTransport`, y `loadEmailConfig()` da host de Brevo, 587 y `secure: false`.
- **Mutacion:** `return true || emailSmtpConfigurado()` en `crearEmailSender`: `Tests  2 failed | 2 passed (4)`. Revertida: `Tests  4 passed (4)`.
- **Abierto (sin tocar codigo):** los comentarios de `lib/config/email.ts` dicen que el canal es Gmail (`DEFAULT_SMTP_HOST = "smtp.gmail.com"`, "contrasena de aplicacion de Google", que Google reescribe el From). Contradicen Brevo. Tambien `design.md > Dependencias operativas` habla de la contrasena de aplicacion de Google, y los `@sin-superficie` de `lib/actions/password-reset.ts` hablan del 535 de Gmail.

**Cierre:** `pnpm run typecheck` TC_EXIT=0. `eslint` de los 6 archivos: `No issues found`. `vitest related --run` de los 6: `Test Files  2 passed (2)` / `Tests  16 passed (16)`.

**Veredicto:** T14a y la parte de servidor de T19 en verde, con mutaciones que las ponen en rojo. Sin commitear.

## T13 — `EmpresasModule` (R29–R34, R37), frontend_dev — 2026-10-22

- Creados: `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` (cliente; tipos
  provisionales `AltaEmpresaEntrada`/`AltaEmpresaRespuesta` de §7.7 de SL-17, T15 los cambia por
  el import de `lib/types/organizacion.ts`) y `tests/components/empresas-module.test.tsx`.
- R29 → «pinta una fila por empresa…», «sin empresas pinta el estado vacío…».
  R30 → «llama a la action una vez con la forma del contrato…». R31 → «conflicto de slug…»,
  «"ya existe" se trata como slug repetido…». R32 → «conflicto de email…». R33 → «conflicto de
  documento…». R34 → `it.each` «invalida con campo…» (9), «…muestra el error genérico» (3), «una
  excepción muestra el genérico sin su detalle». R37 → «tras el éxito avisa del primer acceso…».
- `vitest run tests/components/empresas-module.test.tsx`: `Test Files 1 passed (1)`,
  `Tests 21 passed (21)`. `pnpm run typecheck` verde. `eslint` de los dos archivos: sin issues.
- Mutación: `conflicto` slug → `campo: "email"` en `desenlaceDe`: `× R31: conflicto de slug pinta
  el error junto a «Slug» y conserva lo escrito`, `Tests 1 failed | 20 passed (21)`. Revertido
  (`cmp` idéntico) y de nuevo `21 passed`.
- Veredicto: T13 hecha, sin commitear.

## Tanda 2b (T12, T13, T14a) y T19 — consolidado del implementer — 2026-10-22

**Decisiones del leader aplicadas**
- P8 y P9: el correo sale por SMTP de Brevo (`smtp-relay.brevo.com`, 587, con las variables de `lib/config/email.ts`), y Carlos lo pone en Vercel. No hay código nuevo de proveedor.
- P7: diferida a SL-26, en `progress/deudas.md > D15`. No se resuelve aquí.
- P10: leído en el spec de SL-17 (`11f7007`, §7.7). `altaEmpresaAction(input)` está en `lib/actions/organizaciones.ts`, y sus desenlaces son `creada | ya_existe | conflicto{campo: slug|email|documento} | invalida{campo}`. Al maestro se le guarda un hash de 32 bytes aleatorios que se descartan. SL-17 no trae listado, así que T14a se queda. Se confirma en T0.

**T12.** La propuesta está en `specs/SL-32-rol-superadmin/design.md > Diseño visual > Propuesta de T12`. Falta el OK de Carlos.

**Archivos de la tanda**
- Creados:
  - `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`, con `@sin-superficie` hasta que T15 monte la página;
  - `lib/types/empresas-plataforma.ts`;
  - `lib/interfaces/services/IEmpresasPlataformaService.ts`;
  - `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts`;
  - `lib/services/EmpresasPlataformaService.ts`;
  - `tests/components/empresas-module.test.tsx`;
  - `tests/unit/services/empresas-plataforma-service.test.ts`;
  - `tests/unit/actions/password-reset-degrada-a-consola.test.ts`.
- Modificados:
  - `app/recuperar-contrasena/page.tsx`;
  - `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`;
  - `app/login/_components/LoginForm.tsx`;
  - `lib/actions/password-reset.ts`: salen los tres `@sin-superficie`, y la guardia `superficie-de-uso > R-A` lo exigía;
  - `tests/components/LoginForm.test.tsx`;
  - `tests/integration/login-form-reset-link.test.tsx`;
  - `tests/integration/recuperar-contrasena-page.test.tsx`;
  - `progress/deudas.md` (D10, renumerada a D15 al integrar SL-17);
  - `specs/SL-32-rol-superadmin/{requirements,design,tasks}.md`.
- Borrados: `app/recuperar-contrasena/_components/RecuperacionDesactivadaAviso.tsx` y `tests/components/RecuperacionDesactivadaAviso.test.tsx`.

**R → test (esta tanda)**
| R | Test |
|---|---|
| R29–R34, R37 | `tests/components/empresas-module.test.tsx` (21 tests) |
| R29, R35 (servicio) | `tests/unit/services/empresas-plataforma-service.test.ts` (12 tests) |
| R38 | `tests/integration/login-form-reset-link.test.tsx`, `tests/integration/recuperar-contrasena-page.test.tsx` y `tests/unit/actions/password-reset-degrada-a-consola.test.ts` (degradación a consola y configuración de Brevo) |

**Mutaciones**, todas revertidas:
- R31: el error de slug pintado en el campo email da `1 failed | 20 passed`.
- T14a: sin la comprobación de rol, `8 failed | 4 passed`. Con un literal en vez del predicado inyectado, `2 failed`.
- T19: la página monta el aviso y el `href` va a `/login`: `3 failed | 3 passed`.
- Degradación: `crearEmailSender` devuelve siempre nodemailer: `2 failed | 2 passed`.

**Gate** (`TEST_RAPIDO_BASE=dev ./init.sh`, log en el scratchpad de la sesión, `init-SL-32-t2b-t19-b.log`):
- typecheck y lint pasan, y los tests relacionados dan `Test Files 24 passed (24)` y `Tests 348 passed (348)`;
- las guardias dan `Tests 1 failed | 3992 passed | 20 skipped (4013)` e `INIT_EXIT=1`.

El único rojo es `tests/unit/guards/test-citado-desaparecido.guardia.test.ts > ninguna excepción temporal sobrevive a su motivo (D4 de SL-13)`. Ya estaba en rojo en la tanda 1, con el mismo mensaje (historia aplanada en `86d70bf`). No es del diff, y tampoco está en `tests/baseline-rojos.json`.

En la primera corrida hubo además dos rojos de `catalogo-postgres-acota-esquema` con `ENOENT` sobre el aviso borrado: el borrado no estaba en el índice. Con `git add` desaparecieron.

**Pendiente fuera del código:** el OK de Carlos a la pantalla (T12) y un correo de OTP real en cada entorno tras configurar Brevo (T19).

## T3 — enum, migraciones, índice de un solo superadmin y regla de empresa (R1, R2, R21, R27, R28), backend_dev — 2026-10-23

**`<UUID_ROL_SUPERADMIN>` = `e070603f-a477-466f-8bc1-92fcfaceb6f4`**. Se generó una sola vez. Va en las dos
migraciones que lo necesitan, y como literal de contrato en `seed-catalogos.test.ts`.

**Archivos**
- `db/schema.prisma`: `superadmin` entra en `RolValue`, sin `@map`.
- `db/migrations/20261023100000_rol_superadmin/{migration,down}.sql`: `ADD VALUE IF NOT EXISTS`. El `down.sql`
  recrea el tipo con los seis valores de antes y **busca en `pg_attribute` todas las columnas de `rol_value`**.
  Desde `rol_api_key`, el tipo lo usan otras columnas además de `rol.value`: `actor_rol`, `rol_autor`,
  `destinatario_rol`, `whatsapp_envio.rol`… El `down.sql` de `20260716140000_rol_api_key` solo altera
  `rol.value`, así que copiado tal cual fallaría en el `DROP TYPE`.
- `db/migrations/20261023100100_seed_rol_superadmin/{migration,down}.sql`. La subida hace tres cosas: el
  `INSERT ... ON CONFLICT ("value") DO NOTHING` con el id fijo, un `DO $$` que aborta si la fila existe con otro
  id, y el índice `usuario_un_solo_superadmin ON usuario ((true)) WHERE rol_id = '<uuid>'`. El `down.sql` aborta
  si hay un usuario superadmin; si no lo hay, quita el índice y la fila.
- `db/migrations/20261023100200_usuario_empresa_o_superadmin/{migration,down}.sql`: el `CHECK` de R28 y su `DROP`.
- `tests/integration/db/_fixtures/superadmin-32.ts` (nuevo):
  - `intentar` corre la sentencia en un SAVEPOINT y devuelve el SQLSTATE **y el nombre de la restricción**;
  - `insertarUsuario` inserta por SQL a mano;
  - `liberarHuecoDeSuperadmin` borra, dentro de la transacción revertida, el superadmin que ya hubiera. Hace
    falta en una base de desarrollo donde ya corrió el comando.
- `tests/integration/db/un-solo-superadmin.test.ts` y `tests/integration/db/usuario-empresa-o-superadmin.test.ts` (nuevos).
- `tests/unit/types/roles.test.ts`: pasa de 6 a 7 roles y suma el caso «superadmin sin `@map`».
- `tests/unit/scripts/seed-catalogos.test.ts`: pasa de 6 a 7 y suma el caso «conserva el id fijo».
- `seedRoles` no cambia: ya hace upsert por `value` con `update: {}`, así que conserva el id de la migración.

**Dos desvíos del spec, por cómo quedó SL-17**
1. El caso «el `UPDATE` que pone a NULL la empresa de un `maestro` falla» ya lo para el trigger
   `usuario_sin_cambio_de_empresa` de SL-17 (SL017), antes de llegar al `CHECK`. El caso apaga el trigger
   dentro de la transacción revertida para ver el `CHECK` solo. Con el trigger puesto, pasaría aunque el
   `CHECK` no existiera.
2. El caso «un `UPDATE` del `rol_id` de otro usuario al de superadmin falla por el índice» no puede ver el
   índice con R28 puesto: un no superadmin siempre tiene empresa, así que el `CHECK` lo para antes. El caso de
   R27 suelta el `CHECK` dentro de su transacción revertida para ver el índice solo. El de R28 tiene su caso
   propio: pasar a superadmin a un maestro con empresa da 23514.

**R → test**
- R1, R2 → `roles.test.ts` (7 miembros y `superadmin` sin `@map`) y `seed-catalogos.test.ts` (7 filas y el id fijo conservado).
- R21 → la verificación de abajo, sobre `sl32_mig`.
- R27 → `un-solo-superadmin.test.ts`. El primero se inserta bien. El segundo `INSERT` da 23505 por el índice,
  y el `UPDATE`, también.
- R28 → `usuario-empresa-o-superadmin.test.ts`. Dan 23514 por `usuario_empresa_o_superadmin`:
  - un superadmin con empresa, explícita o por DEFAULT;
  - un maestro con NULL;
  - el `UPDATE` que pone la empresa a NULL, con el trigger apagado;
  - el `UPDATE` que pasa un maestro a superadmin.

  Pasan un superadmin con NULL y un maestro con su empresa.

**Verificación de R21** (base desechable `sl32_mig`, creada y borrada al terminar)
- `migrate deploy` → 236 migraciones y «All migrations have been successfully applied».
- Drift: `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
- Con un superadmin insertado a mano:
  - el rollback de la 3.ª va bien;
  - el de la 2.ª sale con **exit 1** y el mensaje `ERROR: hay un usuario superadmin; retiralo antes de revertir 20261023100100_seed_rol_superadmin`;
  - el usuario, el índice y la fila de `_prisma_migrations` siguen en su sitio.
- Sin el superadmin:
  - el rollback de la 2.ª va bien y deja 0 índices y 0 filas `superadmin`;
  - el de la 1.ª va bien: el enum queda en `maestro,admin,mensajero,Admin Tienda,adminSatelite,apiKey` y no queda `rol_value_old`;
  - `migrate deploy` vuelve a ir bien, con el drift vacío.
- Pasada limpia: tres `db:rollback`, todos con exit 0, y luego `migrate deploy` → «Database schema is up to date!».
- Comprobado aparte: si la fila `superadmin` existe con otro id, el bloque `DO` aborta con
  `P0001 rol superadmin existe con otro id`.
- **Hallazgo:** `scripts/db-rollback.ts` revierte la **última carpeta en disco**, no la última aplicada. Si se
  llama dos veces seguidas, vuelve a correr el mismo `down.sql`. Para revertir las tres, cada carpeta ya
  revertida se apartó al scratchpad y al final se devolvió a su sitio. El script no se tocó: queda fuera de T3.
- `sl32_base` queda migrada con las tres. `migrate status` dice «up to date», y la fila del rol tiene el id fijo.

**Mutaciones.** Cada una se aplicó sobre `sl32_mig` recreada, y el archivo se restauró y se comprobó con `cmp` o `git diff`.
- Sin el `CREATE UNIQUE INDEX` en `20261023100100.../migration.sql`, `un-solo-superadmin` da `2 failed | 1 passed`:
  caen el segundo INSERT y el UPDATE.
- Sin el `ADD CONSTRAINT` en `20261023100200.../migration.sql`, `usuario-empresa-o-superadmin` da `5 failed | 1 passed`.
- Con `seedRoles` en `update: { value }`, `seed-catalogos` da `1 failed | 6 passed`.
- Con `superadmin` fuera del enum, `roles` da `2 failed | 11 passed`.

**Salida**
- `vitest run` de `un-solo-superadmin` y `usuario-empresa-o-superadmin`, sobre `sl32_base` → `Tests 9 passed (9)`.
- `vitest run` de `roles.test.ts` y `seed-catalogos.test.ts` → `Tests 20 passed (20)`.
- 47 archivos sobre `sl32_base` → `Test Files 47 passed`, `Tests 619 passed`. Son las guardias y los tests que
  leen `db/migrations` o `schema.prisma`, más `schema-drift-saneamiento`, `provincia-schema-drift` y
  `migracion-sl17-ida-y-vuelta`.
- `pnpm exec eslint` sobre los 5 archivos de test → exit 0.
- `pnpm run typecheck`, con el cliente regenerado dentro del lock → **exit 2, con 7 errores**. Todos son de
  exhaustividad de `Record<RolValue, …>` y son trabajo de T4:
  - `lib/auth/rol-label.ts`;
  - `lib/asistente/instrucciones.ts`;
  - `tests/integration/db/_whatsapp-envios-474.ts`;
  - `tests/integration/db/push-destinatarios-equivalencia.test.ts`;
  - `tests/unit/actions/organizaciones-action.test.ts` (`satisfies Record<RolValue, true>`);
  - la cadena `lib/services/WhatsappEnvioService.ts:316` → `EnvioForm.tsx:139`.

**Suite de integración que inserta en `usuario`.** Son 221 archivos, buscados por grep de inserts y de sus
fixtures, corridos contra `sl32_base`: `81 failed | 529 passed | 925 skipped`.
- Casi todos los rojos vienen de la base vacía («tabla `orden` vacía», «falta la zona»…), no de este cambio.
  Esos archivos no llegan a insertar usuarios, así que el barrido no los cubre.
- `orden-traspaso-migration` y `vista-filtro-migration` también salen en rojo, pero ya están en `tests/baseline-rojos.json`.
- Los rojos por `usuario_empresa_o_superadmin` son **dos suites de SL-17**. **No las arreglo: el arreglo es ambiguo.**
  - `tests/integration/db/aislamiento-fk-misma-empresa.test.ts:157-158`: el `beforeAll` crea y **commitea**
    un «superadmin» con rol `maestro` y empresa NULL. Cae el archivo entero (10 skipped).
  - `tests/integration/db/aislamiento-usuarios.test.ts:119-120` (`beforeAll`) y `:292-299` (R35): crean **dos**
    usuarios sin empresa con rol `maestro`, commiteados mientras dura el archivo. Cae el archivo entero (13 skipped).
- Poner el rol real no basta, porque el índice de R27 es global. Chocarían con 23505 dos superadmins
  commiteados: los dos de `aislamiento-usuarios`, uno de cada archivo si corren en paralelo, o uno real que el
  comando ya creó en una base de desarrollo. Antes hay que decidir cómo comparten los tests el único
  superadmin: reutilizar el que exista, o crearlo solo en transacciones revertidas y serializadas.
  `arranque-superadmin.test.ts` (T5) necesitará lo mismo. Decide el leader.

**Veredicto:** T3 está hecha. Su «Hecho cuando» se cumple, y R27 y R28 tienen tests que caen con su mutación.
Quedan abiertos el typecheck rojo, que es de T4, y dos suites de SL-17 que hay que pasar al superadmin real,
con decisión del leader.

## T4, T5, T6, T7 y tarea A — fuente única, guardia, usuarios y el superadmin compartido en los tests (R3–R11, R27, R28), backend_dev — 2026-10-23

**Archivos nuevos**
- `lib/auth/plataforma.ts`: `ROLES_PLATAFORMA = ["superadmin"]`, `RolPlataforma` y `esPlataforma`.
- `tests/unit/auth/plataforma.test.ts`, `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`,
  `tests/unit/services/usuario-service-superadmin.test.ts`, `tests/integration/db/usuarios-sin-superadmin.test.ts`,
  `tests/unit/types/envios-whatsapp-rol-seleccion.test.ts`.

**Código modificado**
- T4:
  - `lib/auth/rol-label.ts`: «Superadmin».
  - `lib/asistente/instrucciones.ts`: la frase de `QUIEN_PREGUNTA`.
  - `lib/analytics/alcance.ts`: `ROLES_SIN_ANALITICA = declararRolesNoLectores(ROLES_PLATAFORMA)`. Lee la constante
    por import, sin el literal que proponía el design. Un literal menos en la lista de tablas exhaustivas.
  - `lib/types/envios-whatsapp.ts`: `esRolDeSeleccion` y `RolDeSeleccion`, derivados de `rolSchema`.
  - `lib/services/WhatsappEnvioService.ts` (`aInput`) y `EnvioForm.tsx:149`: filtran con `esRolDeSeleccion`. Un
    envío es de una empresa, así que el superadmin ni recibe ni se ofrece. En `EnvioForm`, el cambio es una línea y
    un import.
- **Adelantado de T15:** `lib/auth/exigir-superadmin.ts` pasa a `actor !== null && esPlataforma(actor.rol)`. La
  guardia de `organizaciones-action.test.ts` se ponía en rojo en cuanto existiera `plataforma.ts`.
- T5 (R7), fuera de los archivos esperados: `lib/analytics/productos-consulta.ts` y `lib/analytics/entregas-conteo.ts`
  consultan `ROLES_SIN_ANALITICA` antes de `esRolAnalitica`. Sin eso, el superadmin salía con `rol_desconocido`, y
  R7 pide `rol_sin_analitica` en toda la analítica.
- T7:
  - `lib/services/UsuarioService.ts`:
    - `listarRoles` filtra los roles de plataforma (R8).
    - `crear` y `actualizar` rechazan un `rolId` de plataforma con `validation_error` en `rolId`, antes del hash (R9).
    - `obtener`, `actualizar`, `cambiarEstado`, `restablecerContrasena` y `consultarImpactoCambio` responden
      `not_found` si el objetivo es de plataforma, antes de escribir (R11). `cambiarEstado` ahora lee el objetivo.
    - El rol se resuelve por valor con `listRoles`, en `esRolDePlataforma`.
  - `lib/repositories/UserRepository.ts` (`list`): `rol.value.notIn ROLES_PLATAFORMA`, sumado al `in` del filtro
    (R10). La página y el conteo usan el mismo `where`.
  - `lib/types/usuario.ts`: `ROLES_FILTRO` es `ROL_LABELS` menos plataforma.

**Tests modificados**
- `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts`: de 6 a 7, `ROLES_SIN_ANALITICA` = `["superadmin"]`, y
  ahora se comprueba que se lee de `ROLES_PLATAFORMA`.
- T4:
  - `tests/integration/db/push-destinatarios-equivalencia.test.ts` y `_whatsapp-envios-474.ts`: el séptimo rol en el `Record`.
  - `tests/unit/actions/organizaciones-action.test.ts`:
    - la tabla `satisfies Record<RolValue, boolean>` dice qué rol da de alta;
    - los seis de empresa reciben `no_autorizado`;
    - caso nuevo: el superadmin llama al servicio una vez;
    - salen los dos casos que solo valían sin `plataforma.ts`.
- T5:
  - `productos-alcance.test.ts` y `conteo-productos-action.test.ts`: el rol inventado pasa a `rolInventado`. Casos
    reales nuevos: el superadmin da `rol_sin_analitica` en `resolverAlcanceProductos` y en `resolverAlcance`, para
    las 25 métricas y los dos canales. En la action da `forbidden` con ese motivo en el log.
  - `conteo-entregas-contrato.test.ts`: el superadmin da `rol_sin_analitica`.
  - `tope-diario.test.ts` (AsistenteService): el superadmin da `rol_no_admitido`, sin proveedor y sin contador.
  - `alcance.test.ts` y `alcance-api-key.test.ts`: de 6 a 7.
  - `analytics/types.test.ts`: quedan fuera `apiKey` y `superadmin`.
  - `alcance-borrado-orden.test.ts`: el superadmin entra en `denegado`. La tabla literal se actualiza, sin relajarla.
- T7:
  - `usuario-restablecer-contrasena.test.ts`: el doble devuelve `listRoles` con `[]`.
  - `usuario-schema.test.ts:240`: «acepta todas las claves» pasa a recorrer `ROL_LABELS` menos plataforma. Era
    inevitable con `ROLES_FILTRO`. Las líneas 253 y `usuarios.test.ts:333` no cambian y siguen en verde.
- Tarea A:
  - `tests/integration/db/_fixtures/superadmin-32.ts`: `CLAVE_LOCK_SUPERADMIN = 32_1023_01`, `tomarLockDeSuperadmin()`
    (lock de sesión en una conexión propia) y `exigirSinSuperadmin()`. Están documentados el uso y el orden de locks:
    primero este y por dentro el de la 227. T8 lo usará.
  - `aislamiento-fk-misma-empresa.test.ts`: el usuario sin empresa es `superadmin`; toma el lock y exige una base sin
    superadmin.
  - `aislamiento-usuarios.test.ts`:
    - el superadmin lleva rol `superadmin`, con `organizacionId: null` explícito;
    - lock y `exigirSinSuperadmin`;
    - el caso R35 «con `null` explícito» borra antes el superadmin del `beforeAll`, bajo el lock de la 227, y crea
      el suyo por el mismo camino, que pasa a ser el del archivo. Ninguna aserción se debilita.
  - `un-solo-superadmin.test.ts` y `usuario-empresa-o-superadmin.test.ts`: toman el lock en `beforeAll`.
  - `usuarios-filtro-busqueda.test.ts`: `base.total` cuenta solo usuarios de empresa. El listado ya no cuenta al
    superadmin, y otro archivo puede tenerlo commiteado mientras este corre.
  - Grep de `organizacionId: null` y `fijarEmpresa(tx, "")`: no hay más usuarios sin empresa en tests de integración.

**R → test**
- R3, R5:
  - `superadmin-fuera-de-empresa.guardia.test.ts` (a), sobre las listas de empresa y el menú;
  - `plataforma.test.ts` (`esAccesoTotal(superadmin)` es `false`);
  - `envios-whatsapp-rol-seleccion.test.ts`;
  - `alcance-borrado-orden.test.ts`.
- R4: `plataforma.test.ts` y la guardia: (b) son las constantes `*ROLES*` y sus excepciones, y (c) es el literal.
- R7:
  - `productos-alcance.test.ts`, `conteo-productos-action.test.ts` y `conteo-entregas-contrato.test.ts`;
  - `alcance-fuente-unica.guardia.test.ts`, `alcance.test.ts` y `tope-diario.test.ts`.
- R8, R9, R11: `usuario-service-superadmin.test.ts`, con un caso por operación, cero escrituras y su control.
- R10:
  - `usuarios-sin-superadmin.test.ts`, contra Postgres:
    - con el sufijo, sin filtros, con el filtro por rol (también pidiendo `superadmin` al repositorio);
    - `listar` y `listarCompleto`;
  - `usuario-schema.test.ts:253` y `usuarios.test.ts:333`.
- R27, R28: los tests de T3, ahora serializados entre archivos.

**Guardia de T6: excepciones declaradas.**
- `ROLES_PLATAFORMA` es la fuente.
- `ROLES_SIN_ANALITICA` es una lista de denegación.
- `GESTION_ROLES` y `READ_ROLES` de `GeografiaService` quedan preparados para T11. Hoy no nombran la plataforma, y
  la guardia pasa. Cuando T11 los escriba:
  - tienen que importar `ROLES_PLATAFORMA`, sin el literal;
  - `GESTION_ROLES` no puede llevar ningún otro rol, y devolverle el `maestro` la pone en rojo. Lo prueba la
    contraprueba sintética.
- El ítem `/plataforma/empresas` (T16) tiene que tener `roles === ROLES_PLATAFORMA`, por identidad. No toqué
  `SIDEBAR_ITEMS` ni `Sidebar.tsx`.

**Mutaciones.** Cada una se aplicó, se corrió y se restauró. `cmp` contra la copia: idéntico.
- T7 (contra `sl32_base`): quitar `notIn` del `where` → `usuarios-sin-superadmin`: `4 failed | 1 passed`. Sigue en
  verde «los datos están».
- T6:
  - `RolValue.superadmin` en `ROLES_ACCESO_TOTAL` → guardia más `plataforma.test`: `4 failed | 13 passed`;
  - `"superadmin"` en el `roles` del ítem de mensajero → guardia: `2 failed | 11 passed`;
  - `"superadmin"` en `ROLES_AYUDA` → `tope-diario` más la guardia: `5 failed | 23 passed`.
- T4: `esPlataforma` que acepta `maestro` → `plataforma.test`: `1 failed | 3 passed`.
- T5:
  - `ROLES_SIN_ANALITICA` vacía → los cuatro tests de analítica: `7 failed | 112 passed`;
  - sin la rama nueva en `productos-consulta.ts` → `2 failed | 41 passed`;
  - en `entregas-conteo.ts` → `1 failed | 62 passed`.
- Adelantado de T15: `exigirSuperadmin` que vuelve a `false` → `organizaciones-action`: `1 failed | 12 passed`.
- T7, en el servicio (`usuario-service-superadmin`). Se quitó cada comprobación por separado, y en todas da
  `1 failed | 9 passed`:
  - R9: en `crear`, y en `actualizar` (del `rolId`);
  - R11: en `obtener`, `actualizar`, `cambiarEstado`, `restablecerContrasena` y `consultarImpactoCambio`;
  - R8: el filtro de `listarRoles`.
- `ROLES_FILTRO` sin el filtro → `usuario-schema` más `usuarios`: `2 failed | 61 passed`.
- `esRolDeSeleccion` que acepta todo → `envios-whatsapp-rol-seleccion`: `2 failed`.
- Tarea A: `tomarLockDeSuperadmin` sin `pg_advisory_lock` → los cinco archivos de superadmin juntos, tres veces.
  Las tres veces: `24 passed | 13 skipped`, con `aislamiento-usuarios` en FAIL. Con el lock: 4 de 4 en verde.

**Salida real**
- `pnpm run typecheck` → exit 0, con 0 errores. Eran 7.
- `pnpm exec eslint` sobre los 38 `.ts`/`.tsx` tocados → exit 0. Queda un warning de antes:
  `conteo-productos-action.test.ts:35 _consulta`.
- Los seis archivos de superadmin y usuarios, en un solo `vitest run` sobre `sl32_base`, con workers en paralelo →
  `Test Files 6 passed (6)`, `Tests 48 passed (48)`, cuatro veces seguidas. Después, la base queda con 0 usuarios y
  0 organizaciones.
- Los 18 archivos de unit que iteran `RolValue` o tienen un `Record<RolValue>` → `Tests 333 passed`.
- Unit de servicios, analítica, tipos, usuarios y asistente → `Test Files 491 passed`, `Tests 8388 passed`.
- `vitest related` de `alcance.ts`, `rol-label.ts` e `instrucciones.ts`, el «Hecho cuando» de T5, sobre `sl32_base`
  → `9 failed | 5070 passed`. Los 7 archivos rojos son de integración y fallan por la base vacía: «tabla `orden`
  vacía», «faltan la zona central», «sin `zona` sembrada»… Todo el unit está en verde.
- `vitest related` de todos los archivos tocados → `47 failed | 6363 passed`. Revisados uno a uno, todos los rojos
  son de base vacía, salvo dos:
  - `whatsapp-envio-idempotencia-programado`: inserta `plantilla_mensaje` sin empresa y da 23502;
  - `cohorte-carga-indices`: un plan de índices.

  Ninguno de los dos toca código de esta tanda.
- `pnpm run test:guardias` → `1 failed | 300 passed`. Cae `dependencias-declaradas-presentes.guardia.test.ts`, que
  busca en `init.sh` los marcadores de la ficha 420. `init.sh` no está en este diff: el rojo es de antes.
- MCP del grafo: no lo usé; trabajé con Grep y Read.

**Veredicto:** T4, T5, T6 y T7 están hechas y marcadas. La tarea A también: el lock de superadmin serializa los
cinco archivos que lo crean, y la mutación del lock lo demuestra.

## T8 y T14b — el comando de arranque entero y el repositorio del listado (R12–R20, R27, R29, R35), backend_dev — 2026-10-23

**Archivos nuevos** (LF)
- `lib/repositories/ArranqueSuperadminRepository.ts`:
  - `crearSiNoExiste` corre en `comoPlataforma("SL-32", …)` y abre una transacción. La primera sentencia es
    `pg_advisory_xact_lock(CLAVE_LOCK_ARRANQUE_SUPERADMIN = 32_1023_00)`. Es distinta de la clave de los tests
    (`32_1023_01`): con la misma, el comando esperaría al test que lo espera a él.
  - Después, en este orden: ¿hay superadmin? → `ya_existe`; rol y tipo de documento → `catalogo_incompleto`;
    email o cédula ocupados → `conflicto`; `INSERT` con `organizacionId: null` explícito y `estado: "activo"`.
  - El rol sale de `ROLES_PLATAFORMA`, sin el literal (guardia de T6).
  - `desenlaceDeP2002` (exportada) traduce un P2002 por el nombre del índice, con `textoConstraintP2002`:
    `usuario_un_solo_superadmin` → `ya_existe`, `usuario_email_key` → `conflicto email` y
    `usuario_cedula_key` → `conflicto documento`. Cualquier otro se relanza.
- `lib/repositories/EmpresasPlataformaRepository.ts`: dentro de `comoPlataforma("SL-32", "listado de empresas
  del superadmin")`. Hace `organizacion.findMany` por `createdAt desc` (desempata el `slug`), con `usuarios`
  de rol `maestro` por `createdAt asc` (desempata el `email`). Del maestro solo se seleccionan `nombre` y `email`.
- `lib/actions/_shared/empresas-plataforma.ts`: el composition root del listado. No es Server Action (sin
  `"use server"`), así que no expone un endpoint, y la guardia de superficie no lo cuenta. **Firma para T15:**

  ```ts
  listarEmpresasPlataforma(
    actor: ActorEmpresasPlataforma | null,   // { rol: string }; el Actor de la sesión encaja
    servicio?: IEmpresasPlataformaService,   // por defecto, construirEmpresasPlataformaService()
  ): Promise<ListarEmpresasResultado>        // { status: "ok"; empresas: EmpresaListada[] } | { status: "forbidden" }

  construirEmpresasPlataformaService(prisma = getPrismaClient()): IEmpresasPlataformaService
  ```

  La página hace `const actor = await resolveActorFromSession(); if (!actor || !esPlataforma(actor.rol)) notFound();`
  y luego `const r = await listarEmpresasPlataforma(actor);`. `forbidden` no debería llegar, pero si llega se pinta
  como error. El predicado es `esPlataforma`, con un cast `rol as RolValue`: el servicio de T14a tipa el rol como
  `string`.
- `scripts/arranque-superadmin.ts`: entrypoint igual que `seed-catalogos.ts` (`loadEnvFile`, `getPrismaClient`,
  `isEntrypoint`). Exporta `ejecutarArranque(servicio, entorno, salida = console)`:
  - `creado` y `ya_existe` van a stdout; el resto, a stderr; siempre con el mensaje fijo de `mensajeArranqueSuperadmin`.
  - Ante una excepción imprime solo `error.name` y un `code` corto, nunca el mensaje.
  - Sale con `process.exitCode`, no con `exit()`.
- Tests:
  - `tests/integration/db/arranque-superadmin.test.ts` (10 casos);
  - `tests/integration/db/empresas-plataforma.test.ts` (4);
  - `tests/unit/scripts/arranque-superadmin.test.ts` (17);
  - `tests/unit/actions/empresas-plataforma.composition-root.test.ts` (8).

**Modificados**
- `lib/db/excepciones-aislamiento.ts`: dos filas de `EXCEPCIONES_DE_PLATAFORMA` con `ficha: "SL-32"`, una para
  cada repositorio.
- `lib/services/EmpresasPlataformaService.ts`: solo el comentario, que ya dice dónde está cableado `esPlataforma`.
- `package.json`: `"arranque:superadmin": "tsx scripts/arranque-superadmin.ts"`, detrás de `db:seed`. SL-17 no
  dejó scripts.
- `.env.example`: las seis `SUPERADMIN_*` vacías, con su bloque de comentario.
- `README.md > Usuarios`:
  - la frase «llega con SL-32» se cambia en un solo paso por la sección entera: cuándo se corre (a mano, una vez
    por entorno, después de `migrate deploy` y `db:seed`, fuera del build y de CI salvo el E2E), qué lee, la
    tabla de desenlaces y códigos, y cómo se cambia la contraseña;
  - «El correo, sin el cual nadie entra»: el relay de Brevo con `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
    `SMTP_PASSWORD`/`SMTP_FROM`, o `ConsoleEmailSender` sin SMTP, y `AUTH_OTP_DEBUG_LOG`.
  - No lleva ningún valor de `SUPERADMIN_*`. El host y el puerto de Brevo son los públicos que ya fija el spec (P8).
- `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (R19):
  - `SCRIPTS_QUE_CREAN_USUARIOS`, con nombre, comando exacto y ficha. `faltasDeScripts` solo deja pasar el par
    exacto.
  - Un caso exige que cada excepción esté en `package.json` con ese comando y apunte a un archivo que existe.
  - Contraprueba: el mismo nombre con otro comando, otro script con `superadmin` en el nombre y otro con
    `superadmin` en el comando dan rojo.
- `specs/SL-32-rol-superadmin/tasks.md`: T8 y T14b `[x]`, y las dos rutas nuevas en `## Archivos esperados`.

**R → test**
- R12:
  - `arranque-superadmin.test.ts > la primera ejecucion crea…`: activo, `organizacion_id` NULL, tipo `cedula`,
    hash bcrypt verificable, `zona`/`vehiculo`/`placa` NULL, `fulfillment` false;
  - el caso de R19 del guard: el script declarado existe.
- R13: `tests/unit/scripts/arranque-superadmin.test.ts`: código 1 y stderr para `entrada_invalida`; nombra
  `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` sin sus valores. Además, los tests de T2.
- R14: `… > repetida, da ya_existe y no escribe nada`. Compara la fila entera (`to_jsonb`) antes y después, con
  otra contraseña, otro nombre y otro teléfono, y cuenta los usuarios.
- R15: `… > con el email / documento ocupado…` (x2). Transacción revertida: `conflicto` con su campo, el otro
  sigue `maestro`, 0 superadmins y 0 usuarios nuevos.
- `catalogo_incompleto`: `… > sin el tipo de documento…` (cliente de la app) y `… > sin el rol superadmin…`
  (transacción revertida que aparta la fila de `rol`).
- R16: `tests/unit/scripts/arranque-superadmin.test.ts`:
  - los seis desenlaces del repositorio con el servicio real;
  - la entrada inválida;
  - un error con email, documento y contraseña en el mensaje: ninguno sale por stdout ni por stderr.
  - Además, el caso de R17 mira la salida real de los dos procesos.
- R17:
  - `… > dos ejecuciones del comando a la vez…`: **dos procesos reales** del script (`tsx`, con `DATABASE_URL`
    explícita), los dos con código 0, uno «creado» y otro «ya existe», un solo superadmin, y en la salida no
    está ni la contraseña, ni el email, ni el documento;
  - `… > el comando toma el cerrojo antes de comprobar nada…`: se sostiene la clave en otra transacción, se ve
    en `pg_locks` al comando esperándola, y al soltarla da `ya_existe`;
  - `… > si otro escritor confirma un superadmin entre las comprobaciones y el INSERT, el P2002 del indice es
    ya_existe`: un `INSERT` sin confirmar de otra sesión, el comando bloqueado en su `INSERT`
    (`pg_stat_activity`) y, al confirmar el otro, `ya_existe`. Es el P2002 **real** del driver adapter.
- R19: `fuera-datos-ordenex.guardia.test.ts`, el caso y la contraprueba de arriba.
- R20: el diff de `.env.example` (seis `NOMBRE=` vacíos, `env-example-sin-valores` en verde) y el README sin valores.
- R27: el caso del P2002 del índice y el de los dos procesos.
- R29:
  - `empresas-plataforma.test.ts`, con dos organizaciones de la fábrica de SL-17, dos maestros en A, uno en B
    y un `admin` en A:
    - las dos salen, B primero, cada una con sus maestros por alta y sin el `admin`;
    - todo el listado va por fecha descendente;
    - solo salen las claves `creadaEn,id,maestros,nombre,slug` y `email,nombre`, y ni el documento, ni el
      teléfono, ni el hash de los cuatro usuarios;
    - sin organizaciones, `[]`.
  - `empresas-plataforma.composition-root.test.ts`: el composition root lee en plataforma con la ficha SL-32.
- R35: `empresas-plataforma.composition-root.test.ts`: los seis roles de empresa y el actor nulo dan
  `forbidden` sin leer, y el superadmin recibe el listado. Es el predicado real, no uno de test.

**Cómo se resolvió «sin organizaciones devuelve []» sin depender del resto de la base.**
- El repositorio corre sobre un esquema desechable (`sl32_empresas_<aleatorio>`) con copias vacías de `rol`,
  `organizacion` y `usuario` (`LIKE … INCLUDING ALL`), por `crearPrismaDeTestEnEsquema`.
- Prisma califica el cast del enum con el esquema del cliente, así que se crea ahí `rol_value` con las etiquetas
  de `public` y se retipa `rol.value`.
- Control positivo: tras crear una organización en ese esquema, el mismo repositorio la devuelve. Así se ve que
  el cliente lee de verdad el esquema vacío.
- El DDL va bajo `bajoLockDeEscrituraReal`, y el esquema se borra en el `finally`.
- Los casos con datos filtran por sus dos organizaciones, que tienen fechas de alta en 2999.

**Locks en los tests.** `arranque-superadmin.test.ts` toma `tomarLockDeSuperadmin` en `beforeAll` y exige la
base sin superadmin con `exigirSinSuperadmin`. Todo lo que commitea en `usuario` va por dentro de
`bajoLockDeEscrituraReal`, en el orden documentado: primero el de superadmin y por dentro el de la 227. Los casos
revertidos llaman antes a `serializarEscriturasReales`. Un `afterEach` borra el superadmin del caso.
`empresas-plataforma.test.ts` no crea superadmin: solo usa el lock de la 227.

**Mutaciones**, todas contra `sl32_base` con `scratchpad/mutar.py`. Cada archivo se restauró de su copia y su
sha256 resultó idéntico al de antes en las 16.

| # | Mutación | Resultado |
|---|---|---|
| T14b | sin `where: { rol: { value: "maestro" } }` (pedida) | `empresas-plataforma`: `1 failed \| 3 passed` |
| E1 | `createdAt: "asc"` | `2 failed \| 2 passed` |
| E2 | `telefono: true` en el select del maestro | `2 failed \| 2 passed` |
| E3 | `esPlataforma(...) \|\| true` en el composition root | `composition-root`: `6 failed \| 2 passed` |
| A1 | sin `organizacionId: null` | `arranque-superadmin`: `4 failed \| 6 passed` (`UsuarioSinEmpresa` de la extensión) |
| A2 | sin la traducción del índice a `ya_existe` | `1 failed \| 9 passed` (el del otro escritor) |
| A3 | sin `pg_advisory_xact_lock` | `1 failed \| 9 passed` (el del cerrojo) |
| A4 | campo del conflicto cambiado | `2 failed \| 8 passed` |
| A5 | `estado: "pendiente"` | `1 failed \| 9 passed` |
| A6 | sin la comprobación de `ya_existe` | `1 failed \| 9 passed`: los dos procesos chocan en `usuario_email_key` antes que en el índice de R27 |
| A7 | sin la comprobación de conflicto | `2 failed \| 8 passed` |
| A8 | `falta: "rol"` cuando falta el tipo | `1 failed \| 9 passed` |
| S1 | el mensaje de la excepción impreso | `scripts/arranque-superadmin`: `1 failed \| 16 passed` |
| S2 | el éxito por stderr | `2 failed \| 15 passed` |
| S3 | código 0 siempre | `6 failed \| 11 passed` |
| G1 | la excepción de R19 solo por nombre | `fuera-datos-ordenex`: `1 failed \| 32 passed` |

**Salida real** (el cliente se regeneró dentro de `gate.lock`, porque otro worktree lo había dejado sin
`superadmin`; el lock ya está liberado)
- `pnpm run typecheck`: `TC_EXIT=0`, tras los últimos cambios.
- `pnpm exec eslint` sobre los 11 archivos tocados de `.ts`: `No issues found`, exit 0.
- `vitest run` de los 8 unit (script, composition root, `fuera-datos-ordenex`, `plataforma-solo-en-lista`,
  `sql-a-mano-por-empresa`, `superadmin-fuera-de-empresa`, `env-example-sin-valores` y el servicio de T14a) →
  `Test Files 8 passed (8)`, `Tests 113 passed (113)`.
- `vitest run` de `arranque-superadmin`, `empresas-plataforma`, `un-solo-superadmin`, `usuario-empresa-o-superadmin` y
  `usuarios-sin-superadmin` sobre `sl32_base`, juntos → `Test Files 5 passed (5)`, `Tests 28 passed (28)`.
- Después, en `sl32_base`: 0 superadmins, 0 organizaciones, 0 usuarios y 0 esquemas `sl32_empresas_*`.
- `vitest related --run` sobre los 11 archivos → `Test Files 6 passed | 2 skipped`, `Tests 96 passed | 14 skipped`.
  Los dos que saltó son los de integración: esa corrida salió sin `DATABASE_URL`. Ya estaban en verde en la
  corrida de arriba.
- `pnpm run test:guardias` → `Test Files 1 failed | 300 passed (301)`, `Tests 4 failed | 4111 passed`. El único
  rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que es el mismo de antes de esta tanda (marcadores
  de la ficha 420 en `init.sh`, que no está en el diff). `plataforma-solo-en-lista`, `sql-a-mano-por-empresa` y
  `fuera-datos-ordenex` están en verde.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Queda abierto, sin tocar** (no es de T8): el bloque SMTP de `.env.example`, los comentarios de
`lib/config/email.ts` y `design.md > Dependencias operativas` siguen describiendo Gmail. El README ya dice
Brevo, como fija P8.

**Veredicto:** T8 y T14b están hechas y marcadas. Cada R de T8 y de T14b tiene un test contra la base o contra
el proceso real, y las 16 mutaciones caen.


## T11 — la geografía pasa al superadmin, parte de `lib/` (R24, R25, R26), backend_dev — 2026-10-23

**Código modificado**
- `lib/services/GeografiaService.ts`:
  - `READ_ROLES = ["maestro", ...ROLES_PLATAFORMA]` y `GESTION_ROLES = new Set(ROLES_PLATAFORMA)`, los dos por import;
  - sale `WRITE_ROLES`. `crear`, `renombrar` y `cambiarActivacion` comprueban `GESTION_ROLES` antes de la primera
    llamada al repositorio;
  - `contarOrdenesSinEntregar` pasa de `READ_ROLES` a `GESTION_ROLES`, como dice el design.
- `lib/auth/menu-visibility.ts`: sale el subítem «Geografía» de Configuración. «Empresas» no está: es de T16.
- `lib/actions/geografia.ts`: solo los comentarios que decían «solo `maestro`». La forma no cambia. No toqué
  `actualizarDistritosEspeciales` (ver abajo).

**Tests modificados**
- `tests/unit/services/geografia-service.test.ts`:
  - las reglas del módulo (R14, R17, R21, R22, R60 y 375) se piden con un actor `superadmin`;
  - `listarArbol` (R26 de la 374) sigue con el `maestro`;
  - el bloque R24 usa `SIN_GESTION = [maestro, ...4 roles]` para crear, retirar, reactivar, renombrar y contar, con
    el repositorio sin llamar. `listarArbol` deniega solo a los 4 roles;
  - caso nuevo: R25, el `maestro` lista el árbol y recibe `ok`;
  - la contraprueba pasa a ser del `superadmin`: lista, da de alta, renombra, retira, reactiva y cuenta → `ok`, con
    dobles (P7).
- `tests/unit/actions/geografia-action.test.ts`:
  - el caso feliz del borde lo pide el `superadmin`;
  - bloque nuevo, con el `GeografiaService` REAL y un repositorio que lanza en todos sus métodos: el `maestro`
    recibe `forbidden` en crear, renombrar, retirar, reactivar y contar. No llega al repositorio. No sale el
    `conflict` del `catch` ni un rechazo (el 500);
  - `listarArbolGeografico` le sigue dando `ok`.
- `tests/unit/actions/geografia.composition-root.test.ts`: los dos casos del conteo, con el `superadmin`. El del
  árbol sigue con el `maestro`.
- `tests/integration/db/geografia-alta.test.ts`: el actor pasa a ser `superadmin`. `crear` solo escribe geografía y
  no choca con P7.
- `tests/integration/db/geografia-registro-accion.test.ts`: bloque nuevo, FUERA del de la 374 (aquel exige un
  usuario sembrado y en `sl32_base` cae por base vacía). Siembra sus propios datos: un `maestro` real con la empresa
  del test y un corpus con la provincia retirada.
  - El `maestro` retira, reactiva, renombra y da de alta → `forbidden`, con 0 filas en `historial_accion` y los nodos
    intactos.
  - Contraprueba: el mismo usuario, por el repositorio, deja 1 fila.
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`: las escrituras de geografía, con el `superadmin`.
  «El rol manda antes que el nombre» se prueba con `adminTienda` y con `maestro`.
- `tests/unit/auth/menu-visibility.test.ts`:
  - sale `/configuracion/geografia` de la lista de hijos;
  - caso nuevo: el `maestro` no ve «Geografía» en ningún ítem (se busca por `href` y por etiqueta) y
    `primerDestino` sigue siendo `/dashboard`.
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`: el `maestro` pasa de 23 a 22 destinos, con su motivo.
  Nadie más se mueve.
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`: solo el comentario de T11 (ya no dice «hoy»).

**Revisados sin cambio**
- `geografia-cascada-reversible`, `geografia-renombrado`, `geografia-ordenes-sin-entregar` y el resto de
  `tests/integration/db/geografia-*`: llaman al repositorio, no al servicio. No hay puerta de rol que cambiar.
- `geografia-sin-borrado-fisico`, `geografia-renombrado-punto-unico`, `etiqueta-fuente-diferida`, `geografia-nodo` y
  `geografia-admin.ui.test.tsx`: en verde. El componente mockea las actions.
- Tarifas (`TarifasPage.cobertura`, `ZonaDistritoEspecial`…): entran en `vitest related` y siguen en verde.

**Ayuda (`roles:` del frontmatter).** Se queda `roles: [maestro, admin]`.
- `roles:` dice de quién es la pantalla que el documento explica (`lib/ayuda/documento.ts`). Alimenta el índice y el
  «?». No decide quién abre la ruta.
- El texto de T1b explica a la oficina que la geografía la gestiona la plataforma. Ese lector es de oficina.
- `superadmin` no está en `ROLES_AYUDA`. Con `roles: [superadmin]`, el documento no sería de nadie que pueda leerlo.
- Las guardias de ayuda (`ayuda-*`, `asistente-sin-frontmatter`, `docs-marca-heredada`) más `acotamiento-por-rol` y
  `contexto-documental`: `116 passed`. Ninguna rechaza la ayuda de oficina sobre una pantalla que el `maestro` ya no
  abre. No hubo que parar.

**D12, `crear/renombrarNodoGeografico` y su `catch {}`.** Con el `maestro`, el `forbidden` sale del servicio antes
de la primera llamada al repositorio. El `catch` ya no se alcanza, y no hay `conflict` falso ni 500. Lo prueba el
bloque nuevo de la action. No estrecho el `catch` a P2002. Con el `superadmin`, el `catch` disfraza de `conflict` el
`EmpresaNoResuelta` de `renombrar` (ver la prueba real). Es P7 (D15), diferida a SL-26, y no hay pantalla de
superadmin que lo muestre. Estrecharlo cambia los dos casos de R18 del borde, que lanzan un `Error` genérico. Lo dejo
anotado para SL-26.

**`actualizarDistritosEspeciales`: PARADO, sin cambio.**
- No pasa por `GeografiaService`. Va contra Prisma directo y comprueba `actor.rol !== "maestro"`. Lo llama
  `CrearZonaForm.tsx:288`, en Tarifas.
- Escribe `distrito.zona_especial`, una tabla de plataforma. Con SL-17, una empresa no puede escribirla: de ahí el
  500 del `maestro`.
- El design no la cubre. R24 enumera alta, renombrado, retiro, reactivación y conteo, y R25 dice que Tarifas sigue
  siendo del `maestro`. D12 deja a Carlos decidir dónde vive la marca (¿`zona_distrito` de la empresa?).
- Hay tres arreglos posibles, y ninguno es mecánico:
  - (a) `forbidden` para todos: la action queda muerta, y Tarifas pierde la marca con un mensaje;
  - (b) abrirla al `superadmin`: es un permiso nuevo, fuera de R24;
  - (c) mover la marca a la empresa: es un rediseño (D12).
- (a) es el único que quita el 500 sin decidir producto, pero quita al `maestro` una función de Tarifas, aunque ya
  esté rota desde SL-17. Hace falta decisión.

**Prueba real del superadmin.** Por las actions reales, con el composition root de verdad y el cliente de la app con
la extensión de SL-17. Solo se stubbea `getActor`. El superadmin es real (rol `superadmin`, `organizacion_id NULL`) y
el corpus es una provincia, un cantón y un distrito.
- Base: `sl32_t11` (creada, migrada y borrada), y no `sl32_base`. Las actions commitean, y un superadmin que se quede
  en `sl32_base` rompe el `exigirSinSuperadmin` de los tests del otro backend_dev, que usa esa base ahora. Las
  migraciones son las mismas.
- Resultados:
  - `listarArbolGeografico` → `ok`, con el árbol;
  - `crearNodoGeografico` (distrito) → `ok`. El nodo queda escrito;
  - `renombrarNodoGeografico` → **`{"status":"conflict"}`**. Es falso: el `catch {}` se traga el `EmpresaNoResuelta`
    del registro, y el nombre no cambia;
  - `cambiarActivacionGeografica` → **lanza `EmpresaNoResuelta: Sin empresa en contexto para Usuario.findUnique`**.
    Es el 500: el registro lee el actor en `usuario`, que es tabla de negocio;
  - `contarOrdenesSinEntregarDeNodo` → **lanza `EmpresaNoResuelta: … Orden.count`**;
  - después: el distrito sigue «Distrito T11» y activo, y hay 0 filas en `historial_accion`.

  Es P7 tal cual la describe D15, con un matiz: lo primero que falla en `cambiarActivacion` es la lectura de
  `usuario`, antes de escribir en `historial_accion`. No lo arreglé.

**Lo que tiene que cambiar en la página (frontend_dev, tanda 5).**
- `app/(app)/configuracion/geografia/page.tsx:19`. Hoy hace `if (actor?.rol !== "maestro")` y pinta un
  `role="alert"`. Pasa a `if (!actor || !esPlataforma(actor.rol)) notFound()`, con `esPlataforma` de
  `lib/auth/plataforma.ts`, antes de `listarArbolGeografico()`.
- La página no recibe `puedeCambiarActivacion`, y `GeografiaAdminModule` no cambia.
- `tests/unit/components/geografia-admin-page.test.tsx`:
  - el `maestro` y los demás roles reciben `notFound()` sin llamar a `listarArbolGeografico`;
  - el caso «el maestro sí ve el árbol» (líneas 115 y 129) pasa al `superadmin`.
- Con eso, `vitest related` de `page.tsx` cierra el «Hecho cuando».

**R → test**
- R24 (`maestro` → `forbidden` antes de tocar la base, sin nodo ni registro):
  - `geografia-service.test.ts` (bloque R24 con `SIN_GESTION`);
  - `geografia-action.test.ts` (bloque SL-32, con el servicio real);
  - `geografia-registro-accion.test.ts` (bloque SL-32, contra Postgres);
  - `nombres-que-imprime-la-etiqueta.test.ts` (el `maestro` con nombre malo).
- R24 (el `superadmin` aplica las reglas): la contraprueba de `geografia-service.test.ts` y las reglas del archivo
  con `SUPERADMIN`, más `geografia-alta.test.ts` (solo `crear`, contra Postgres). Lo demás va con dobles, por P7.
- R25:
  - «el `maestro` sigue leyendo el árbol (Tarifas)», en el servicio y en la action;
  - `geografia.composition-root.test.ts` (árbol);
  - los tests de Tarifas, en verde.
- R26 (menú): el caso nuevo de `menu-visibility.test.ts` y `pwa-manifiesto-atajos` (23 → 22). R26 (página): pendiente
  de frontend. R26 (ayuda): T1b, y las guardias de ayuda en verde.

**Mutaciones.** Cada una se aplicó, se corrió y se restauró. El md5 de los dos archivos es idéntico antes y después.
- `"maestro"` vuelve a `GESTION_ROLES`:
  - servicio más guardia de T6 → `6 failed | 66 passed`. La guardia sola da `1 failed | 12 passed` («en el árbol
    real no hay ninguna falta»);
  - action → `5 failed | 30 passed`;
  - integración (`-t SL-32`, `sl32_base`) → `1 failed | 1 passed`;
  - etiqueta → `1 failed | 17 passed`.
- `"maestro"` sale de `READ_ROLES` → servicio más action: `3 failed | 91 passed`. Caen los casos de Tarifas.
- El conteo vuelve a `READ_ROLES` → `2 failed | 92 passed`.
- `GESTION_ROLES` vacío, sin el superadmin → servicio: `28 failed | 31 passed`.
- «Geografía» vuelve al menú → menú más pwa: `3 failed | 59 passed`.
- La misma ruta con otra etiqueta → el caso SL-32 del menú: `1 failed`.

**Salida real**
- `prisma generate`, dentro del lock: el cliente de `node_modules` estaba regenerado sin `superadmin` por otro
  worktree, y `alcance-fuente-unica` daba 6 en vez de 7. Después de regenerar:
  - `pnpm run typecheck` → exit 0, con 0 errores;
  - los 10 archivos de T11 más `alcance-fuente-unica`, sobre `sl32_base` → `214 passed | 10 skipped`. El único FAIL
    es el `beforeAll` del bloque de la 374 de `geografia-registro-accion` («`usuario` esta vacia»), que es de antes y
    viene de la base vacía.
- `pnpm exec eslint` sobre los 12 archivos tocados → exit 0, con 0 errores. Quedan 2 warnings de antes:
  `geografia-alta.test.ts:97 s` y `composition-root:25 _args`.
- `vitest related --run` de `GeografiaService.ts`, `menu-visibility.ts` y `actions/geografia.ts` sobre `sl32_base` →
  `16 failed | 3259 passed | 34 skipped`, con 4 archivos rojos. Todos fallan por la base vacía:
  - `historial-accion-lectura`: «hacen falta al menos 2 usuarios» y «`orden` esta vacia»;
  - `455/snapshot-lectura` y `455/caracterizacion/snapshot-correccion`: sin datos sembrados;
  - el `beforeAll` de la 374 de `geografia-registro-accion`.
- `pnpm run test:guardias` → `6 failed | 4090 passed`:
  - 4 son de `dependencias-declaradas-presentes` (marcadores de `init.sh`, de antes);
  - 2 eran de `alcance-fuente-unica`, por el cliente regenerado sin `superadmin`. Con el cliente bueno pasa.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Veredicto:** la parte de `lib/` de T11 está hecha, y las mutaciones del «Hecho cuando» caen. T11 queda `[ ]`:
falta la página (frontend, tanda 5) y la decisión sobre `actualizarDistritosEspeciales` (D12).
