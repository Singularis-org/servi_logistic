# impl SL-32 — Rol superadmin y su usuario de arranque

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
- P7: diferida a SL-26, en `progress/deudas.md > D10`. No se resuelve aquí.
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
  - `progress/deudas.md` (D10);
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
