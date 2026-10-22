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
