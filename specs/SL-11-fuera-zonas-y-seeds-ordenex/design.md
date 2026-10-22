# SL-11 — Diseño

## Lo que ya existe

Se buscó en el board (`feature_list.json`, todas las fichas), en `specs/` y en el código. Los
términos fueron `seed`, `semilla`, `superadmin`, `db:seed`, `zona`, `sinpe`, `maestro`,
`fksDeOrden`, `xlsx` y `ordenex`. El MCP del grafo no estaba entre las herramientas de este agente,
así que el código se buscó con Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solapes parciales: SL-14/15 (listan `seed-maestro.ts` y `seed-usuarios-qa.ts`), SL-17 (`organizacion_id`), SL-20/22 (geografía y SINPE por país), SL-31 (tests con datos propios y CI), SL-32 (rol superadmin y su usuario de arranque) | SL-11 retira los dos archivos de seed. SL-32 crea el primer usuario. SL-15 se queda con el resto de «Ordenex» en migraciones y en `db/schema.prisma`. SL-31 se queda con los otros tests y con la base en CI. |
| Código | No existe ningún rol `superadmin`. `maestro` es un rol con otros permisos (decisión del humano) | SL-11 no crea usuarios de ningún rol. |
| `scripts/seed-catalogos.ts` (`db:seed`) | Catálogos del sistema, idempotentes | Se queda: los catálogos son parte del producto. |
| Migraciones de catálogo | `rol` (`20260711000000`, `20260710130000`, `20260716150000`), `order_status` (varias), `tipo_identificacion 'cedula'` (`20260709120000`, la única que la inserta) | Los fixtures se apoyan en ellas: no necesitan `db:seed`. |
| `tests/integration/db/_postgres-real.ts` | `fksDeOrden()` lee la **primera orden existente** de la base. La usan 72 archivos | No se toca; los `zona-*` dejan de usarla (D6). |
| `tests/integration/db/_fixtures/` | Fixtures por ficha (`caja-459.ts`, `personas-461.ts`, `escrituras-459.ts`) | Se añade uno compartido, mínimo (D6). |

### Medición

**Scripts `db:seed*` de `package.json`.**
- `db:seed` (catálogos) se queda.
- Salen los otros tres:
  - `db:seed:maestro`: lo piden el README y 13 mensajes de tests;
  - `db:seed:usuarios`: lo pide 1 mensaje (`premio-ranking-devengo-migration.test.ts:437`);
  - `db:seed:zonas`: lo piden 4 mensajes de los `zona-*`.

**Archivos que salen y quién los usa.**

| Archivo | Lo importa o lo lee | Qué pasa |
|---|---|---|
| `scripts/seed-zonas.ts` | 3 tests propios; el test de la carga masiva; la guardia de `NEXT_PUBLIC_SINPE` | los 3 se borran; los otros dos se adaptan |
| los xlsx y las notas de `public/` | solo `seed-zonas.ts` y sus tests; ningún archivo de `app/`, `lib/`, `components/` ni `public/sw.js` | se borran |
| `04_insert_zonas_pago_distrito.sql` | solo el comentario de la migración `20260713010000` | se borra |
| `scripts/seed-usuarios-qa.ts` | nadie | se borra |
| `scripts/seed-maestro.ts` | `README.md > Usuario maestro (bootstrap)` y los mensajes de los tests; ningún código lo importa | se borra; el README y los mensajes se ajustan |
| `scripts/seed-sinpe-inicial.ts` | `scripts/migrate-deploy.ts:138` (`sembrarSinpe`), `tests/unit/scripts/seed-sinpe-inicial.test.ts`, `tests/integration/db/zona-sinpe-migration.test.ts` y la guardia de `NEXT_PUBLIC_SINPE` (allowlist) | se borra (D3) |

**Migraciones que siembran datos de negocio, o que son de Ordenex.**
- `20260709120000_seed_maestro_user` inserta el usuario «Maestro Ordenex» `admin@ordenex.test`, con
  un hash bcrypt fijo, **y** los catálogos `rol maestro` y `tipo_identificacion cedula`.
- `20260720150000_drop_default_maestro_user` solo existe para neutralizar ese usuario.
- `20260713010000_seed_zonas_pago_distrito` inserta las 7 zonas de Ordenex y 117 vínculos. Es la
  **única** migración con `INSERT INTO "zona"`.
- `20260905175156_geografia_dta_2026_distritos_faltantes` hereda la zona de los distritos hermanos.
  Sobre una base sin zonas inserta 0 filas: se queda.
- **Geografía de CR:** `20260713005000`, `20260905175156` y `20260907120000`. Se quedan.

**Por qué el SINPE inicial sobra.**
- `20260918120200_zona_sinpe_no_nulo` aborta solo si existe una zona con SINPE nulo.
- En una base nueva, las únicas zonas que existen en ese punto son las 7 de `20260713010000`: las
  columnas nacen en `20260918120100`, nullables, y ninguna otra migración crea zonas.
- Fuera esa migración, la tabla está vacía y el `DO` no aborta nunca. `seed-sinpe-inicial` y el
  desatasco P3009 de la ficha 432 se quedan sin caso.
  - El desatasco son `MIGRACIONES_AUTO_RESOLUBLES`, `decidirAutoResolucion`, `sembrarSinpe` y
    `resolverMigracionRevertida`.
  - Su propio comentario lo dice: «CADUCA…» (`scripts/migrate-deploy-guardas.ts:130`).
  - No existe ninguna base desplegada que lo necesite.
- El número y el titular de una bodega son dato de cada empresa: se cargan desde la aplicación.

**Citas en `specs/` que deciden qué se puede borrar.** `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`
lee las filas `| R<n> |` de los `tasks.md` y `design.md`.
- `specs/278-plantilla-carga-masiva-v3/tasks.md:147` cita el test de la carga masiva en la fila R4.
  **Se adapta, no se borra.**
- Los cinco tests que se borran (D7) solo aparecen en `requirements.md`, que la guardia no lee, o
  sin extensión (`specs/24-gestion-zonas/design.md`, `seed-zonas.test`). Comprobado con Grep.

**E2E.** `wallet.spec.ts`, `mis-asignaciones.spec.ts`, `recepcion-satelite.spec.ts`,
`devolucion-origen.spec.ts` y otros declaran una «PRECONDITION (seed)» manual.
- Ningún seed de los que salen los alimentaba.
- `gate.yml` solo migra la base del E2E, y el job corre solo en el PR a `prod`.
- SL-11 no los rompe ni los arregla (pregunta abierta 1).

## Decisiones técnicas

**Lo que no aplica:**
- Tablas nuevas, RLS, rutas y autorización: no hay.
- Multi-empresa: los fixtures viven en tablas heredadas sin `organizacion_id`. Queda **pendiente de
  la fase 2** (SL-17).

**Datos que dependen del país:**
- La geografía de CR sigue llegando por migración: es «la geografía del país de serie».
- El SINPE deja de tener valor de serie: lo pone cada empresa.
- Los fixtures usan un SINPE inventado válido para el `CHECK` (`80000000`, el que ya usan los
  tests) y un `montoCobrar` entero.

### D1 — Sin usuarios de serie (R1, R2, R5, R17)

- **Se borran** `scripts/seed-maestro.ts` y `scripts/seed-usuarios-qa.ts`.
- **`package.json`:** salen `db:seed:maestro`, `db:seed:usuarios` y `db:seed:zonas`. No entra
  ningún script nuevo.
- **`README.md`:**
  - «Base de datos» queda en dos comandos: `pnpm exec prisma migrate deploy` y `pnpm db:seed`;
  - una nota: «si tu base local es anterior al 2026-10-21, `pnpm exec prisma migrate reset`»;
  - se quita la sección «Usuario maestro (bootstrap)», también su párrafo sobre `20260720150000`;
  - en su lugar, una línea: «la app nace sin ningún usuario; el primero, el superadmin, llega con
    SL-32».
- Con esto, la app arrancada **no tiene con quién iniciar sesión** hasta SL-32. R17 lo verifica
  como hecho medido: `/login` responde, y la tabla `usuario` está vacía. No prueba un login.

### D2 — Migraciones editadas (R5–R8)

Se editan en sitio por la decisión del humano del 2026-10-21: no hay ninguna base desplegada.

| Migración | Cambio |
|---|---|
| `20260709120000_seed_maestro_user` | Se quita el `INSERT INTO "usuario"`. Se quedan los dos inserts de catálogo (`rol maestro`, `tipo_identificacion cedula`), que nadie más hace. La cabecera se reescribe sin «Ordenex» y explica que solo asegura esos catálogos. `down.sql` pasa a no hacer nada, con un comentario: nunca borró los catálogos, y ya no hay usuario que borrar. **El nombre de la carpeta se mantiene**, para no mover el orden ni el identificador. |
| `20260720150000_drop_default_maestro_user` | **Se borra la carpeta.** Su único objeto era neutralizar el usuario que ya no se inserta. |
| `20260713010000_seed_zonas_pago_distrito` | **Se borra la carpeta.** Solo siembra datos de Ordenex. |
| `20260918120200_zona_sinpe_no_nulo` | El `RAISE EXCEPTION` pasa a: «hay bodegas sin SINPE: complétalo en cada bodega desde la aplicación y vuelve a aplicar esta migración». Sin nombrar scripts ni variables (R8). La cabecera deja de describir el orden de 3 pasos con siembra. El SQL ejecutable (`NOT NULL`, `CHECK`) no cambia. |
| `20260918120100_zona_sinpe` (`migration.sql` y `down.sql`) | Solo los comentarios que nombran `seed-sinpe-inicial.ts`. |

**Lo que no se toca:**
- No se consolida nada.
- No se tocan los comentarios rancios de otras migraciones que citan las notas o los xlsx: no
  contienen «Ordenex» ni ejecutan nada.
- El resto de «Ordenex» en migraciones y en `db/schema.prisma` va a SL-15.

### D3 — Fuera el SINPE inicial y el desatasco (R9, R10)

- **Se borra** `scripts/seed-sinpe-inicial.ts`.
- **`scripts/migrate-deploy.ts`:**
  - salen `sembrarSinpe` y `resolverMigracionRevertida` de `EfectosDelPaso` y de `efectosReales`;
  - sale la rama `auto.resolver` del `catch`;
  - el fallo de `migrate deploy` va directo al camino actual: aviso de timeout si es `SIGTERM` y
    `salir(1)`;
  - la captura de la salida y la siembra de jobs recurrentes no cambian.
- **`scripts/migrate-deploy-guardas.ts`:** salen `MIGRACIONES_AUTO_RESOLUBLES`,
  `DecisionAutoResolucion` y `decidirAutoResolucion`.
- **Guardia de `NEXT_PUBLIC_SINPE`:**
  - `PERMITIDOS` queda vacía;
  - sale el caso que leía `scripts/seed-zonas.ts`;
  - se queda la contraprueba de inyección.
- **`tests/unit/guards/prisma-client-sin-adaptador.guardia.test.ts`:** sale el caso «sembrarSinpe
  usa la fábrica de la app», cuyo sujeto desaparece; los demás casos se quedan.
- **`tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`** sigue verde sin cambios: es la
  prueba de la segunda mitad de R9. La primera la cubre la guardia de D7.

### D4 — El test de la carga masiva (R15)

`tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts` sigue siendo estático.

- Las ternas existentes salen del texto de `20260713005000_seed_geografia_cr/migration.sql` y de
  `20260905175156_*`: se parsean las líneas `INSERT INTO "distrito" … '<distrito>' … p."nombre" =
  '<provincia>' AND c."nombre" = '<canton>'`.
- El normalizador es `normalizeZonaKey`.
- **Anti-vacuidad:** el conjunto tiene 494 ternas, y el parser se prueba sobre una línea literal de
  muestra.
- **Contraprueba:** una terna inventada no está en el conjunto.
- **Sale el caso «el distrito del ejemplo TIENE zona asignada»:** media datos de Ordenex, y en una
  empresa nueva ningún distrito tiene zona.
- El archivo se queda, porque lo cita `specs/278`.

La terna del ejemplo, Cartago / Cartago / Occidental, está en `20260713005000…:344` (medido).

### D5 — `zona-sinpe-migration` y `geografia-dta-2026-migration` (R13, R14)

**`zona-sinpe-migration.test.ts`:**
- Deja de importar `@/scripts/seed-sinpe-inicial`.
- Salen los dos casos que medían el trasvase (R10 del 429 y su idempotencia): su sujeto, el script,
  desaparece.
- En su lugar, un caso con fixture sobre el clon:
  - una zona con SINPE nulo creada entre las dos migraciones hace abortar la `120200`, con el
    mensaje nuevo;
  - completarla con un `UPDATE` del test hace que se aplique.
- Línea 230: pasa a afirmar el mensaje nuevo, y que no nombra ningún script ni ninguna variable.

**`geografia-dta-2026-migration.test.ts`:**
- `DIR_ZONAS` deja de aplicar `20260713010000`.
- Antes de la migración de la DTA 2026, el test crea en su esquema desechable dos zonas inventadas y
  sus vínculos:
  - los hermanos de Buenos Aires (Puntarenas) en una zona, para que Cabagra herede;
  - Bagaces (Guanacaste) en otra, para que Pijije herede;
  - Guácimo sin vínculos, para que Duacarí nazca sin zona.
- La aserción `toBe("GUANACASTE")` pasa a afirmar el nombre de la zona fixture.
- La regla que se mide es la misma.

### D6 — Fixtures de los `zona-*` (R11, R12, R16)

**Nuevo** `tests/integration/db/_fixtures/orden-minima.ts` (sin `.test`):

```ts
export async function crearFksDeOrden(tx: TxDeTest): Promise<FksDeOrden>;      // misma forma que fksDeOrden
export async function crearUsuarioDePrueba(tx: TxDeTest, rol: RolValue):
  Promise<{ id: string; nombre: string; primerApellido: string | null; rol: string }>;
```

- **`crearFksDeOrden`:**
  - toma `en_preparacion` de `order_status` y Cartago/Cartago de la geografía de las migraciones;
  - crea una tienda (`crearUsuarioDePrueba(tx, "adminTienda")`) y una zona inventada con SINPE
    válido. **No crea ninguna orden** (corregido tras la review del 2026-10-22, m1): ningún `zona-*`
    la consumía —cada escenario crea las suyas y del fixture solo lee FK—, y una orden viva oculta
    contaminaría los conteos globales cuando SL-31 reutilice el fixture;
  - si falta el catálogo o la geografía, lanza «aplica las migraciones». Nunca `return null`.
- **`crearUsuarioDePrueba`:**
  - email `<rol>-<sufijo único>@example.com`, cédula única;
  - el `tipo_identificacion cedula` es el de la migración `20260709120000`;
  - crea cualquier rol del catálogo. **Es el único camino por el que un usuario existe en la base**
    hasta SL-32.
- **Cada `zona-*` de R11:**
  - quita `fksDeOrden` y `usuario.findFirst` del `beforeAll`;
  - llama a los helpers al principio de cada transacción revertida;
  - las aserciones no cambian.
- **Trampa.** `zona-central-guarda-y-rastro` apaga todas las marcas `es_central` dentro de su
  transacción. La zona fixture nace no central. El caso R10 de ese test usa la zona A del
  escenario: se comprueba que sigue con 0 órdenes y 0 usuarios.
- `zona-sinpe-permisos.test.ts` solo pide catálogos, que ponen las migraciones: no cambia.
- **Baseline.** Las dos entradas de zona salen de `tests/baseline-rojos.json` en el mismo PR (R12).
- **Mensajes de los 68 tests restantes.** Solo los que nombran `db:seed:maestro`, `db:seed:usuarios`
  o `db:seed:zonas` cambian el texto del `throw` a «esta suite necesita crear su usuario en el
  test (SL-31)». Ninguna aserción cambia (R3).

### D7 — Tests que salen y guardia nueva (R1–R4, R6, R9, R16)

**Se borran:**
- `tests/unit/scripts/seed-zonas.test.ts`;
- `tests/unit/scripts/seed-zonas-codigo-dta.test.ts`;
- `tests/integration/db/seed-zonas-cruza-por-codigo.test.ts`;
- `tests/unit/scripts/seed-sinpe-inicial.test.ts`;
- `tests/unit/scripts/migrate-deploy-auto-resolucion.test.ts`.

**Nueva guardia estática** `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`:
- **R1:** ninguna de las 8 rutas existe.
- **R2:** el único script `db:seed*` es `db:seed`, apunta a un archivo que existe, y ningún script de
  `package.json` nombra `seed-maestro`, `seed-usuarios`, `superadmin` ni `crear-usuario`.
- **R3:** barre `tests/`, `scripts/`, `lib/`, `app/` y `README.md` buscando `db:seed[:a-z-]*`, y cada
  mención tiene que estar declarada.
- **R6:**
  - ningún `db/migrations/*/migration.sql` contiene `INSERT INTO "usuario"` ni `INSERT INTO "zona"`;
  - las carpetas `20260713010000_*` y `20260720150000_*` no existen;
  - las migraciones editadas en D2 no contienen «ordenex».
- **R9:** `scripts/migrate-deploy.ts` y `scripts/migrate-deploy-guardas.ts` no contienen
  `migrate resolve`, `sembrarSinpe` ni `AUTO_RESOLUBLES`.
- **R16:** `tests/integration/db/_fixtures/orden-minima.ts` no contiene «ordenex» ni el nombre del integrador, y
  todo literal con `@` termina en `@example.com`.
- **Contrapruebas sintéticas** en memoria, una por detector:
  - un `package.json` con `db:seed:zonas`;
  - un texto con `db:seed:fantasma`;
  - un SQL con `INSERT INTO "usuario"`;
  - un texto con `@ordenex.test`.

## Alternativas descartadas

- **A. Un seed de desarrollo con usuarios, zona y orden inventados** (primera versión de este spec).
  Contradice la decisión del humano: la app nace vacía, y los tests y el E2E crean sus datos.
- **B. Convertir `seed-maestro` en el arranque del superadmin** (segunda versión). El superadmin es
  un rol nuevo, no `maestro`, y su arranque es de SL-32 (decisión del humano).
- **C. Conservar la migración de zonas y borrarlas con una migración nueva.** Dejaría dos migraciones,
  una que crea y otra que destruye, por datos que nunca llegaron a ninguna base desplegada. Editar
  en sitio está permitido.
- **D. Conservar `seed-sinpe-inicial` «por si acaso».** Sin zonas sembradas, el `DO` no puede
  abortar en una base nueva, y el SINPE es dato de empresa. Sería código muerto con una excepción
  abierta en una guardia de seguridad.
- **E. Quitar el `DO` de la `120200`.** Una base con zonas creadas a mano entre las dos migraciones
  moriría con el error genérico de `SET NOT NULL`. Se conserva con texto neutro (R8).
- **F. Pasar a fixtures los 72 consumidores de `fksDeOrden`.** En SL-11 solo los seis `zona-*`. El
  resto va a SL-31 (decisión del humano).
- **G. Consolidar las migraciones.** Es otra ficha.
- **H. Borrar `carga-masiva-ejemplos-geo.test.ts`.** Lo cita `specs/278` en la fila R4.

## Trampas para el implementer

- **Antes de nada, rebasa sobre `dev`** (`60befb1` y SL-10 integrada).
- **Bases locales:** cualquier base con las migraciones viejas aplicadas da drift.
  - Mide sobre una base nueva, `servi_logistic_sl11`, en el servidor de `DATABASE_URL`, y bórrala al
    acabar. Sin permiso de `CREATE DATABASE`, PARA y pregunta.
  - Comprueba que `DATABASE_URL` no apunta a un proyecto Supabase de la app de origen (ids en la memoria local del leader); si
    los contiene, PARA.
  - El worktree no tiene `.env`: exporta la variable.
- **Cambiar `package.json` obliga al gate completo** (lo indica el leader). Con `DATABASE_URL`
  cargada corren 343 archivos contra Postgres, y los 68 de SL-31 revientan sobre una base vacía.
  - Mídelo **antes** del cambio, sobre la misma base vacía, para separar lo heredado de lo tuyo.
  - Un rojo que no causa tu diff: PARA y repórtalo, no lo metas en el baseline por tu cuenta.
- **No escribas filas `| R<n> | … |` que citen los tests que borras.** Comprueba
  `test-citado-desaparecido` en verde **después** de commitear los borrados.
- **Los fixtures no deben dar verde sin datos:** nada de `if (!x) return;`. Mutaciones de prueba
  (corregidas tras la review del 2026-10-22: la primera versión pedía quitar la orden del fixture, y
  esa mutación sobrevivía porque nadie la consume):
  - `crearFksDeOrden` devuelve un `tiendaId` inexistente → rojo en `zona-central-guarda-y-rastro`,
    `zona-pago-mensajero-rastro` y `zona-reconciliacion-ordenes`;
  - `crearFksDeOrden` devuelve un `cantonId` inexistente → rojo además en
    `zona-guardado-conserva-inactivos`.
- **Log del gate a archivo**, con `INIT_EXIT=$?` dentro.
- **Un solo dev server** para R17.

## Dependencias de terceros

Ninguna nueva, y ninguna sale. `exceljs` sigue en uso aunque se vaya `seed-zonas.ts`: lo importan,
entre otros, `lib/utils/xlsx-template.ts`, `lib/utils/limite-excel.ts` y
`lib/utils/descarga-dataset.ts` (medido con Grep).
