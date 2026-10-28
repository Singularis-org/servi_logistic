# SL-31 — Diseño

## Lo que ya existe

Buscado: `fixture`, `fábrica`, `datos propios`, `sembrad`, `fksDeOrden`, `crearUsuarioDePrueba`,
`crearFksDeOrden`, `SL-31`, en `feature_list.json`, `specs/` y el código (Grep/Read: el MCP del
grafo no estaba disponible en esta sesión).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo SL-31. SL-11 (done) mandó aquí los consumidores de `fksDeOrden` y la base de CI; su pregunta abierta 1 (los E2E) la cierra la ficha de SL-31. SL-28 (pending, Christian) adapta los tests que leen migraciones. | Se sigue. La frontera con SL-28 está en `> Exclusión SL-28`. |
| `tests/integration/db/_fixtures/orden-minima.ts` (SL-11) | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`. Crean usuario, tienda y zona dentro de la tx. Leen solo catálogos y Cartago/Cartago, y lanzan si faltan. | **Se reutiliza:** es el núcleo de `tests/fabricas/`. El archivo se queda como reexportación, para que los seis `zona-*` de SL-11 no cambien. |
| `tests/integration/_semilla-tablero-dia.ts`, `db/_semilla-rollup.ts` | Ya crean sus usuarios y órdenes. Sus consumidores pasan en verde sobre la base vacía (no están en el baseline). | Patrón probado. No se tocan. |
| `tests/integration/db/_postgres-real.ts` | `enTransaccionRevertida`, `serializarEscriturasReales`, `clienteConTransaccionAnidada`, `fksDeOrden` (lee la primera orden). | Se usa tal cual. **No se edita** (R14): `fksDeOrden` se queda para los excluidos, y la guardia de R12 impide consumidores nuevos. |
| `e2e/marca.spec.ts` (SL-8) | Crea un `admin` con contraseña aleatoria y `trusted_device`, entra por `/login` sin OTP y lo borra en `afterAll`. Aborta si la base es remota. | **Se reutiliza la técnica** en `tests/fabricas/e2e.ts`. `marca.spec.ts` no se toca. |
| `tests/helpers/test-database.ts` | **No existe**: lo citan los comentarios de `gate.yml` (herencia de la plantilla). | Se corrige el comentario (R18). |
| `.github/workflows/gate.yml` | Los shards de vitest **no migran** la base. El job `e2e` solo hace `prisma migrate deploy`. Declara `SEED_ADMIN_*`/`SEED_MAESTRO_*`, que nadie lee. | D5. |

### Medición (2026-10-22, lectura estática)

Lo he medido leyendo los 245 archivos de `tests/baseline-rojos.json` con motivo SL-31 y los
helpers que importan. No he ejecutado nada: T1 lo repite ejecutando y fija la cifra exacta. Las
cifras van con «≈» porque hay solapes: un archivo que usa dos helpers cuenta en el primero.

| Grupo | Qué lee de la base | Archivos | Excluidos (SL-28) | Arreglo |
|---|---|---|---|---|
| E454 | `prepararMundo()` de `454/_escenario.ts`: `fksDeOrden` (orden), `usuario.findFirst` (tipo de identificación) y la zona central | 76 (`454/` 48, `455/` 17, `477-*` 5, `484-*` 5, `462/` 1) | 3 | **1 helper** |
| E459 | `cargarCatalogo459()` de `_fixtures/caja-459.ts` (y `wallet-458`, `libro-468` encima): la zona central y `orden.findFirst` para provincia y cantón | ≈35 (`wallet-*`, `libro-*`, `estado-cuenta-*`, `caja-*`, `kardex-*`…) | 2 | **1 helper** |
| E419 | `_escenario-419.ts`: igual que E454 | 3 | 0 | 1 helper |
| E47x | `_whatsapp-envios-474.ts` y `_informe-transito-475.ts` (`usuario … LIMIT 1` como «usuario modelo»); `_picking-476.ts` (`zona.findFirst`) | 8 + 5 + 2 | 0 | 3 helpers |
| Orden directo | `fksDeOrden(prisma)` en el propio test (o `orden.findFirst` para un distrito con orden) | ≈66 | 1 | por archivo, con `crearFksDeOrden` |
| Usuario directo | `usuario.findFirst()` en el propio test | ≈18 | 1 | por archivo, con `crearUsuario` |
| Zona directa | `zona.findFirst()` (+ `canton.findFirst`) en el propio test (`repositories/*`, `actions/analitica-financiera-action`, `cobertura-repository`) | ≈8 | 0 | por archivo, con `crearZona` |
| Geografía | — | 0 en local | — | Llega por migración (7/84/494). En CI **todos** los tests de base fallan hoy, porque los shards no migran (D5). |
| Sin causa estática | Ni `findFirst` ni helper conocido (`corregir-conciliacion`, `gasto-fijo-cobro-aprobacion`, `satelite-bodega-alcance-real`, `analytics-daily-job`, `cohorte-carga-indices`…) | ≈6 | — | T1 la mide por el mensaje del primer rojo |
| Lee migraciones | Lee `db/migrations/` (además de la base) | 23 | 23 | **Fuera** (SL-28) |

En resumen: **≈222 archivos en alcance**, y **≈126 se arreglan tocando 6 helpers**. Los ≈96
restantes cambian una o dos líneas cada uno: quitar `fksDeOrden`/`findFirst` y llamar a la fábrica
dentro de la tx que el test ya abre.

**Tests verdes sin datos.** En `tests/integration/` hay 83 archivos con un `if (… ) return;` o un
`skipIf`. Algunos son legítimos (`if (!HAY_BASE_DE_DATOS) return`). Otros pasan en verde sin
comprobar nada sobre la base vacía, como `caja-backfill.test.ts`
(`if (resultado === null) return; // base sin usuarios o sin zonas`). No están en el baseline
porque no fallan. Entran en SL-31: T1 los mide (R13, decisión P2).

## Perfil del proyecto (`docs/perfil-agentes.md > spec_author`)

- **Modelo de datos:** sin tablas, columnas ni migraciones nuevas. No hay `down.sql`. No cambia
  ninguna RLS.
- **`organizacion_id`:** no existe todavía (SL-17). Cuando llegue, `tests/fabricas/` es el único
  sitio que tiene que aprender a crear la empresa y pasarla. Por eso es una pieza compartida y no
  245 arreglos.
- **Autorización / módulos:** no aplica. No se toca código de producción.
- **Datos que dependen del país:**
  - la geografía es la de Costa Rica que siembran las migraciones. Las fábricas usan
    Cartago/Cartago y un distrito suyo, todo en **una sola constante** de `tests/fabricas/catalogos.ts`
    (SL-20 la cambiará ahí);
  - el SINPE de la zona es un valor inventado que cumple el `CHECK` (`80000000`, «Titular de
    Prueba», como hoy);
  - los importes de los E2E en colones salen de lo que crea cada spec.

## Decisiones técnicas

### D1 — `tests/fabricas/`: el contrato (R1–R6)

Fuera de `tests/integration/` para que los E2E las importen también. No acaban en `.test.ts`, así
que vitest no las recoge.

```ts
// tests/fabricas/cliente.ts
export type ClienteDeFabrica = TxDeTest | PrismaClient; // misma API de modelos

// tests/fabricas/catalogos.ts — lo único que se LEE
export interface Catalogo {
  rolId: Record<RolValue, string>;
  estatusId: Map<string, string>;          // value -> id, del catálogo migrado
  tipoIdentificacionId: string;            // «cedula»
  geografia: { provinciaId: string; cantonId: string; distritoId: string };
}
export async function leerCatalogo(c: ClienteDeFabrica): Promise<Catalogo>;
//   lanza CatalogoIncompleto («falta X: aplica `prisma migrate deploy` y `pnpm run db:seed`»)

// tests/fabricas/unicos.ts
export function sufijoUnico(): string;     // randomUUID por proceso + contador
export function guiaUnica(): number;       // rango propio, no choca con 454_000_000+

// tests/fabricas/usuarios.ts
export async function crearUsuario(c, rol: RolValue, o?: { zonaId?: string | null; estado?: string }): Promise<UsuarioCreado>;
export async function crearTienda(c): Promise<UsuarioCreado>;          // rol adminTienda

// tests/fabricas/zonas.ts
export async function crearZona(c, o?: { distritoIds?: string[] }): Promise<{ id: string }>;
export async function crearZonaCentral(c): Promise<{ id: string }>;   // ver D1.2

// tests/fabricas/ordenes.ts
export async function crearFksDeOrden(c): Promise<FksDeOrden>;        // misma forma que hoy
export async function crearOrden(c, fks: FksDeOrden, o?: { estatus?: string; numGuia?: number; telefonoDest?: string }): Promise<{ id: string; numGuia: number }>;
```

- **D1.1 — Nada de `null`** (R3, R10): ninguna función devuelve `null`. Si falta un catálogo,
  lanza nombrándolo.
- **D1.2 — La zona central** (R6): `crearZonaCentral` hace tres cosas, dentro del cliente:
  1. comprueba en `pg_locks` que la sesión tiene el lock de `CLAVE_LOCK_ESCRITURA_REAL`, y si no
     lo tiene, lanza;
  2. pone `es_central = false` en la central que haya (el rollback del test lo deshace; es lo que
     ya hace `zona-central-guarda-y-rastro.test.ts`);
  3. crea la suya.

  Así una base local con una central creada a mano no rompe la suite, y nunca hay dos centrales
  sin confirmar a la vez.
- **D1.3 — Emails** `<rol>-<sufijo>@example.com`. Nombres «Prueba <rol>» / «Fixture <sufijo>».
  Contraseña `x` en integración. Nada de la app de origen (R5).
- **D1.4 — `orden-minima.ts`** queda como reexportación (`crearUsuarioDePrueba` → `crearUsuario`,
  `crearFksDeOrden`). La guardia `fuera-datos-ordenex` (SL-11 R16) pasa a barrer `tests/fabricas/`
  en vez de ese archivo.

### D2 — Los escenarios compartidos (grupos E454, E459, E419, E47x)

El defecto vive en el helper, no en sus 130 consumidores:
- **`454/_escenario.ts`:**
  - `prepararMundo()` deja de leer filas: solo `leerCatalogo` (roles, estados, cédula, geografía);
  - `crearEscenario()`, que ya corre dentro de la tx con el lock tomado (`conEscenario`), crea la
    tienda y la zona central con las fábricas;
  - `Mundo.fks` y `Mundo.centralZonaId` pasan al escenario (`e.fks`, `e.centralZonaId`). Los leen
    3 archivos (`477-ordenes-en-correccion`, `462/reprogramadas-retenidas`,
    `454/caracterizacion/notificacion-n1`), que se adaptan;
  - los emails pasan de `@example.test` a `@example.com` (R5).
- **`_fixtures/caja-459.ts`:** `cargarCatalogo459()` deja de leer la central y la orden. La central
  se crea dentro de `enTransaccionRevertida459`, que ya toma el lock como primera sentencia.
  Provincia y cantón salen del catálogo.
- **`419/_escenario-419.ts`:** lo mismo que la 454.
- **`_whatsapp-envios-474.ts`, `_informe-transito-475.ts`:** el «usuario modelo» de
  `LIMIT 1` pasa a ser `crearUsuario`. **`_picking-476.ts`:** `crearZona`.
- **Escenarios COMPROMETIDOS** (`sembrarComprometido`, `sembrarPersonas459`), que confirman de
  verdad: NO usan `crearZonaCentral` (no se confirma el `es_central = false` de una zona ajena).
  Si necesitan central y ya hay una, fallan con mensaje. Ver Trampas.

### D3 — Los tests directos (grupos Orden, Usuario, Zona)

Patrón único, una o dos líneas por archivo:
- `const fks = await fksDeOrden(prisma); if (!fks) return;` (fuera de la tx) pasa a
  `const fks = await crearFksDeOrden(tx)` (dentro de la tx del caso);
- `usuario.findFirst()` pasa a `crearUsuario(tx, "<rol que el test necesita>")`.

Si el `fks` vivía en un `beforeAll` y se compartía entre casos, se mueve a cada caso o a un helper
local que se llama dentro de cada tx. La tx revertida no sobrevive entre casos. Ninguna aserción
cambia (R9).

### D4 — La guardia (R10, R12)

Archivo nuevo: `tests/unit/guards/fabricas-de-datos.guardia.test.ts`. Barre `tests/**/*.ts` y
`e2e/**/*.ts`. Da rojo con:
- `fksDeOrden(`;
- `.(orden|usuario|zona).findFirst()` o `findFirst({` sin `where` en el primer nivel del argumento;
- `zona.findFirst({ where: { esCentral: true }`;
- `FROM "(orden|usuario|zona)"` seguido de `LIMIT 1` sin `WHERE`;
- en los archivos que esta ficha toca, `if (!<x>) return;` y `if (<x> === null) return;` que no
  sean sobre `HAY_BASE_DE_DATOS`.

Lista de permitidos: **solo** los excluidos de SL-28 (`> Exclusión SL-28`) y
`_postgres-real.ts`. Nace con todos los infractores actuales y **solo puede encoger**: cada tanda
quita los que arregla, y al cerrar quedan solo los excluidos.

La guardia lleva tres comprobaciones de sí misma:
- **no-vacuidad:** barre más de 300 archivos y encuentra el `fksDeOrden` de `_postgres-real.ts`;
- **contraprueba:** un texto con `usuario.findFirst()` da rojo;
- **permitido muerto:** un permitido que ya no infringe da rojo.

### D5 — CI (R16–R18)

En `vitest`, entre «Dependencias» y el gate:

```yaml
- name: Base del shard (migrada + catálogos)
  shell: bash
  run: |
    set -euo pipefail
    pnpm exec prisma generate
    pnpm exec prisma migrate deploy
    pnpm run db:seed
```

- `set -e` hace que un fallo corte el job antes del gate (R16). `db:seed` usa `@prisma/client`,
  por eso va después de `generate`.
- En `e2e`: añadir `pnpm run db:seed` a «Base del E2E (migrada)», y quitar el `ABIERTO` del
  comentario, que queda resuelto.
- Fuera `SEED_ADMIN_*` y `SEED_MAESTRO_*` de los dos jobs: no las lee nadie (Grep 2026-10-22, solo
  aparecen en `gate.yml` y `plantillas/github/gate.yml`). `SESSION_SECRET` y `APP_BASE_URL` se
  quedan.
- Corregir los comentarios que citan `tests/helpers/test-database.ts` y la «base efímera desde una
  plantilla»: los tests usan `DATABASE_URL` con transacciones revertidas.

`plantillas/github/gate.yml` no se toca: es la plantilla del arnés.

**Orden y verificación (P4, P4b).** D5 no depende de las fábricas, así que va primero, en su
propio PR a `dev`, y se mergea solo. La evidencia es el CI de ese PR: el repo es público y
`gate.yml` corre en cada PR a `dev` y a `prod`. Los tres shards tienen que mostrar el paso de
migración en verde.

Ese PR **no** pone verde la suite: los ≈222 de SL-31 siguen en el baseline. Lo que cambia es la
causa de los rojos de CI: deja de ser «la tabla no existe» y pasa a ser «faltan datos», que es la
causa que el baseline ya tolera. El `gate-completo` de ese PR tiene que quedar en verde, y si un
archivo nuevo sale rojo por la base migrada, se mide y se reporta antes del merge.

### D6 — E2E (R19–R23)

Specs en alcance: los 19 de `e2e/` con «PRECONDITION (seed)»: `analitica-roles`,
`asignacion-satelite`, `auth`, `cierre-bodega-satelite`, `cierre-dia`, `cierre-vencido-modelo`,
`cierres-admin`, `cierres-admin-rechazos-sla`, `devolucion-origen`, `historial-orden`, `mi-wallet`,
`mis-asignaciones`, `rastreo-publico`, `recepcion-satelite`, `reglas-bloqueos-cierre`,
`reintentos-escalado`, `reprogramacion-liberacion`, `wallet`, `wallet-mensajeros`. Fuera:
`marca.spec.ts` (ya crea los suyos) y `home.spec.ts` (no declara datos; lo retiró SL-44 en T7.1).

`tests/fabricas/e2e.ts`:

```ts
export function abrirBaseE2E(): PrismaClient;      // R22: host localhost/127.0.0.1 o lanza; sin DATABASE_URL lanza (R21)
export interface RegistroE2E { usuarios: string[]; zonas: string[]; ordenes: string[]; /* + lo que cree el spec */ }
export async function crearUsuarioConSesion(p, reg, rol: RolValue, o?): Promise<{ id: string; email: string; password: string }>;
//   contraseña aleatoria hasheada con bcryptjs (ya es dependencia) + trusted_device del user agent de Playwright
export async function limpiarE2E(p, reg): Promise<void>;   // borra en orden de FK; idempotente
```

- Los datos del E2E **se confirman**: el servidor Next los tiene que ver, así que no puede haber
  tx revertida. Cada spec crea los suyos en `beforeAll` y llama a `limpiarE2E` en `afterAll`, que
  corre pase o falle (R19). Los ids van al `RegistroE2E` en cuanto se crean, para que una caída a
  mitad limpie lo que sí se creó.
- Estados complejos (cierre aprobado, movimiento de wallet, historial de orden): el spec los crea
  con Prisma directo **como precondición**. El flujo que se mide va siempre por la UI. Los valores
  esperados (saldo, guía, últimos 4 del teléfono) salen de lo creado (R20).
- `workers: 1` en CI (ya está): los specs no comparten datos, pero el limitador de `/rastreo` va
  por IP.

### Exclusión SL-28 (R14, R15) y choque de archivos

**Tests del baseline que leen `db/migrations/`** (medido: Grep de `db/migrations`, `migration.sql`
y `down.sql`, y los que importan `_fixtures/fechas-cr-461-sql.ts` o
`_fixtures/completar-caja-461-sql.ts`). SL-31 **no los edita**:

- `tests/integration/db/454/orden-evento-migration.test.ts`
- `tests/integration/db/454/retiro-estados-migration.test.ts`
- `tests/integration/db/455/migracion.test.ts`
- `tests/integration/db/caja-invariante-tiendas.test.ts`
- `tests/integration/db/cierre-bodega-conciliacion.int.test.ts`
- `tests/integration/db/confirmacion-fisica-migration.test.ts`
- `tests/integration/db/habilitacion-api-migration.test.ts`
- `tests/integration/db/historial-accion-migration.test.ts`
- `tests/integration/db/notificacion-evento-cierre-rechazado-migration.test.ts`
- `tests/integration/db/notificacion-evento-geocodificacion-caida-migration.test.ts`
- `tests/integration/db/notificacion-evento-reparto-manana-migration.test.ts`
- `tests/integration/db/notificacion-evento-traspaso-migration.test.ts`
- `tests/integration/db/notificacion-evento-webhook-suscripcion-migration.test.ts`
- `tests/integration/db/orden-mensajero-meta-drop-nota-migration.test.ts`
- `tests/integration/db/orden-nota-migration.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/integration/db/postulacion-recurso-migration.test.ts`
- `tests/integration/db/premio-ranking-devengo-migration.test.ts`
- `tests/integration/db/ranking-snapshot-migration.test.ts`
- `tests/integration/db/reparto-manana-aviso-dedupe.test.ts`
- `tests/integration/db/vista-filtro-migration.test.ts`
- `tests/integration/db/wallet-458-migration.test.ts`
- `tests/integration/db/webhook-suscripcion-circuito-migracion.test.ts`

Los cinco primeros usan `prepararMundo` o `cargarCatalogo459`: cuando D2 arregle el helper, pueden
volver a verde **sin editarlos**. Entonces sale su entrada del baseline (R15). T1 confirma la
lista ejecutando.

**Choque de archivos con SL-28** (Christian, en paralelo):

| Archivo | SL-31 | SL-28 | Cómo se resuelve |
|---|---|---|---|
| Los 23 de arriba | no los edita | los adapta | sin solape |
| `tests/integration/db/_postgres-real.ts` | no lo edita | probable (`soltarDependientesPosterioresDelEnumDeEventos` vive para los `down.sql` históricos) | sin solape |
| `tests/baseline-rojos.json` | quita sus entradas | quitará las suyas | compartido de apéndice: `archivos-en-vuelo.mjs` da AVISO; rebasa quien mergee segundo |
| `.github/workflows/gate.yml` | dueño del paso de migración de los shards (decisión P5); va **primero**, en su propio PR (P4b) | puede tocarlo | si los dos lo tocan, rebasa quien mergee segundo (P5). El PR de CI de SL-31 se mergea antes, para que el de SL-28 no salga rojo por una base sin migrar |
| `tests/integration/db/454/_escenario.ts`, `_fixtures/caja-459.ts` | los edita (D2) | ABIERTO: los importan 3 de sus excluidos | sin `specs/SL-28-*` publicado no se puede saber; se comprueba con `node scripts/archivos-en-vuelo.mjs --candidata SL-31` en F1.0 y antes de cada push |

Si SL-28 mergea primero: los tests excluidos siguen excluidos (o ya están verdes), la geografía y
los catálogos siguen llegando por migración, y las fábricas no dependen de ninguna migración
concreta. Solo hace falta rebasar.

## Alternativas descartadas

- **A. Una semilla de test**: una base plantilla con usuarios, zonas y órdenes inventadas, cargada
  una vez en un `globalSetup`. Ahorra tocar los tests, pero:
  - es una semilla, y la decisión del humano es que cada test cree sus datos;
  - los tests volverían a depender de filas compartidas que otro test puede mutar. Es el origen
    del drift del baseline de 2026-08-28.
- **B. 222 arreglos sueltos**, cada test con su propio `tx.usuario.create`. El defecto vive en 6
  helpers. Repetirlo 222 veces deja 222 sitios que cambiar cuando llegue `organizacion_id` (SL-17).
- **C. Una librería de fábricas** (`fishery`, `@faker-js/faker`). Ahorra unas 100 líneas de
  `create` que ya existen en `orden-minima.ts` y en `454/_escenario.ts`. A cambio:
  - mete una dependencia (regla 7);
  - faker genera nombres y teléfonos con pinta de reales, cuando lo que se pide es inventado y
    reconocible (R5).
- **D. Una base por suite con `CREATE DATABASE … TEMPLATE`**, lo que imaginan los comentarios
  heredados de `gate.yml`. Cambia la infraestructura de 343 archivos, y la tx revertida ya aísla.
- **E. `scripts/migrate-deploy.ts` en CI** en vez de `prisma migrate deploy`. Además siembra la
  primera ocurrencia de los jobs recurrentes: filas en `jobs` que ningún test espera, y que harían
  depender los conteos de la cola de un estado de arranque. La ficha fija `migrate deploy`.
- **F. Migrar desde un `globalSetup` de vitest.** Escondería un paso de infraestructura dentro de la
  suite y correría en cada `vitest related` local. En CI es un paso visible de `gate.yml`; en local,
  cada uno migra su base.

## Trampas para el implementer

- **El `beforeAll` fuera de la tx.** Muchos tests leen `fksDeOrden` en `beforeAll` y abren la tx
  en cada `it`. La fábrica tiene que ir **dentro** de la tx: si crea fuera, confirma filas en la
  base compartida. Una mutación lo detecta: base vacía antes y después de la corrida (T11).
- **Escenarios comprometidos** (`sembrarComprometido`, `sembrarPersonas459`/`limpiar459`):
  confirman de verdad y sus consumidores no están en el baseline (pasan hoy). No se les cambia el
  comportamiento. Antes de tocar `caja-459.ts`, corre sus consumidores verdes y compara.
- **Índice único de `es_central`:** dos `crearZonaCentral` sin el lock se bloquean (no fallan).
  El síntoma es un timeout de 20 s, no un error de unicidad. Por eso la fábrica comprueba el lock.
- **`vitest related` sobre `tests/fabricas/`** arrastra cientos de suites (aceptado, decisión P6).
  Usa `./init.sh` igual: es la evidencia.
- **Medir antes de tocar** (memoria del proyecto): un rojo que no causa tu diff se reporta, no se
  mete en el baseline.
- **Mutación por tanda** (R10): en cada tanda, haz que la fábrica devuelva un id inexistente en 3
  archivos elegidos al azar y comprueba que se ponen rojos. Pega la salida. Un arnés de mutación
  que dice «sobrevivió» sin haber corrido un test no vale: comprueba que ejecutó.
- **El E2E reutiliza servidor**: `reuseExistingServer` fuera de CI. Si hay otro `next dev` en
  `:3000` de otro checkout, el E2E mide ese. Mata los dev servers antes (`docs/verification.md`).

## Dependencias de terceros

Ninguna nueva. `bcryptjs`, `@prisma/client`, `@prisma/adapter-pg` y `@playwright/test` ya están y
los usa `e2e/marca.spec.ts`.
