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

## T16 (lib) y T15 (test de la action), y prueba real del login sin empresa (R6, R35, R36), backend_dev — 2026-10-23

**Archivos**
- `lib/auth/menu-visibility.ts`:
  - el ítem `{ label: "Empresas", href: "/plataforma/empresas", iconKey: "building", roles: ROLES_PLATAFORMA }`,
    al final de `SIDEBAR_ITEMS`, sin `destinoInicial`;
  - **`IconKey` vive aquí, no en `Sidebar.tsx`**: gana `"building"`. El `ICON_BY_KEY` del Sidebar y la lista
    exhaustiva de `tests/components/Sidebar.test.tsx` los puso el frontend_dev.
- Tests modificados: `tests/unit/auth/menu-visibility.test.ts` (bloque «SL-32 — ítem Empresas»),
  `tests/unit/auth/destino-post-login.test.ts` (el superadmin aterriza en `/plataforma/empresas`; la lista literal de
  `destinoInicial: false` no cambia) y `tests/unit/auth/plataforma.test.ts` (el ítem lee `ROLES_PLATAFORMA` por
  identidad; para cada `RolValue`, ve «Empresas» si y solo si `esPlataforma`).
- Test nuevo: `tests/unit/actions/alta-empresa-rol.test.ts`: con un `maestro`, `{ estado: "no_autorizado" }` y el
  servicio sin llamar; con un `superadmin`, una llamada con la entrada tal cual, el resultado del servicio y el
  contexto `plataforma` de SL-17.

**Revisado sin cambios**
- `/dashboard` (`app/(app)/dashboard/page.tsx`): con el superadmin no entra en la rama `maestro`/`admin` y redirige a
  `primerDestino(...)`, que ahora es `/plataforma/empresas`.
- `middleware.ts`: solo exige sesión activa (`isSessionActive`, ya en `comoPlataforma("SL-17")`). No hay guardia
  por rol que mande al superadmin fuera de `/plataforma/*`. El login redirige a `/dashboard` (`LoginForm`).
- Login, OTP, sesión y recuperación de contraseña: las actions de `lib/actions/auth.ts` y `password-reset.ts`
  ya corren en `comoPlataforma("SL-17", "login")`, y `resolveActorFromSession` y `empresaDeLaPeticion` también.
  No hizo falta ningún cambio ni fila nueva en `EXCEPCIONES_DE_PLATAFORMA`.

**Prueba real** (base desechable `sl32_login`: migraciones, `db:seed` y `pnpm arranque:superadmin` con variables
ficticias → «Superadmin creado.»). Un test temporal de vitest (borrado), con `next/headers` doblado y el OTP leído del
`ConsoleEmailSender` con `AUTH_OTP_DEBUG_LOG=1`, llamó a las actions reales en orden:
1. superadmin: `login` → `challenge_required` → `verifyChallenge` `ok` → `isSessionActive` true →
   `resolveActorFromSession` = `{ rol: superadmin, organizacionId: null }` → `empresaDeLaPeticion()` null;
2. `altaEmpresaAction` con el actor real de la sesión → `creada`;
3. maestro nuevo: `solicitarRecuperacion` `ok` → `verificarCodigoRecuperacion` `ok` → `restablecerContrasena` `ok` →
   `login` + OTP `ok` → actor `maestro` con la `organizacionId` del alta, y `empresaDeLaPeticion()` igual;
4. dentro de su empresa, sin contexto explícito: `usuario.findMany` devuelve solo al maestro (no al superadmin), y
   `orden.count()` = 0 sin `EmpresaNoResuelta`.
- `Tests 1 passed (1)`. En la base: superadmin 1 OTP y 1 sesión; maestro 2 OTP (recuperación y login) y 1 sesión.
  `sl32_login` borrada después; queda solo `sl32_base`.
- Hallazgo: el primer `arranque:superadmin` falló con `PrismaClientValidationError` porque el cliente compartido
  estaba generado sin `superadmin` (`Invalid value for argument in. Expected RolValue`). Con el cliente regenerado,
  creó el superadmin. El mensaje del comando no imprime el detalle (correcto), así que se ve como «revisa
  DATABASE_URL».

**R → test**
- R6: `menu-visibility.test.ts` («ningún otro rol ve Empresas»), `plataforma.test.ts` y `destino-post-login.test.ts`.
- R36: `menu-visibility.test.ts` (exactamente `[Empresas]`, último ítem) y la guardia `superadmin-fuera-de-empresa`.
- R35: `alta-empresa-rol.test.ts`, y `organizaciones-action.test.ts` para los siete roles.

**Mutaciones** (aplicada, corrida, restaurada, `cmp` idéntico):
- ítem con `roles: [...ROLES_PLATAFORMA, "maestro"]` → menú, plataforma, destino y la guardia de T6:
  `5 failed | 79 passed`. Caen `menu-visibility` (el mapeo del maestro y «ningún otro rol»), los dos de
  `plataforma.test` y la guardia («Empresas lee ROLES_PLATAFORMA»);
- ítem con `destinoInicial: false` → `destino-post-login`: `2 failed | 9 passed`;
- `exigirSuperadmin` que devuelve `true` siempre → `alta-empresa-rol`: `1 failed | 1 passed`.

**Salida real**
- `pnpm run typecheck` → 0 errores. Hubo un rojo intermedio en `tests/components/Sidebar.test.tsx:409`
  (exhaustividad de `IconKey`), que desapareció cuando el frontend_dev añadió `"building"` a su lista.
- `pnpm exec eslint` de los 5 archivos → sin problemas.
- `vitest run` de `menu-visibility`, `destino-post-login`, `plataforma`, la guardia `superadmin-fuera-de-empresa`,
  `alta-empresa-rol` y `organizaciones-action` → `Test Files 6 passed (6)`, `Tests 99 passed (99)`.
- **Lock:** en el segundo `prisma generate`, el bucle de espera agotó sus 100 intentos sin tomar `gate.lock`, que
  tenía otro agente desde las 08:39, y el `generate` corrió igual, sin lock, con el esquema de este worktree. No borré
  ese lock, que no es mío.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Veredicto:** T16 está hecha y marcada `[x]`; el ícono ya lo trae el `Sidebar` del frontend. Al test de T15 no le
falta nada. El login, el OTP, la sesión y la recuperación funcionan de verdad para el superadmin sin empresa y para
el maestro nuevo dentro de la suya, sin cambios.

## T15, T16 (UI) y la página de T11 — frontend_dev — 2026-10-23

**Archivos** (todos en LF, como estaban)
- Nuevos:
  - `app/(app)/plataforma/empresas/page.tsx`;
  - `tests/integration/empresas-page.test.tsx`;
  - `tests/integration/app-layout-superadmin.test.tsx`.
- Modificados:
  - `app/(app)/_components/Sidebar.tsx`: `building: Building2` en `ICON_BY_KEY`, con su comentario de icono
    propio. La unión `IconKey` vive en `lib/auth/menu-visibility.ts`, y la puso el backend_dev.
  - `tests/components/Sidebar.test.tsx`: `"building"` entra en `TODAS_LAS_CLAVES`. Sin él, la exhaustividad
    tipada rompe el typecheck.
  - `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`:
    - los tipos salen de `lib/types/organizacion.ts` y de `AltaEmpresaActionResultado`;
    - valida con `altaEmpresaInputSchema` antes de llamar a la action;
    - sale el `@sin-superficie`.
  - `app/(app)/layout.tsx`: la rama `esPlataforma` lee el nombre dentro de
    `comoPlataforma("SL-32", "nombre del superadmin en el pie")`.
    - Pasa `false` y `null`.
    - No construye `UsuarioPreferenciaRepository`.
  - `lib/db/excepciones-aislamiento.ts`: la fila de `app/(app)/layout.tsx` (SL-32, R6).
  - `app/(app)/configuracion/geografia/page.tsx`: `if (!actor || !esPlataforma(actor.rol)) notFound()`. Sale el
    `role="alert"` de permiso.
  - `tests/unit/components/geografia-admin-page.test.tsx`:
    - los 6 roles de empresa (el `maestro` incluido) y la falta de sesión → `notFound()`, sin llamar a
      `listarArbolGeografico`;
    - el caso feliz y el de error pasan al `superadmin`.
  - `tests/components/empresas-module.test.tsx`: `{ estado: "no_autorizado" }` → el genérico, y dos casos de
    validación con el schema.
  - Fuera de la UI, solo comentarios, porque lo pide la guardia `superficie-de-uso`:
    - `lib/actions/organizaciones.ts`: sale el `@sin-superficie` de `altaEmpresaAction`. Es R-A: ya la monta la
      página.
    - `components/ui/table.tsx`: sale el `@sin-superficie`. Es R-B: ya la monta `EmpresasModule`. Ver «Para el
      leader».
  - `specs/SL-32-rol-superadmin/tasks.md`: `[x]` en T15 y en T11, con la nota de D12.

**Decisiones**
- **El catálogo de tipos.** La página no usa `listarTiposIdentificacion`, la de Usuarios: su servicio solo deja
  pasar al `maestro` (`ALLOWED_ROLES`), y al superadmin le daría `forbidden`.
  - Lee `new UserRepository(getPrismaClient()).listTiposIdentificacion()`.
  - `TipoIdentificacion` está en `MODELOS_DE_PLATAFORMA`. Sin contexto, la extensión lo deja pasar tal cual, así
    que no hace falta `comoPlataforma`.
  - El layout ya importa los repositorios de esta misma forma.
- **El schema en el cliente: sí.**
  - `> Contrato con la action de SL-17` dice «si lo exporta», y lo exporta. Se importa y no se copia, así que no
    contradice el «no copia reglas» de T12.
  - Cada issue pasa por `CAMPO_DE_LA_ACTION` y da «Revisa este campo.». Se marcan todos los campos rechazados y no
    se llama a la action.
  - Si un rechazo no cae en ningún campo, decide la action.
  - Los 21 tests de T13 rellenan datos válidos y siguen en verde.
- **`exigirSuperadmin` ya usaba `esPlataforma`.** En T15 no hubo stub que cambiar.

**Diseño, punto por punto contra `design.md > Propuesta de T12`.** Las líneas son de `EmpresasModule.tsx`, salvo
que se diga otra cosa.

| Punto de la propuesta | Resultado |
|---|---|
| `AppPage title="Empresas"` | coincide (`page.tsx:36`) |
| Tres props: `empresas`, `tiposDocumento: {id,value}[]` y `altaEmpresa` | coincide (`EmpresasModuleProps`, l. 24-34; `page.tsx:43-47`) |
| Orden vertical, 1: el aviso, solo tras un éxito | coincide (l. 242-246, el primer hijo) |
| `Alert` con `role="status"` | coincide (l. 243) |
| Texto «Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?» y su email.» | coincide, literal (l. 60-61) |
| Se cierra al empezar a escribir | coincide (`cambiar` → `setCreada(false)`, l. 179) |
| 2: el formulario «Crear empresa», siempre visible y sin modal | coincide (`<form aria-label>`, l. 248) |
| Dos grupos, «Empresa» y «Primer maestro», con `h2` `text-sm font-medium` | coincide (l. 255 y 265) |
| Empresa: «Nombre» y «Slug», con la ayuda «minúsculas, números y guiones» | coincide (l. 259-260, `hint`; el texto, l. 67) |
| Maestro: «Nombre», «Email», «Teléfono», «Tipo de documento» y «Documento», en ese orden | coincide (l. 269-289) |
| El tipo es un `Select` con los valores del catálogo, como en `UsuarioForm` | coincide (l. 278). Lleva `label: t.value`, igual que `UsuarioForm.tsx:160`, y viaja el `value` |
| `FormField` con `error`, y el control es un `Input` | coincide (`campoTexto`) |
| `grid md:grid-cols-2`, una columna en móvil | coincide (`grid gap-4 md:grid-cols-2`, l. 258 y 268) |
| `Button` con `loading`, al final | coincide (l. 300) |
| Sin campo de contraseña | coincide: no hay `password` en el archivo, y lo prueba T13 |
| 3: el genérico encima del botón, como `Alert variant="destructive"` | coincide (l. 294, antes del botón de la l. 300) |
| Texto «No se pudo crear la empresa. Inténtalo de nuevo.» | coincide, literal (l. 73) |
| 4: `Table` con cuatro columnas: Nombre, Slug, Alta y Maestros | coincide (l. 322-328) |
| Alta: fecha corta, en `es` | coincide (`Intl.DateTimeFormat("es", { dateStyle: "short" })`, l. 152) |
| Cada maestro en su línea, como «nombre · email» | coincide (`<ul>`/`<li>`, l. 341-345) |
| La pantalla no reordena | coincide (`empresas.map` tal cual) |
| Vacío: `EmptyState` «Aún no hay empresas. Crea la primera con el formulario.» | coincide (l. 316; el texto, l. 83) |
| Errores: los textos de slug, email, documento e `invalida` | coincide (l. 74-77; `desenlaceDe`) |
| Tras un éxito: vacía el formulario, avisa y llama a `router.refresh()` | coincide (l. 216-218) |
| «No hay validación de cliente que copie reglas» | **difiere a propósito:** valida con el schema importado de SL-17 (`erroresDeCliente`). La propuesta se escribió cuando el schema no estaba en la rama, y `> Contrato…` pide usarlo si existe |
| Fuera de la propuesta | Si el listado devuelve `forbidden`, la página pinta «No se pudo cargar el listado de empresas.» con `role="alert"`. Tras la puerta no debería pasar. Es el patrón de `vehiculos/page.tsx`, y debajo queda el `EmptyState` |

En el componente no hubo diferencias que corregir, salvo los tipos y la validación. No levanté un dev server.

**R → test**
- R35, la página. Está en `tests/integration/empresas-page.test.tsx`.
  - «%s → notFound(), sin leer el listado ni el catálogo»: los 6 roles de empresa, y «sin sesión».
  - «pide el listado con su actor y pinta una fila por empresa…»: el superadmin, con el `EmpresasModule` real.
- R29, la página: el mismo caso feliz, más «el catálogo de tipos de documento baja al selector» y «si el listado no
  llega, lo dice».
- R6, el marco. Está en `tests/integration/app-layout-superadmin.test.tsx`.
  - «el pie lleva su nombre y su rol, leído en contexto de plataforma…»: el contexto se captura dentro de
    `findById`.
  - «no construye ni llama a `UsuarioPreferenciaRepository`…».
  - La contraprueba del `maestro`.
- R34 y R35, el módulo. Están en `empresas-module.test.tsx`.
  - «R34: «no autorizado» de la action muestra el error genérico».
  - El bloque «validación con el schema de la action», con 2 casos.
- R26, la página: `geografia-admin-page.test.tsx`. Son «el rol %s recibe notFound()…», con 6 roles, y «sin
  sesión».
- R36, el icono: `Sidebar.test.tsx`, «toda clave de IconKey resuelve a un ícono», con `building`.

**Mutaciones.** Cada una se aplicó, se corrió y se revirtió. El md5 del archivo es el mismo antes y después.
- La página de Empresas, con `esPlataforma` → `(_r) => true`: `empresas-page.test.tsx` da `6 failed | 4 passed
  (10)`. md5: `b49cce46…`.
- La página de Geografía, con la puerta de vuelta a `actor.rol !== "maestro"`: `geografia-admin-page.test.tsx` da
  `3 failed | 6 passed (9)`. md5: `6d23e50b…`.
- El layout. md5: `43087a09…`.
  - El nombre del superadmin sin `comoPlataforma`: `1 failed | 2 passed (3)`.
  - `deLaPlataforma = false`: `2 failed | 1 passed (3)`.
- El módulo, sin `erroresDeCliente`: `2 failed | 22 passed (24)`. md5: `0e34049b…`.
- El Sidebar, sin `building: Building2`: `Sidebar.test.tsx` en rojo, con 5 `×` o más. md5: `3ea70a91…`.

**Salida real**
- `prisma generate` va dentro del lock, sobre `sl32_base`.
- `pnpm run typecheck` → `TC_EXIT=0`, con 0 `error TS`. Antes de añadir `building` a `Sidebar.test.tsx` daba 1
  error: la exhaustividad de la línea 409.
- `pnpm exec eslint` sobre los 13 archivos tocados → «No issues found», exit 0.
- `vitest run` sobre 8 archivos → `Test Files 8 passed (8)` y `Tests 121 passed (121)`:
  - `superficie-de-uso` y `plataforma-solo-en-lista`;
  - `Sidebar`, `empresas-module`, `AppLayout` y `organizaciones-action`;
  - `empresas-page` y `app-layout-superadmin`.

  Antes de quitar las dos anotaciones, `superficie-de-uso` daba `2 failed`.
- Las otras guardias que leen el layout siguen en verde:
  - `push-alta-punto-unico` y `revision-sinpe-no-bloquea`;
  - `asistente-panel-hermano` y `vistas-superficies-declaradas`;
  - `superadmin-fuera-de-empresa`.
- `vitest related --run` sobre `GeografiaService.ts`, `menu-visibility.ts` y `configuracion/geografia/page.tsx`,
  con `sl32_base` → `19 failed | 3270 passed | 34 skipped`, en 7 archivos rojos. Ninguno sale de la página.
  - 16 son los mismos de base vacía que anotó T11:
    - `historial-accion-lectura`;
    - `455/snapshot-lectura` y `455/caracterizacion/snapshot-correccion`;
    - el `beforeAll` de la 374 de `geografia-registro-accion`.
  - 3 venían del ítem «Empresas» que el backend_dev estaba poniendo en `menu-visibility.ts` en ese momento:
    - `menu-ayuda`, «es EL ÚLTIMO de SIDEBAR_ITEMS»;
    - `menu-mi-bodega`, «va AL FINAL»;
    - `pwa-manifiesto-atajos`, «433».

    Ver abajo la segunda corrida.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Para el leader**
- **La tabla del listado.** `components/ui/table.tsx` decía que la única tabla de listas es `DataTable`, igual que
  `DESIGN.md:66`: «las tablas crudas se migran a esta».
  - La propuesta aprobada de T12 fija `Table` de `components/ui/table`, y la seguí.
  - La guardia R-B obligó a quitar la anotación. El comentario dice ahora quién la monta y por qué.
  - Si Carlos prefiere `DataTable`, el cambio es del listado y de nada más.
- **El cierre de T15.** Su «Hecho cuando» incluye `alta-empresa-rol.test.ts`, que es del backend_dev. Marqué `[x]`
  con lo mío en verde.
- **T11.** Va `[x]`. `actualizarDistritosEspeciales` sigue parada (D12) y sin cambio.
- **Siguen rojos tras el cierre del backend_dev.** Segunda corrida, después de su sección: `vitest run` de
  `menu-ayuda`, `menu-mi-bodega`, `pwa-manifiesto-atajos`, `Sidebar`, `AppLayout` y `app-layout-superadmin` →
  `3 failed | 85 passed (88)`.
  - Son los tres de «Empresas» al final de `SIDEBAR_ITEMS`. El design lo pone al final, y estos tests exigen que
    lo último sea «Ayuda» y «Mi bodega».
  - No son de la UI y no los toqué (`menu-visibility.ts` y sus tests no son míos).

**Veredicto:** T15 hecha (página, marco y tests) y la parte de UI de T16 también. La página de T11 está hecha, con
D12 abierta. Quedan 3 rojos de menú del backend_dev. Sin commitear.

## T16, orden del ítem — backend_dev — 2026-10-23

- «Empresas» pasa del final a justo antes de «Mi bodega»: la barra sigue cerrando con «Mi bodega» y «Ayuda» (contratos 429/433). Ponerlo solo antes de «Ayuda» rompía `menu-mi-bodega` (penúltimo = `/mi-bodega`). Cambiados `lib/auth/menu-visibility.ts` (bloque y comentario), `tests/unit/auth/menu-visibility.test.ts` (R36: `slice(-3)` = `["Empresas","Mi bodega","Ayuda"]`), `specs/SL-32-rol-superadmin/design.md > Ruta y piezas`. `destino-post-login` y `plataforma.test.ts` no decían «al final»: sin cambios.
- Guardia pwa: el literal cuenta destinos por rol → añadido `superadmin: 1`. Consecuencia real: la intersección pasa de `["/ayuda"]` a `[]` (el superadmin no está en `ROLES_AYUDA`); literal actualizado con su porqué. Sigue sin atajos.
- Salida: 7 archivos (los 6 + `superadmin-fuera-de-empresa`) 123 passed; `pnpm run typecheck` exit 0 (con `prisma generate` dentro del lock); eslint exit 0. Mutación (Empresas otra vez al final): 3 failed (`menu-ayuda`, `menu-mi-bodega`, R36 de `menu-visibility`); revertido, `cmp` idéntico.

## T9 y T17 — E2E del superadmin, frontend_dev — 2026-10-23 — BLOQUEADO (bug de SL-17 en `lib/db`)

**Archivos** (nuevos, LF, sin commitear)
- `e2e/_superadmin-fixture.ts`: credenciales ficticias fijas (`superadmin-e2e@example.test`), `correrArranque` (corre `pnpm arranque:superadmin` de verdad), `asegurarSuperadmin` (crea o confirma que el único superadmin es el de prueba; si hay otro, falla), `olvidarDispositivos` (fuerza el OTP de dispositivo nuevo), `codigoEnviadoA` (lee el código del log del dev server), `entrarConOtp`, `conCandadoDelSuperadmin` (mutex entre workers en `os.tmpdir()`), `enlacesDelMenu`, `NO_ENCONTRADO`.
- `e2e/superadmin-arranque.spec.ts` (T9): arranque + no imprime valores + fila `organizacionId null`/`activo`/`superadmin`; login con OTP → `/plataforma/empresas`, menú = `["Empresas"]`, nombre en el pie; `/configuracion` → 404.
- `e2e/superadmin-empresas.spec.ts` (T17): pasos 1-6 de tasks.md con datos aleatorios, textos literales de la propuesta de T12 (aviso, vacío, errores de slug/email/documento, «Revisa este campo.»), y el paso 5-6 para **A y para B** (recuperar contraseña por la UI → login con OTP → menú sin «Empresas» → `/plataforma/empresas` da 404). `afterAll` borra lo que creó para que la corrida siguiente vuelva a ver el vacío.

**Decisiones**
- OTP: ningún E2E existente lo leía (todos confían el dispositivo en la base). Vía elegida, la más simple: el `ConsoleEmailSender` escribe siempre `to=<email> asunto="Tu codigo de verificacion: NNNNNN"` (el asunto de `plantillaOtpCodigo` lleva el código), así que no hace falta `AUTH_OTP_DEBUG_LOG`. El log se lee con `LogDelServidor` de `_dos-empresas-fixture.ts` (variable `SL17_HUMO_LOG_SERVIDOR`): el dev server se levanta aparte con su salida a un archivo y Playwright lo reutiliza (`reuseExistingServer`), igual que el humo de SL-17.
- Un solo superadmin: T17 usa el mismo setup que T9 (`asegurarSuperadmin`, idempotente: `creado` o `ya_existe` del mismo email). Como Playwright corre los dos archivos en workers paralelos, arranque y login del superadmin van bajo `conCandadoDelSuperadmin` (sin él chocan en el índice y se cruzan los códigos del mismo email).
- La base remota aborta: los dos specs abren la base con `clienteDueno()` → `urlDeBase()` (mismo guard que `marca.spec.ts`).
- Se corre con `--reporter=list` (el `html` por defecto se queda sirviendo el informe al fallar).
- El error genérico «No se pudo crear la empresa…» no se puede provocar desde el navegador sin romper la base; queda en `empresas-module.test.tsx`.

**Bloqueo 1 (impide T9 y T17): `EmpresaNoResuelta` con el dev server real, para cualquier rol.** Base `sl32_e2e` (migrada + `db:seed`), dev server propio en el 3000 (nada escuchaba antes; `.next` borrado), sin SMTP.
- Corrida 1: el comando crea el superadmin (`1 passed`); login + OTP OK (el código sale del log); pero `GET /dashboard 404`: el middleware (`isSessionActive`, dentro de `comoPlataforma`) lanza `EmpresaNoResuelta: Sin empresa en contexto para Usuario.findUnique` (`session-guard.ts:32` ← `middleware.ts:72`). Resultado: `1 failed | 1 passed | 1 did not run`.
- Experimento que lo confirma: dev server nuevo y primera petición `GET /dashboard` con cookie falsa (así el cliente lo crea el middleware). Ahora el que falla es el `POST /login`: `EmpresaNoResuelta` en `AuthService.login` ← `lib/actions/auth.ts:101`, también dentro de `comoPlataforma`.
- Causa: `getPrismaClient()` guarda el cliente extendido en `globalThis.__prisma__`, pero el `AsyncLocalStorage` de `lib/db/contexto-empresa.ts` es una constante de módulo. En `next dev` el middleware (proxy) y la app son grafos de módulos distintos en el mismo proceso: el cliente lo crea el primero que llega, su extensión lee SU `almacen`, y el `comoPlataforma` del otro grafo queda invisible. No es del superadmin: le pasa a cualquier login. La prueba real de T16 (vitest, un solo grafo) no podía verlo.
- Arreglo probable (backend, `lib/db`, no lo toco): que el `AsyncLocalStorage` también viva en `globalThis` (`globalThis.__contextoDatos__ ??= new AsyncLocalStorage()`), igual que el cliente. Afecta también a `next start` en local; en Vercel el middleware corre aparte y habría que comprobarlo.

**Bloqueo 2 (spec vs código, paso 4 de T9): `/configuracion` no da 404 al superadmin.** `app/(app)/configuracion/page.tsx` responde a todo rol que no sea `maestro` con un 200 y «No tienes permiso para acceder a esta sección.», no con `notFound()`. `design.md` (R5, «Páginas y servicios de empresa: nada cambia… devuelven notFound()») y T9 dicen 404. No lo he corrido (el login cae antes), y no improviso: o se cambia la página (`notFound()` para el superadmin, o para todo no-maestro) o se cambia el paso 4. Decide el leader.

**D19 (humo de SL-17 con alta desde la pantalla): pendiente.** No es contenido: el humo pide SMTP real, buzones reales (`SL17_HUMO_MAESTRO_*`) y el log del servidor, y su paso 1 afirma la repetición idempotente `ya_existe` del servicio (R45 de SL-17), que la pantalla no muestra (la pinta como error de slug). Además, el bloqueo 1 lo tumba igual. Se retoma cuando T17 esté en verde.

**Correo real (yopmail): no hecho.** La orden era hacerlo después de los E2E en verde. Dejé preparado fuera del repo `scratchpad/sl32mail/smtp-env.mjs` (exporta `SMTP_*` sin imprimirlos) y `scratchpad/sl32mail/correo-real.ts` (alta por el servicio + `solicitarRecuperacion` con el emisor real; imprime solo aceptado/error). No dependen del dev server, así que no les afecta el bloqueo 1.

**Mutación** (`esPlataforma` → `() => true` en la página): no corrida; el paso 5 no llega a ejecutarse.

**Salida real**
- `pnpm run typecheck` → `TC_EXIT=0`, 0 `error TS` (con `prisma generate` dentro de `gate.lock`; entre medias otro worktree regeneró el cliente sin `superadmin` y dio 47 errores, que desaparecen al regenerar).
- `pnpm exec eslint` de los 3 archivos → «No issues found», exit 0.
- `pnpm exec playwright test e2e/superadmin-arranque.spec.ts --reporter=list` → `1 failed | 1 passed | 1 did not run` (el fallo es el bloqueo 1). T17 no se corrió: su `beforeAll` hace el mismo login.
- Limpieza: dev server matado, nada en el 3000, `.next`, `test-results` y los logs (Next registra los argumentos de las Server Actions, contraseña y código incluidos) borrados; `sl32_e2e` borrada (queda `sl32_base`); `gate.lock` soltado.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Veredicto:** T9 y T17 escritos y sin marcar: el login real cae por `EmpresaNoResuelta` (contexto de SL-17 partido entre middleware y app), y el paso 4 de T9 choca con `/configuracion`, que hoy no da 404.

## Arreglo del ALS de SL-17 — backend_dev — 2026-10-23 — HECHO (llevar también a `dev`)

**Causa (confirmada en el código).** `getPrismaClient()` guarda el cliente ya envuelto por `conAislamientoPorEmpresa` en `globalThis.__prisma__`, pero el `AsyncLocalStorage` de `lib/db/contexto-empresa.ts` era `const almacen = new AsyncLocalStorage()` de módulo. En `next dev` el middleware (proxy) y la app cargan copias distintas del módulo en el mismo proceso; la extensión (`extension-empresa.ts`, `contextoActual()` en las líneas de `aplicar` y `contextoDeTransaccion`) lee el almacén de la copia que creó el cliente, y el `comoPlataforma`/`conEmpresa`/`dentroDeTransaccionDeEmpresa` de la otra copia escribía en otro. Es el único estado de módulo de ese tipo: `dentroDeTransaccionDeEmpresa` usa el mismo `almacen` (marca `enTransaccion` en el propio contexto), y en `extension-empresa.ts` solo hay `Set` y constantes de solo lectura. No hay más `AsyncLocalStorage` en `lib/`, `app/` ni `middleware.ts`.

**Arreglo** (`lib/db/contexto-empresa.ts`, LF, sin dependencias): el almacén vive en `globalThis` bajo `Symbol.for("servi-logistic.contexto-datos")` (`??=`), el mismo patrón que `__prisma__`, con un comentario que explica el porqué. Ninguna guardia de SL-17 hubo que tocarla.

**Test** `tests/unit/db/contexto-empresa-una-instancia.test.ts` (5 casos): con `vi.resetModules()` importa dos copias del módulo (comprueba que son distintas), abre `comoPlataforma`, `conEmpresa` y `dentroDeTransaccionDeEmpresa` en una y lee `contextoActual()` en la otra; fuera de contexto, ninguna ve nada.
- Mutación (volver a `const almacen = new AsyncLocalStorage<ContextoDatos>()`): `3 failed | 2 passed`. Revertida con `cmp`: IDÉNTICO.

**Salida real**
- `pnpm exec vitest related --run lib/db/contexto-empresa.ts` (sin `DATABASE_URL`): `Test Files 3 failed | 768 passed | 324 skipped (1095)`, `Tests 3 failed | 10720 passed | 2781 skipped (13504)`. Los 3 rojos son de base, no tienen que ver con este cambio: `vista-filtro-migration`, `orden-traspaso-migration` y `habilitacion-api-migration`, todos en «ningún `down.sql` ANTERIOR fue tocado», porque el `down.sql` de `20261022130100_organizacion_id_en_negocio` (SL-17) contiene `vista_filtro`.
- `vitest run` de `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `extension-empresa` y el test nuevo: `4 passed`, `106 passed`.
- `pnpm run typecheck` con `gate.lock`: `TC_EXIT=0`, 0 `error TS`. `prisma generate` no corrió por falta de `DATABASE_URL` en el entorno; el cliente generado ya era el bueno.
- `pnpm exec eslint` de los 2 archivos: exit 0.

**Prueba real** (base `sl32_als`, migrada con `migrate deploy` y sembrada con `db:seed`; antes no escuchaba nada en el 3000 ni había ningún `next` vivo; `gate.lock` tomado; `rm -rf .next`; `pnpm dev` sin SMTP; superadmin ficticio con `pnpm arranque:superadmin` → «Superadmin creado.», exit 0; login con Playwright desde un script del scratchpad)
- Dev server 1, primera petición `/login` (el cliente lo crea la app): login, OTP leído del asunto del `ConsoleEmailSender` y `GET /dashboard` → **200, URL final `/plataforma/empresas`**. 0 `EmpresaNoResuelta` en el log. Antes del arreglo aquí salía 404.
- Dev server 2, nuevo (con `rm -rf .next`), y su primera petición `GET /dashboard` con una cookie `session` falsa, que pasa por el middleware y redirige a `/login`: después, `POST /login` 200, `GET /dashboard` 200 y `GET /plataforma/empresas` 200. Antes del arreglo, en este caso fallaba el `POST /login`. No pidió OTP: el dispositivo ya estaba confiado desde la corrida 1, y por eso el script dio timeout esperando el campo del código, pero la sesión entró.
- **Hallazgo nuevo, no arreglado (fuera de este encargo):** con el superadmin dentro, la shell llama cada cierto tiempo a la action `listarNotificaciones` (`lib/actions/notificaciones.ts:108`). Cae con `EmpresaNoResuelta: Sin empresa en contexto para Notificacion.findMany` y responde `POST /plataforma/empresas 500`; lo vi 4 veces en unos 2 minutos. No es el ALS: el superadmin no tiene empresa y esa lectura no es de plataforma. Decide el leader: o la shell del superadmin no pide notificaciones, o la action devuelve vacío para él.
- No repetí la prueba real con la mutación: el rojo previo ya lo evidenció el frontend_dev en las mismas dos variantes.
- Limpieza: dev server matado, nada escuchando en el 3000, logs borrados (Next registra los argumentos de las actions, contraseña incluida), script borrado, `.next` borrado, `sl32_als` borrada (queda `sl32_base`), `gate.lock` soltado.
- MCP del grafo: no lo usé. Trabajé con Grep y Read.

**Llevar a `dev`:** el bug es de SL-17, que ya está en `dev`. Hay que llevar este cambio (`lib/db/contexto-empresa.ts` y el test) también a `dev` o a un hotfix, no solo con SL-32.

**Veredicto:** el contexto de SL-17 ya es único por proceso; el login real llega a `/plataforma/empresas` con 200 en las dos variantes. Queda abierto el 500 de `listarNotificaciones` para el superadmin.

## T15 — el marco del superadmin sin 500 — backend_dev — 2026-10-23 — HECHO

**Causa.** La campana (`components/shared/NotificationsBell.tsx`, en el `PageHeader` de todas las páginas) sondea `listarNotificaciones` cada ~30 s; `notificacion` es tabla de negocio y el superadmin no tiene empresa → `EmpresaNoResuelta` → `POST /plataforma/empresas 500`. Mismo problema que el layout de T15 (design `> El marco del portal para el superadmin`).

**Censo del marco** (lo que se dispara en cualquier página del superadmin):
- Campana: `listarNotificaciones`, `marcarTodasLeidas`, `descartarNotificacion` (`lib/actions/notificaciones.ts`) → tablas `notificacion`/`notificacion_lectura`.
- Interruptor de avisos dentro de la campana, `PushReactivacion` del layout y `LogoutButton` (vía `lib/pwa/baja-push.ts`): `obtenerClavePublicaPush`, `registrarSuscripcionPush`, `olvidarPreferenciaDeAvisos`, `eliminarSuscripcionPush` (`lib/actions/push.ts`) → `push_suscripcion`/`usuario_preferencia`.
- Sin cambio: `/api/asistente` ya rechaza al superadmin (no está en `ROLES_AYUDA`) antes de tocar `asistente_uso_diario`, y el «?» no se pinta para él; `TemaProvider` escribe una cookie, sin servidor; `Sidebar`, `AyudaProvider` y `AvisoVersionNueva` no llaman a actions. No hay búsqueda global en el marco. `notificarCargaMasivaTerminada` no es del marco (solo `/ordenes`): no se tocó.

**Arreglo** (en la action, que es donde estos archivos autorizan; sin `comoPlataforma`; LF conservado). Para `esPlataforma(actor.rol)`, sin construir servicio ni repositorio:
- `listarNotificaciones` → `{ ok, items: [], noLeidas: 0, porHacer: 0 }`; `marcarTodasLeidas` → `{ ok, marcadas: 0 }`; `descartarNotificacion` → valida el id primero (R36 intacto) y luego `forbidden`, el mismo desenlace que el servicio da a quien descarta una que no ve.
- `obtenerClavePublicaPush` → `clavePublica: null` («sin canal»: el interruptor no se ofrece); `registrarSuscripcionPush` → `forbidden` (un `ok` haría creer al navegador que quedó registrado; con el rechazo `alta-push` deshace la suscripción); `olvidarPreferenciaDeAvisos` y `eliminarSuscripcionPush` → `ok` sin escribir (el cierre de sesión sigue saliendo).

**Archivos:** `lib/actions/notificaciones.ts`, `lib/actions/push.ts`; test nuevo `tests/unit/actions/marco-superadmin-sin-empresa.test.ts` (9 casos: 7 de plataforma con dobles que lanzan y apuntan si alguien los llama, y 2 contrapruebas con `maestro` que sí llegan al servicio/clave).

**R → test:** R6 → `marco-superadmin-sin-empresa.test.ts` (los 7 casos del superadmin).

**Mutaciones** (aplicada, corrida, restaurada, `cmp` IDÉNTICO):
- `sinNotificacionesDeEmpresa` → `return false`: `3 failed | 6 passed` (listar, marcar todas, descartar).
- `sinCanalDeEmpresa` → `return false`: `4 failed | 5 passed` (clave, registrar, olvidar, eliminar).

**Salida real**
- `pnpm run typecheck` con `gate.lock`: primer intento `TC_EXIT=2`, 48 `error TS`, todos de `superadmin` fuera de `RolValue` (otro worktree había regenerado el cliente); `prisma generate` dentro del lock y de nuevo: `TC_EXIT=0`, 0 `error TS`.
- `pnpm exec eslint` de los 3 archivos: «No issues found», exit 0.
- `pnpm exec vitest related --run` de los 3 archivos: `Test Files 88 passed (88)`, `Tests 1089 passed | 26 skipped (1115)`.
- Guardias `superadmin-fuera-de-empresa`, `plataforma-solo-en-lista`, `superficie-de-uso`: `3 passed`, `38 passed`.

**Prueba real** (base `sl32_notif`: `migrate deploy` + `db:seed`; nada escuchando en el 3000; `gate.lock` tomado; `rm -rf .next`; `pnpm dev` sin SMTP, log al scratchpad; superadmin ficticio con `pnpm arranque:superadmin` → «Superadmin creado.» tras regenerar el cliente, porque el primer intento dio `PrismaClientValidationError` por el mismo cliente sin `superadmin`; login por `/login` con Playwright y el OTP del asunto del `ConsoleEmailSender`):
- `/plataforma/empresas` → 200, y 95 s quieto ahí: `POST /plataforma/empresas 200` ×3 (los sondeos de la campana, antes 500).
- `/dashboard` → 200, URL final `/plataforma/empresas` (h1 «Empresas»). `/configuracion` → 200, h1 «Configuración», con su `POST /configuracion 200` de la campana.
- En el log: 0 respuestas 500, 0 `EmpresaNoResuelta`, 0 `⨯`/`Error:`. El navegador vio 0 respuestas ≥ 500.
- Limpieza: server matado (`taskkill /T`), 3000 libre (solo `TIME_WAIT`), log y script borrados (el log guarda argumentos de actions con contraseña), `.next` borrado, `sl32_notif` borrada (queda `sl32_base`), `gate.lock` soltado.
- Nota: `sl32-db.mjs create` falló (`SASL: client password must be a string`) porque lo llamé antes de cargar `sl32-env.sh`; `migrate deploy` creó la base él mismo. El `drop` posterior, con el env cargado, sí funcionó.
- MCP del grafo: no lo usé; Grep y Read.

**Veredicto:** el marco del portal ya no da 500 para el superadmin: la campana y el canal de avisos devuelven su desenlace vacío sin tocar tablas de empresa, probado 95 s en real.

## T9 y T17 — segunda vuelta, frontend_dev — 2026-10-23 — HECHO

**Preparación.** Nada en el 3000 ni ningún `next dev` vivo (solo el servidor de context-mode y un `vitest` de otro worktree). `gate.lock` tomado durante toda la corrida. Base `sl32_e2e`: `create` + `migrate deploy` + `db:seed`, y `prisma generate` dentro del lock. `rm -rf .next`. `pnpm dev` sin `SMTP_*` (el worktree no tiene `.env`), con el log al scratchpad y `SL17_HUMO_LOG_SERVIDOR` apuntando a él. Specs con `--reporter=list`.

**Archivos** (sin commitear, LF)
- `e2e/_superadmin-fixture.ts`: `olvidarDispositivos` borra también los `loginAttempt` del usuario.
- `e2e/superadmin-arranque.spec.ts`: el paso 4 cambia según la decisión del implementer. Ahora `/configuracion` debe dar 200, mostrar el `alert` «No tienes permiso para acceder a esta sección.», no tener ningún enlace de configuración (ni por nombre ni `a[href^="/configuracion"]`) y no mostrar el 404.
- `e2e/superadmin-empresas.spec.ts`: el `afterAll` borra antes `loginAttempt`, `trustedDevice` y `emailOtpChallenge` de los maestros. Sus FK a `usuario` no son en cascada, y sin esto la corrida siguiente no vería el estado vacío.
- `specs/SL-32-rol-superadmin/tasks.md`: desviación del paso 4 anotada junto a T9; `[x]` en T9 y T17.

**Fallo de la corrida 1 (del spec, no de la app).** Resultado: `1 failed | 5 did not run | 3 passed`. T9 pasó entero. El `beforeAll` de T17 esperaba el campo «Código de verificación», pero el superadmin entró sin OTP. Causa: `RiskEngine` pide OTP solo si el riesgo llega a 50. El dispositivo no reconocido suma 40 y la IP no reconocida 30. T9 acababa de entrar con éxito desde 127.0.0.1, y la IP ya quedaba reconocida (`loginAttempt.exitoso`). Borrar solo `trustedDevice` no bastaba. Arreglo en el fixture (arriba).

**Salida real de Playwright**
- T17 solo, tras el arreglo: `6 passed (16.8s)`.
- Corrida 1 de los dos specs: `9 passed (19.0s)`, `PW_EXIT=0`.
- Corrida 2 de los dos specs, seguida: `9 passed (21.1s)`, `PW_EXIT=0`.
- T17 solo, tras revertir la mutación: `6 passed (19.2s)`.
- Log del dev server en todas las corridas: 0 respuestas 500 y 0 `EmpresaNoResuelta`. Hubo dos `⨯ Error: aborted` (`ECONNRESET`): son peticiones que el navegador cortó al cerrar su contexto. `GET /plataforma/empresas`: 47 respuestas 200 y 6 respuestas 404, las de los maestros.
- T17 cubre los pasos 1-6. Los maestros A y B entran los dos por «¿Olvidaste tu contraseña?» y luego por `/login` con OTP. Se comprueban los textos literales de T12: aviso, vacío, errores de slug, email y documento, y «Revisa este campo.».

**Mutación** (`app/(app)/plataforma/empresas/page.tsx:28`, `!esPlataforma(actor.rol)` → `!(() => true)()`): T17 da `1 failed | 1 did not run | 4 passed`. Cae el paso 5 del maestro A en `superadmin-empresas.spec.ts:290`, donde no ve el 404. El de B no corre, por el modo serial. Revertida con `cmp`: IDÉNTICO.

**Correo real** (base `sl32_mail`: migrada y sembrada; superadmin ficticio con `pnpm arranque:superadmin` → «Superadmin creado.»; `SMTP_*` de la `.env` principal exportados por `smtp-env.mjs` sin imprimirse; salida filtrada por `scratchpad/sl32mail/tapar.mjs`)
- `correo-real.ts` daba `TransformError`: tsx lo compila como CJS y no admite el `await` de primer nivel. Renombrado a `.mts`.
- El script da de alta las empresas A y B por el servicio de SL-17, no por la pantalla. Después pide «recuperar contraseña» por `PasswordResetService` con el emisor real.
- Alta A `creada`. Envío a el primer correo de prueba local (buzón desechable, el que fijó el leader): aceptado, `messageId` presente (48 car.).
- Alta B `creada`. Envío a el segundo correo de prueba local: aceptado, `messageId` presente (48 car.).
- No se leyó la bandeja.

**Comandos**
- `pnpm run typecheck` (con el cliente regenerado y el lock tomado): `TC_EXIT=0`, 0 `error TS`.
- `pnpm exec eslint` de los 3 archivos de `e2e/`: exit 0.

**Limpieza.** Dev server matado (`matar-dev.ps1`): «nada en 3000». Logs borrados (`dev.log` guarda los argumentos de las actions, contraseñas incluidas), y también los de Playwright y typecheck. Borrados `.next` y `test-results`. `sl32_e2e` y `sl32_mail` borradas: queda `sl32_base`. `gate.lock` soltado.

**Grafo:** no usé el MCP; trabajé con Grep y Read.

**Veredicto:** T9 y T17 en verde dos veces seguidas y juntos. La mutación de `esPlataforma` tumba el paso 5. El correo real de recuperación lo aceptó el SMTP para los dos maestros.

## T10 — cierre: deudas y mapa R → test (implementer) — 2026-10-23

**Deudas.** D7 queda RESUELTA en `progress/deudas.md` con la decisión del 2026-10-22, sin deuda nueva. P8 se resolvió con SMTP (Brevo), no con `AUTH_OTP_DEBUG_LOG`: no entra deuda. Siguen abiertas, sin cambio: D12 (`actualizarDistritosEspeciales` escribe `distrito.zona_especial` desde Tarifas; la decisión es de producto) y D15 (P7: rama del superadmin en geografía).

**Mapa R → test** (todos los archivos existen en la rama; comprobado con un barrido de las rutas del mapa de `tasks.md`):

| R | Test |
|---|---|
| R1, R2 | `tests/unit/types/roles.test.ts`, `tests/unit/scripts/seed-catalogos.test.ts`; migraciones verificadas en T3 |
| R3, R4, R5 | `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts`, `tests/unit/auth/plataforma.test.ts` |
| R6 | `tests/unit/auth/menu-visibility.test.ts`, `tests/unit/auth/destino-post-login.test.ts`, `tests/integration/app-layout-superadmin.test.tsx`, `tests/unit/actions/marco-superadmin-sin-empresa.test.ts`, `e2e/superadmin-arranque.spec.ts` |
| R7 | `tests/unit/analytics/productos-alcance.test.ts`, `tests/unit/analytics/conteo-productos-action.test.ts`, `tests/unit/analytics/alcance-fuente-unica.guardia.test.ts`, `tests/unit/asistente/tope-diario.test.ts` (AsistenteService) |
| R8, R9, R11 | `tests/unit/services/usuario-service-superadmin.test.ts` |
| R10 | `tests/integration/db/usuarios-sin-superadmin.test.ts`, `tests/unit/types/usuario-schema.test.ts`, `tests/unit/actions/usuarios.test.ts` |
| R12–R15, R17 | `tests/integration/db/arranque-superadmin.test.ts`, `tests/unit/services/arranque-superadmin-service.test.ts` |
| R16 | `tests/unit/services/arranque-superadmin-service.test.ts`, `tests/unit/scripts/arranque-superadmin.test.ts` |
| R18 | `e2e/superadmin-arranque.spec.ts` |
| R19 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R20 | `tests/unit/guards/env-example-sin-valores.guardia.test.ts` y `tests/unit/guards/recursos-origen-fuera.guardia.test.ts`; README por revisión del diff (corregido tras review m3) |
| R21 | `tests/integration/db/migracion-sl32-ida-y-vuelta.test.ts` (review B1), además de la verificación de T3 |
| R22, R23 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` |
| R24, R25 | `tests/unit/services/geografia-service.test.ts`, `tests/unit/actions/geografia-action.test.ts`, `tests/integration/db/geografia-registro-accion.test.ts`, `tests/integration/db/geografia-cascada-reversible.test.ts`, guardia de T6 (rama del superadmin con dobles, P7/D15) |
| R26 | `tests/unit/components/geografia-admin-page.test.tsx`, `tests/unit/auth/menu-visibility.test.ts`, revisión del diff de la ayuda (T1b) |
| R27 | `tests/integration/db/un-solo-superadmin.test.ts`, `tests/integration/db/arranque-superadmin.test.ts`, `tests/unit/services/usuario-service-superadmin.test.ts` |
| R28 | `tests/integration/db/usuario-empresa-o-superadmin.test.ts` |
| R29 | `tests/components/empresas-module.test.tsx`, `tests/integration/db/empresas-plataforma.test.ts`, `e2e/superadmin-empresas.spec.ts` |
| R30–R34 | `tests/components/empresas-module.test.tsx`, `e2e/superadmin-empresas.spec.ts` |
| R35 | `tests/integration/empresas-page.test.tsx`, `tests/unit/actions/alta-empresa-rol.test.ts`, `tests/unit/services/empresas-plataforma-service.test.ts`, `e2e/superadmin-empresas.spec.ts` |
| R36 | `tests/unit/auth/menu-visibility.test.ts`, `tests/unit/auth/destino-post-login.test.ts`, guardia de T6 |
| R37 | `tests/components/empresas-module.test.tsx`, `e2e/superadmin-empresas.spec.ts` (los dos maestros entran) |
| R38 | `tests/integration/login-form-reset-link.test.tsx`, `tests/integration/recuperar-contrasena-page.test.tsx`, `tests/unit/actions/password-reset-degrada-a-consola.test.ts` |

**Desviaciones del spec, consolidadas**
- Base adelantada sobre la rama de SL-17 (T0); SL-17 entró luego en `dev` y se hizo merge de `origin/dev`.
- Migraciones con timestamps `20261023100000/100100/100200` (detrás de `20261023090000_unicos_por_empresa`, no de `…130300`).
- La action de SL-17 responde `no_autorizado`, no `forbidden`.
- «Empresas» va justo antes de «Mi bodega» y «Ayuda», no al final (contratos de `menu-ayuda` y `menu-mi-bodega`).
- `/configuracion` al superadmin: 200 con «No tienes permiso…», no 404 (R5 lo admite).
- Arreglos fuera del spec, evidenciados con el dev server real: el `AsyncLocalStorage` de `lib/db/contexto-empresa.ts` pasa a `globalThis` (bug de SL-17, `c04da42`, **hay que llevarlo a `dev`**), y las actions de notificaciones y push del marco no leen tablas de empresa para el superadmin (`fe72cba`).
- D19 de SL-17 (humo de dos empresas por la pantalla) queda pendiente: ver sección «T9 y T17».

## Gates de las tandas 3–8 (implementer) — 2026-10-23

`TEST_RAPIDO_BASE=dev ./init.sh` dentro de `gate.lock`, tras `prisma generate`, con `INIT_EXIT` escrito en el log:
- tanda 3 (T3, `5833762`): sin gate propio. El typecheck salía rojo por las tablas `Record<RolValue>` de T4, así que se cerró con la 4a.
- tanda 4a + merge de `dev` con SL-17 (`2c361ce`): `INIT_EXIT=0`. En CI del PR #4, `gate-completo` pass.
- tanda 4b (`4b94332`): la 1.ª corrida dio `INIT_EXIT=1`, con un timeout de 20 s en `fuera-datos-ordenex` > no-vacuidad bajo carga (solo pasa en 3,5 s). La 2.ª dio `INIT_EXIT=0`.
- tanda 5 (`ef449d5`): `INIT_EXIT=0`.
- final (`f8210c6`): la 1.ª corrida dio `INIT_EXIT=1` por la guardia SL-34, que veía los correos de prueba en esta bitácora; se reescribieron. La 2.ª dio `INIT_EXIT=0` (`Tests 15734 passed`; guardias `4081 passed`).
- CI sobre `f8210c6` (`workflow_dispatch`, porque el PR está en draft): `gate-completo`, `estatico` y los 3 shards de vitest, success. El job `e2e` sale failure con 49 failed, 28 did not run y 3 passed, en 24 specs heredados. Los dos de SL-32 y `dos-empresas-humo` de SL-17 caen porque CI no define `SL17_HUMO_LOG_SERVIDOR`, el log del dev server del que se lee el OTP. En local pasan (sección «T9 y T17 — segunda vuelta»).

## Review vuelta 1 — B1 y m4 — backend_dev — 2026-10-23 — HECHO

Base: rama en `ff306a5`. Las tres migraciones `20261023100000/100100/100200` NO se han tocado (aplicadas en QA): `git diff --quiet -- db/migrations` limpio al acabar. `sl32_base` recreada y migrada (`migrate deploy`: «All migrations have been successfully applied»).

### Archivos
- Nuevo `tests/integration/db/migracion-sl32-ida-y-vuelta.test.ts` (B1, R21).
- Nuevo `tests/integration/db/_fixtures/ida-y-vuelta-32.ts`: base propia, SQL sentencia a sentencia, foto de catálogos. Copia del método de `migracion-sl17-ida-y-vuelta.test.ts`, porque importar un archivo de test registra sus `describe`. Unificar los dos queda como cambio aparte: no toca SL-17.
- `lib/services/email/plantillas/otp-codigo.ts`: el asunto pasa a `Tu codigo de verificacion de ${MARCA.nombre}`, sin el código (m4). Es la única plantilla de `plantillas/`.
- `lib/services/email/ConsoleEmailSender.ts`: la línea de debug pasa a ser una sola y lleva el destinatario (formato abajo). La de metadata (asunto) sigue igual y ya no fuga.
- `tests/unit/services/email-notificacion.test.ts`: tres casos nuevos, con el correo REAL de la plantilla. Los de antes usaban un mensaje sintético con `subject: "asunto"`, y por eso no veían la fuga.
- `README.md`: «El log recoge el destinatario y el asunto, que no lleva el código. El código solo se imprime con `AUTH_OTP_DEBUG_LOG=1`…». Ahora es cierto.

### R → test
| R | Test |
|---|---|
| R21 (down.sql y orden) | `migracion-sl32-ida-y-vuelta.test.ts` > «cada una trae su down.sql y van en orden detras de 20261023090000_unicos_por_empresa» (estático, sin base) |
| R21 (down 3.ª con superadmin) | ídem > «con el superadmin dentro, el down de la 3.ª va bien…» |
| R21 (down 2.ª aborta) | ídem > «…el down de la 2.ª aborta con P0001 y no borra nada»: el SQLSTATE es `P0001`, el usuario, el índice y la fila `rol` siguen, y la foto no cambia |
| R21 (downs 2.ª y 1.ª) | ídem > «sin el superadmin, los downs…»: el enum es exactamente `maestro,admin,mensajero,Admin Tienda,adminSatelite,apiKey`, sin `rol_value_old`, sin índice ni CHECK, y la foto es igual a la de antes de SL-32 |
| R21 (reaplicar) | ídem > «reaplicadas las tres…»: el índice (`UNIQUE`, `(true)`, id literal) y el CHECK vuelven igual que la 1.ª vez, y la foto es igual a la de «con las tres» |
| m4 | `email-notificacion.test.ts` > «SL-32 m4 — el asunto … no lleva el codigo; el cuerpo, en texto y html, si», «… sin AUTH_OTP_DEBUG_LOG … no escribe el codigo … por ningun canal», «… con AUTH_OTP_DEBUG_LOG=1, una sola linea con destinatario y codigo…» |

Base propia `sl32_iv_<12 hex>`: se crea en el `beforeAll` aplicando las migraciones anteriores, y se borra en el `afterAll` con `DROP … WITH (FORCE)`. No usa la base compartida ni el lock de `superadmin-32.ts`, así que no choca con otras suites. Al acabar, `sl32-db.mjs list` → solo `sl32_base`.

### La línea de debug (para el frontend_dev que adapte `e2e/_superadmin-fixture.ts`)
Sin `AUTH_OTP_DEBUG_LOG=1`, la consola NO imprime el código por ningún canal. Con `=1`, el `ConsoleEmailSender` escribe dos líneas:
- por **stdout** (`console.info`), siempre, y sin el código:
  `[email] sin SMTP configurado; no se envia. to=<destinatario> asunto="Tu codigo de verificacion de Servi Logistic"`
- por **stderr** (`console.warn`), solo con el flag. Es UNA línea, y el cuerpo va como literal JSON, con los `\n` escapados:
  `[email][debug] to=<destinatario> cuerpo=<JSON.stringify(text)>`

  Ejemplo con un código ficticio:
  `[email][debug] to=ana@example.com cuerpo="Tu codigo de verificacion de Servi Logistic es:\n\n123456\n\nVence en 10 minutos y solo sirve una vez.\nSi no solicitaste este codigo, ignora este mensaje y no lo compartas con nadie."`

  Regex sugerida (con el email escapado): `` `\[email\]\[debug\] to=${email} cuerpo="[^"]*?\\n(\d{6})\\n` ``. Es decir, el código son los seis dígitos entre el primer `\n\n` y el siguiente `\n`, ambos literales.
- La línea de debug lleva el destinatario porque stdout y stderr no garantizan el orden en un log mezclado. El formato lo fija `email-notificacion.test.ts` (último caso), y es contrato.
- **Rotura conocida, NO arreglada aquí:** `e2e/_superadmin-fixture.ts:87` busca el código en `asunto="…(\d{6})"`, y ya no lo encuentra. Afecta a `superadmin-arranque.spec.ts` y `superadmin-empresas.spec.ts`. El servidor del E2E necesitará `AUTH_OTP_DEBUG_LOG=1`, y el log, capturar stderr.
- `_dos-empresas-fixture.ts` NO lee el log: usa su propio emisor en proceso (líneas 202-206) y no depende del asunto.

### Mutaciones (todas revertidas; `git diff --quiet` y `cmp` idénticos)
| Mutación | Cómo | Resultado |
|---|---|---|
| Quitar el bloque `DO $$…END $$;` del down de la 2.ª | Script node sobre el archivo del árbol, test, y luego `git checkout -- db/migrations/20261023100100_seed_rol_superadmin/down.sql` y `git diff --quiet -- db/migrations` → RESTAURADO | **1 failed** | 4 passed: `expected '23001' to be 'P0001'` (el DELETE de `rol` choca con la FK) |
| Enum del down de la 1.ª en otro orden (`'admin','maestro',…`) | `sed -i` en el árbol, test, `git checkout --` y `git diff --quiet` → RESTAURADO | **2 failed** | 3 passed |
| Volver a meter `${code}` en el asunto de `otp-codigo.ts` | `sed -i`, test, y restaurar desde copia (`cmp` idéntico) | **3 failed** | 11 passed |
| Línea de debug de vuelta a `cuerpo:\n${text}` (multilínea, sin `to=`) | ídem | **1 failed** | 13 passed |
| Borrar el `down.sql` de la 3.ª (para el caso estático) | **No se hizo**: el clasificador de permisos denegó el `rm` de un archivo de migración. El caso estático no tiene mutación medida | — |

### Salida real
- `pnpm exec vitest run tests/integration/db/migracion-sl32-ida-y-vuelta.test.ts` (sobre `sl32_base`) → `Tests  5 passed (5)`, EXIT=0
- `pnpm exec vitest run tests/unit/services/email-notificacion.test.ts tests/unit/actions/password-reset-degrada-a-consola.test.ts` → `Tests  18 passed (18)`
- `pnpm run typecheck` (con el lock y `prisma generate`) → `tsc --noEmit`, TC_EXIT=0
- `pnpm exec eslint` de los 5 archivos tocados → ESLINT_EXIT=0
- `pnpm exec vitest related --run` (los dos de `lib/services/email/` y el fixture) → `Test Files  60 passed (60)`, `Tests  647 passed | 26 skipped (673)`, EXIT=0
- `pnpm run test:guardias` → 4 failed, todos en `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`: «init.sh ya no tiene el marcador >>> FIN PASO 2…». Está en `tests/baseline-rojos.json` y esta tanda no toca `init.sh`, `scripts/` ni `package.json`. El resto: 4092 passed.

Veredicto: B1 cubierto (R21 con test de integración y estático, y la mutación del `DO` en rojo); m4 cerrado en la app. Queda pendiente el parseo del E2E por el frontend_dev.

**Mutación del caso estático de B1** (implementer, 2026-10-23): se apartó a mano `db/migrations/20261023100200_usuario_empresa_o_superadmin/down.sql` fuera del árbol → `× cada una trae su down.sql…`, `Tests 1 failed | 4 skipped (5)` (sin base). Devuelto a su sitio: `git status --porcelain db/migrations` vacío, `Tests 1 passed | 4 skipped (5)`.
