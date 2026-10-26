# Review SL-43 «datos-demo-qa» — vuelta 1

- Rama `feature/SL-43-datos-demo-qa`, HEAD `1866d36`. Diff `origin/dev...HEAD`: 46 archivos.
- Revisado contra `specs/SL-43-datos-demo-qa/` (R1–R33, D1–D26), `progress/impl_SL-43.md`, `docs/`,
  `CHECKPOINTS.md` y `docs/checkpoints-proyecto.md`.
- Base local `servi_logistic_sl43` (y `servi_logistic_sl43_e2e` para un E2E), con 8 GB. Nada contra QA
  ni producción, y ninguna URL ni valor del `.env` impreso.
- Grafo: no lo consulté. El design ya dice que este worktree no tiene proyecto indexado, así que usé
  Grep/Read y consultas al catálogo de Postgres.

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | `TC_EXIT=0` |
| `pnpm run lint` | 0 errores (231 avisos, `LINT_EXIT=0`) |
| `vitest run tests/unit/scripts/demo-qa-*.test.ts` (5 archivos) | 98/98 |
| `pnpm run test:guardias` | 4 rojos, todos en `dependencias-declaradas-presentes.guardia.test.ts`. Ese archivo ya está en `tests/baseline-rojos.json:51` y el diff no toca `init.sh`, así que **no es un hallazgo** |
| `demo-qa-borrado.test.ts` + `demo-qa.test.ts` contra sl43 | 14/14, sin saltos |
| `./init.sh` (rápido) contra sl43 | `INIT_EXIT=0`: 921 archivos relacionados en verde; guardias 309/309 |
| `e2e/dos-empresas-humo.spec.ts --no-deps` contra sl43_e2e | **6 passed (55.7 s)**, `E2E_EXIT=0` |
| Catálogo de sl43 (FK, `ON DELETE`, triggers) | ver (a) |
| Estado final | sl43 queda con 0 empresas demo y 0 filas en `entorno_marca`. `git status --porcelain` vacío |

### Mutaciones propias (g), cada una aplicada sola y revertida con `git checkout`

| # | Mutación | Test que cae |
|---|---|---|
| R1 | `comprobarMarcaDeQa` acepta la tabla sin fila (`guardia-entorno.ts:247`, `:254`) | unit «sin fila → rechaza», 1/45. Integración «sin la marca de QA no escribe nada (R3)»: `expected +0 to be 1` con el archivo entero (10/11 en verde) |
| R2 | Borrado sin filtro `es_demo`: `empresasDemo` con `where: {}`, `exigirSoloDemo` anulado y `DELETE organizacion` sin `AND "es_demo"` (`borrar.ts:97`, `:115`, `:348`) | `demo-qa-borrado` «R7, R9: … deja intacta la real» (`expected [ …(2) ] to deeply equal [ Array(1) ]`) |
| R3 | En `--build`, el paso omitido no retorna y sigue a la guardia y a conectar (`demo-qa.ts:291`) | `demo-qa-build`: los 6 casos «OMITIDA … sin conectar» |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R33 en EARS.
- [x] `design.md` con `## Alternativas descartadas` (`design.md:670`).
- [ ] Todas las tasks `[x]`: no. T2b (`tasks.md:53`) y T12 (`tasks.md:164`) siguen `[ ]`. Las dos son
  puertas humanas posteriores al merge (ver m3).
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista, y reutiliza
  `RUTAS_GUARDADAS`, los adaptadores de SL-19, `handleCargaApi`, `JobRepository` y la fábrica de SL-44.
  Hay una duplicación fuera de la lista: m1.

### Equipo
- [ ] Assignee en Jira y `wt.sh new`: no lo verifico desde aquí; es del leader.
  `progress/features/SL-43.md:10` dice que se tomó con assignee.

### Trazabilidad
- [x] Cada R1–R33 mapea a un test concreto (`impl_SL-43.md:260-286`). Comprobado en el código para
  R2, R3, R4, R5, R7, R8, R9, R10, R23, R28, R29, R30, R31, R32 y R33.
- [x] El mapa `R<n> → test` está en la bitácora.

### Calidad de código
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente del PR, con un riesgo de rojo intermitente (B1).
- [~] Flujo crítico con E2E. El diff toca `lib/db/modelos-de-negocio.ts` y la fábrica
  `tests/fabricas/e2e.ts`, que usan todos los grupos E2E.
  - La bitácora solo trae `reparto` y `dinero`; falta `dos-empresas-humo` (m2).
  - Lo corrí yo y sale verde.
- [x] Sin dependencias nuevas: `package.json` solo cambia `scripts`.

### Seguridad y configuración
- [x] Ningún secreto en el código.
  - `.env.example` lleva las variables vacías.
  - La salida solo nombra variables (`guardia-entorno.ts:129-186`), y los errores van sin su mensaje
    (`salida.ts:111-128`, `borrar.ts:85-92`).
- [x] Ningún webhook nuevo.
- [x] Nada que cambie entre entornos va fijo en el código. `TOPE_MS` es el mismo en todos los
  entornos, por diseño (D10.4).

### Proyecto (`docs/checkpoints-proyecto.md` y `perfil-agentes.md > reviewer`)
- [x] Las migraciones nuevas traen su `down.sql` y no editan ninguna ya aplicada.
- [x] `entorno_marca` es tabla de plataforma: RLS activada, sin políticas, `REVOKE ALL … FROM
  servi_app`, y está clasificada en `MODELOS_DE_PLATAFORMA`. Tiene el mismo precedente que
  `cobro_plataforma_tarifa`. No es una tabla de negocio, así que no pide `organizacion_id`.
- [x] Las queries nuevas filtran por empresa: `organizacion_id = ANY(demo)` o `conEmpresa`. El test
  usa dos empresas, la real y las demo.
- [x] Sin literales de país ni moneda en `scripts/demo-qa*`. Las coordenadas fijas son D22 (aprobado).
- [x] Ningún recurso de Ordenex.
- [x] Sin `console.log` de secretos. El test R5 espía la consola entera.
- [x] Los comentarios explican el porqué.

## Lo pedido por el leader

### (a) Nunca producción ni una empresa real — OK

- **Capa 1** (`guardia-entorno.ts:132`): sale antes de conectar, y además va repetida tras
  `decidirDemo` (`decision-build.ts:19`). Mi mutación R3 y la 1 del implementer la matan.
- **Capa 2** (`:62-120`): las tres URLs tienen que ser del mismo proyecto.
  - Un ref con formato raro, un host remoto sin ref o un `?host=` cuentan como «no identificable» y
    se rechazan: falla cerrada.
  - Sin `DIRECT_URL`, en remoto, se rechaza (`:164`).
- **Capa 3** (`:227-262`): es lo primero que se hace tras tomar el candado (`demo-qa.ts:223`), y
  antes de cualquier lectura o escritura de negocio.
  - Producción sin la migración da `42P01` y rechaza. Con la migración, la tabla está vacía y también
    rechaza.
  - `servi_app` no puede insertar la fila.
  - Mi mutación R1 la mata.
- **Borrado (D12), con el catálogo de sl43:**
  - Solo hay 3 FK desde tablas sin `organizacion_id` hacia tablas con empresa, y las tres apuntan a
    `usuario`: `email_otp_challenge`, `login_attempt` y `trusted_device`. El borrado las recoge por
    `usuario_id = ANY(usuarios demo)`.
  - Ninguna FK de una tabla de plataforma apunta a una fila de negocio. No hay triggers `ON DELETE`.
  - Los `CASCADE`/`SET NULL` que hay unen filas de la misma empresa: los triggers de misma empresa
    impiden una referencia cruzada.
  - **`wallet_movimiento` (desviación 11):** sus 4 FK entrantes (`gasto_fijo_cobro`,
    `ajuste_caja_anulacion`, `wallet_anotacion`, `wallet_comprobante`) son `RESTRICT` y vienen de
    tablas con empresa, que caen en la misma pasada. No puede alcanzar una fila de otra empresa (m5).
  - **`jobs` sin empresa:** `organizacion_id` es nulable, y `= ANY` nunca casa con `NULL`.
  - **`geocode_cache` y `cobro_plataforma_tarifa`:** no tienen `organizacion_id` ni FK hacia
    usuarios, así que el borrado no las ve.
  - `es_demo` se comprueba tres veces: `empresasDemo`, `exigirSoloDemo` (antes de Storage y dentro
    de la transacción) y el `DELETE organizacion … AND "es_demo"`.
- **Storage:**
  - Cada borrado va dentro de `conEmpresa(<demo>)`, con los adaptadores de SL-19.
  - `rutaDeUrlFirmada` exige `/object/sign/<bucket>/<demo>/` y rechaza `..`, y `URL` ya normaliza
    `%2e%2e`.
  - La purga solo alcanza `<demo>/tmp`.

### (b) El paso del build — OK

- **R30:** `decidirDemo` va antes de todo. Si el paso se omite, sale con 0 y una línea `OMITIDA — <motivo>`,
  sin conectar (`demo-qa.ts:286-293`). Mi mutación R3 lo prueba.
- **R31:** cualquier fallo pasa por `fallar` (`exitCode = 1`). El `&&` corta `next build`, y la línea
  de desbloqueo sale en `--build`.
- **Candado y tope:**
  - El candado es un advisory lock de sesión, sobre una única conexión del dueño (`max: 1`,
    `idleTimeoutMillis: 0`).
  - El tope de 15 min envuelve los pasos 3–7. Al vencer, la limpieza tiene 10 s de límite y después
    `process.exit(1)`.
- **Build local y de producción, sin romperse:**
  - Sin `VERCEL_ENV`, o con `production`, el paso se omite antes de cargar la receta (`import()`
    perezoso, `:163`).
  - Si no hay `.env`, `loadEnvFile` falla en silencio.
  - CI compila con `pnpm exec next build` (`gate.yml`), así que no pasa por el `build` de
    `package.json`.
  - Los previews de otras ramas no tienen `MIGRATE_ON_PREVIEW` (acotada a `dev`) y la omiten.

### (c) Sin efectos externos — OK

- Todos los `notificar*Real` pasan por `repoReal()` (`lib/notificaciones/notificadores.ts:205-221`).
  Ahí el push y WhatsApp solo **encolan**, y WhatsApp encola solo si hay envíos encendidos, que en la
  demo no hay.
- La bienvenida de SL-41 vive en la action, que la demo no llama.
- Toda la cola de la demo se cierra:
  - `geocodificacion` con `complete`;
  - el resto con `fail(…, null)`, que no se reintenta;
  - un tipo inesperado sale con 1 (R23).
- Ninguna ruta de cron se invoca: el corte se llama como servicio, dentro de `conEmpresa(<demo>)`.
- El test espía `ConsoleEmailSender` y `NodemailerEmailSender`, y cuenta 0 envíos.

### (d) Sin secretos en la salida — OK

- `salida.ts` solo escribe perfiles, correos `@example.test`, recuentos y duraciones.
- Los errores que no son de la demo salen como `nombre + código`.
- `exigir` (`receta.ts:247-255`) solo da el estado y los nombres de campo.
- El secreto de la API key no sale de `crearEmpresaDemo`.
- R5 lo prueba sobre la salida inyectada y sobre `console.*`.

### (e) Las 12 desviaciones

| # | Desviación | Juicio |
|---|---|---|
| 1 | B1, el corte de mañana para `novedad_interna` (la decide Carlos) | **Riesgo técnico bajo.** Corre dentro de `conEmpresa(<demo>)`, nunca por la ruta del cron. La receta exige exactamente 1 vencido y que solo cambien sus órdenes (`receta.ts:905-917`), y la mutación 6 (corte con `paraCadaEmpresa`) cae en la huella de la real. Lo que queda: los datos de ese mensajero simulan un día ya cerrado. Va detrás de `NOVEDAD_INTERNA_CON_CORTE_DE_MANANA`, así que se apaga sin tocar nada más. |
| 2 | R14: la «pantalla» es la carga por chunks | Correcta: `OrdenService.crear` no existe desde el 2026-08-07. |
| 3 | R12: el usuario `api` no termina en `@example.test` | Inevitable por el servicio. El texto de R12 queda incumplido en la letra (m8). |
| 4 | Montos, y el pago mixto con transferencia | Correcta: así no entra un literal de país. |
| 5 | La excepción de cobro con un actor `superadmin` sintético | Aceptable: el servicio solo mira el rol y no escribe `usuarioId`. |
| 6 | El turno por advisory lock en 8 tests ajenos | **Sin deadlock; riesgo de rojo bajo.** El hook de 660 s está por encima de los ~80 s de la demo. Pero duplica en parte `tomarLockDeEscrituraReal` y la lista de archivos es frágil (m1). |
| 7 | `EXCEPCIONES_DE_PLATAFORMA` no hizo falta | Cierto para la guardia, pero deja un punto ciego (m6). |
| 8 | `aprobarCierreBodega` choca con `cierre_bodega_conciliacion_coherente` | **Descartada: no es un bug.** Es el comportamiento buscado por la ficha 431 (ver abajo). |
| 9 | R9: el PDF de etiquetas se encuentra por la URL firmada | Arreglo correcto y acotado al bucket y a la carpeta de la demo, con su test unitario. |
| 10 | `Session.userId` sin FK, en una lista fija; `es_demo` comprobado dos veces | Correcta. |
| 11 | `wallet_movimiento` se borra como dueño y la guardia de SL-45 no lo ve | Aprobada en D12 y segura según el catálogo, pero la guardia no lo ve (m5). |
| 12 | Igualdad estricta sobre tablas compartidas | **Sí puede dar rojos intermitentes en CI** (B1). |

**Desviación 8, con evidencia:**
- `lib/actions/cierre-bodega.ts:389` (`@sin-superficie`) retira a propósito la aprobación de nivel 2,
  y la sustituye la marca de conciliación.
- La migración `20260919120100_cierre_bodega_conciliacion` dice: «EL CAMINO VIEJO QUEDA IMPOSIBLE…
  `resolverCierreBodega` con `nuevoEstado:'aprobado'` … la base lo rechaza».
- Lo prueba `tests/integration/db/cierre-bodega-conciliacion.int.test.ts:284`, caso (d).
- Ningún archivo de `app/` ni `components/` llama a `aprobarCierreBodega`.
- **No afecta a producción.**
- La receta usa `ConciliacionSatelitesService.marcarRecibida`, que es el camino actual, y deja la
  fila en `aprobado` («Recibido»). Con eso cumple R17.
- Lo único que sobra es la nota de «posible bug» en la bitácora (m4).

### (f) Los núcleos movidos a `tests/fabricas/` — OK, con una salvedad

- El diff normalizado de `e2e/_escenarios/reparto.ts` (dev) contra `tests/fabricas/escenarios/reparto.ts`
  solo cambia rutas, tipos, dependencias inyectadas (`lector`, `evidencia`, `prepararAsignacion`,
  `altas`) y un parámetro aditivo (`distritosExtra`).
- `e2e/_escenarios/*` sigue pisando `SUPABASE_URL` y montando `drenarGeocodificacion`.
- Ningún `*.spec.ts` cambia.
- E2E del implementer: `reparto` 15/15 y `dinero` 28/28, dos corridas de cada uno. El mío:
  `dos-empresas-humo` 6/6.
- La salvedad es m2. El check `e2e` del PR corre todos los grupos.

## Hallazgos

### B1 — BLOQUEANTE. `demo-qa.test.ts` puede dar un rojo intermitente en `gate-completo`

**Dónde compara:**
- `tests/integration/db/demo-qa.test.ts:310` fotografía con igualdad estricta las filas de `jobs` con
  `organizacion_id IS NULL`.
- La foto se compara en la segunda ejecución (`:780` → `:817`, unos 12 s de ventana) y en R3
  (`:838` → `:849`).

**Quién escribe en esa tabla a la vez:**
- `tests/integration/db/dos-empresas-entradas.test.ts:502` hace **commit** de un job
  `liberar_reprogramadas` sin empresa.
- Lo drena enseguida (`:504`), lo que cambia su `estado` y su `updated_at`, y solo lo borra en su
  `afterAll` (`:281-283`, `limpiar` en `:247-250`).
- En CI, cada shard corre sus archivos en paralelo (8 workers) contra la misma base. Si los dos
  archivos caen en el mismo shard y sus ventanas se solapan, la foto cambia y el test sale rojo. Ese
  rojo no está en el baseline.

**Por qué no lo frena nada hoy:**
- `dos-empresas-entradas` ya sostiene `tomarLockDeEscrituraReal()` durante toda su vida (`:272`).
- `demo-qa.test.ts` no lo toma.

**Qué falta.** Cualquiera de las dos vale:
1. Que `demo-qa.test.ts` y `demo-qa-borrado.test.ts` tomen `tomarLockDeEscrituraReal()` en su
   `beforeAll` y lo suelten en su `afterAll`.
   - Es el patrón documentado en `tests/integration/db/_postgres-real.ts:385-397` para los archivos
     que hacen commit de filas de `notificacion` y las dejan vivas hasta el `afterAll`, y la demo lo
     hace (aviso de cierre rechazado, de bloqueo y de vencido).
   - De paso, este lock ya serializa los 7 `notificacion-evento-*-migration`, que usan
     `serializarEscriturasReales` (ver m1).
2. O acotar la foto de las tres tablas de plataforma a lo que la demo podría escribir, sin depender de
   que nadie más escriba en la base.

En los dos casos, la mutación que prueba R7 sobre esas tablas tiene que seguir dando rojo.

### Menores

- **m1 (desviación 6).** `tests/integration/db/_exclusion-demo-qa.ts` es un mecanismo nuevo que
  solapa con `tomarLockDeEscrituraReal`.
  - Para 7 de los 8 archivos ajenos (los `notificacion-evento-*-migration`, que ya serializan con
    `serializarEscriturasReales` sobre `CLAVE_LOCK_ESCRITURA_REAL`), el lock existente sostenido por
    los archivos de la demo bastaría. Solo `caja-backfill.test.ts` no serializa.
  - La lista de los 8 es frágil: un test nuevo que recorra toda la base no sabrá que tiene que pedir
    el turno.
  - No encontré ningún ciclo de locks, y el hook de 660 s cubre la espera.
  - Al arreglar B1, conviene quitar el turno compartido de los 7 archivos que ya están cubiertos.
- **m2.** `progress/impl_SL-43.md` no trae la salida local de `e2e/dos-empresas-humo.spec.ts`.
  - La pide `docs/checkpoints-proyecto.md > Flujos críticos`, porque el diff toca `lib/db/` y la
    fábrica `crearEmpresaE2E`/`crearUsuarioE2E` que usan todos los grupos.
  - Lo corrí yo: 6 passed, 55.7 s. Hay que pegarlo en la bitácora.
- **m3.** T2b (`tasks.md:53`) y T12 (`tasks.md:164`) siguen `[ ]`. Las dos son puertas humanas que
  solo se pueden cerrar después del merge: la fila de `entorno_marca` en QA y el primer despliegue.
  - No lo trato como bloqueante, porque no se pueden cerrar antes del PR por construcción.
  - El leader debe dejarlas anotadas: en `progress/features/SL-43.md > Cierre` o en
    `progress/deudas.md`, o marcar T2b con su parte técnica hecha y la fila como precondición de T12.
- **m4 (desviación 8).** La nota «posible bug de la app, para el leader» es errónea:
  `progress/impl_SL-43.md:140-142` y `progress/features/SL-43.md:27`. Es el diseño de la ficha 431.
  El comentario de `scripts/demo-qa/receta.ts:682-685` sí es correcto. Hay que corregir las dos notas.
- **m5 (desviación 11).** `scripts/demo-qa/borrar.ts:322-325` borra `wallet_movimiento`,
  `cobro_plataforma_movimiento` y `orden` con un `DELETE` dinámico como dueño.
  - Es lo aprobado en D12 y es seguro según el catálogo (ver (a)).
  - Pero `pago-plataforma-inmutable-sl45.guardia` y el blindaje de SL-40 no lo ven, por construcción.
  - Recomendación: una línea en la cabecera de esa guardia que nombre esta excepción, para que quien
    lea la guardia sepa que existe ese camino.
- **m6 (desviación 7).** El código del build (`scripts/demo-qa/receta.ts`) llama a `comoPlataforma`
  a través de `tests/fabricas/empresa-y-usuarios.ts`, que `plataforma-solo-en-lista` no recorre
  (`CARPETAS_PLATAFORMA = lib, app, scripts`).
  - La task (`tasks.md:129`) pedía la entrada en `EXCEPCIONES_DE_PLATAFORMA`.
  - Si la guardia exige que la excepción llame a `comoPlataforma`, la entrada no cabe. Entonces el
    hueco de la guardia queda documentado solo en la bitácora.
  - Hay que anotarlo en `progress/deudas.md` o ampliar la guardia a `tests/fabricas/`.
- **m7.** Los casos de `demo-qa.test.ts` dependen del orden: R3 (`:832`) solo, con `-t`, sale rojo
  con `expected [] to have a length of 2`, porque necesita las empresas de la corrida 1. Es aceptable
  en un archivo secuencial, pero conviene decirlo en su cabecera.
- **m8 (desviación 3).** La letra de R12 («todos los correos DEBEN terminar en `@example.test`») no
  se cumple para el perfil `api`, cuyo correo es `apikey+…@apikey.invalid`.
  - Lo crea `ApiKeyService.generar` y no se puede cambiar sin tocar la app.
  - Lo correcto es enmendar R12 en `requirements.md` con el OK de Carlos, en vez de dejarlo solo en
    la bitácora.

## Veredicto

**RECHAZADO.** Hay 1 bloqueante (B1) y 8 menores.

- B1 no toca la demo ni QA. Es un rojo intermitente que el test de integración mete en la suite
  compartida de CI, con un escritor concreto identificado (`dos-empresas-entradas.test.ts:502`).
  Basta con tomar el lock existente en los dos archivos de la demo, o con acotar la foto.
- Lo demás del encargo pasa, con verificación propia:
  - las tres capas de la guardia;
  - el borrado acotado a `es_demo` y seguro según el catálogo;
  - el paso del build, que se omite sin conectar y cuyo fallo tumba el build;
  - sin efectos externos ni secretos en la salida;
  - la trazabilidad R1–R33, con tres mutaciones propias que caen.
- La vuelta 2 se acota a B1 y a las notas de m2, m3 y m4.

## Vuelta 2 (acotada a 05eb66e..10be881)

Es un commit, `10be881`, con 13 archivos. Lo revisé contra B1 y m1–m8 de la vuelta 1, y además miré
si traía regresiones.

### Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| Las 3 guardias tocadas (`plataforma-solo-en-lista`, `pago-plataforma-inmutable-sl45`, `cobro-plataforma-solo-por-trigger`) | 34/34 |
| `demo-qa.test.ts` contra sl43, archivo entero | 11/11 (con la mutación B, abajo) |
| Estado final | sl43 queda con 0 empresas demo, 0 filas en `entorno_marca`, `cobro_plataforma_tarifa` como estaba (sin fila) y 0 jobs de mis mutantes. `git status --porcelain` vacío |
| Gate | El leader corrió `./init.sh` en `10be881` con `INIT_EXIT=0`, así que no lo repetí |

### Mutaciones propias (cada una sola y revertida)

| # | Mutación | Esperado | Resultado |
|---|---|---|---|
| A | `borrar.ts` borra además `jobs` con `organizacion_id IS NULL` | rojo | **rojo**. Caen «la segunda ejecución…» (`expected { jobsSinEmpresa: {} …} to deeply equal { jobsSinEmpresa: { …(1) } …}`) y R3 («centinela de jobs: expected undefined to be defined») |
| B | `borrar.ts` commitea en cada borrado un job sin empresa con `payload {}`. Simula a `dos-empresas-entradas` escribiendo a la vez | verde | **verde**, 11/11, con 7 intrusos commiteados a mitad de las corridas |
| m5-a | `lib/repositories/IntrusoRevSl43.ts` con un `DELETE FROM ${tabla}` | rojo | **rojo** en SL-45 y SL-40 (2 de 27) |
| m5-b | `borrar.ts` sin `AND "es_demo"` en el `DELETE organizacion` | rojo | **rojo**. Caen «cada excepción … conserva lo que la hace segura» y el censo de SL-40 |
| m6-a | `tests/fabricas/intruso-rev.ts` que llama a `comoPlataforma` | rojo | **rojo**: «todo archivo que llama a comoPlataforma está en EXCEPCIONES_DE_PLATAFORMA» |
| m6-b | Sin la entrada `tests/fabricas/empresa-y-usuarios.ts` en `EXCEPCIONES_DE_PLATAFORMA` | rojo | **rojo**, el mismo caso |

### Estado de los hallazgos de la vuelta 1

| Hallazgo | Estado | Evidencia |
|---|---|---|
| **B1** | **cerrado** | Ver la nota de B1, debajo de la tabla. |
| m1 | cerrado (aceptado) | `_exclusion-demo-qa.ts` se queda, y su cabecera da el motivo medido: sostener `tomarLockDeEscrituraReal` durante 80 s tumba por timeout de 20 s a 6 archivos. Deja escrito el límite de la lista a mano. Es razonable: lo que pedía era el porqué. |
| m2 | cerrado | `impl_SL-43.md`: `dos-empresas-humo` 6 passed (56.8 s). |
| m3 | cerrado | T2b y T12 están marcadas «PUERTA HUMANA TRAS EL MERGE» (`tasks.md:53`, `:164`). Sus pasos, numerados, están en `progress/features/SL-43.md > Cierre`. |
| m4 | cerrado | La nota está corregida en `impl_SL-43.md` y en `progress/features/SL-43.md`, con la evidencia de la ficha 431. |
| m5 | cerrado | Ver la nota de m5, debajo de la tabla. |
| m6 | cerrado | Ver la nota de m6, debajo de la tabla. |
| m7 | cerrado | `describe.sequential`, la cabecera declara el orden, y los casos dependientes llaman a `exigirCorrida1()`, que suelto falla con «córrelo entero». |
| m8 | cerrado | R12 está enmendado en `requirements.md`, con D28 como origen. D28 es del leader y es un hecho técnico del servicio. |

**B1.** Las fotos de las tablas de plataforma ya no dependen de que nadie más escriba en la base:
- `jobs` sin empresa se acota a un centinela propio (`done`, sin `dedupe_key`) y a los jobs cuyo
  `payload` nombra ids de la demo. Un job como el de `dos-empresas-entradas.test.ts:502` (payload
  `{}`) queda fuera. Lo prueba la mutación B, y la mutación A prueba que la foto sigue mordiendo.
- `geocode_cache` va entera más un centinela. Comprobé que ningún test de integración la commitea:
  los dos `*-rollback` solo leen el texto del `down.sql`.
- `cobro_plataforma_tarifa` se lee con `tomarTarifaGlobal()` (`_fixtures/cobro-plataforma-40.ts:37`)
  y un valor de control, que se restaura al soltar.
  - Sus otros 6 usuarios tienen 120–180 s de timeout en el hook que espera el lock, y la demo lo
    sostiene ~15 s (la corrida 2, o R3). El caso de la demo tiene 480 s para esperarlos.
  - No hay ciclo de locks: ninguno de esos 6 archivos pide el turno de `_exclusion-demo-qa.ts`.
- R3 y R10 ya no comparan `organizacion` entera, sino `empresasAlAlcanceDeLaDemo()`.

**m5.** `tests/unit/guards/_mutaciones-sql-dinamicas.ts` detecta un `DELETE`/`UPDATE`/`TRUNCATE` con
la tabla dinámica, y lo usan las guardias de SL-45 y SL-40 (la de SL-40 mira ahora también
`scripts/`).
- La única excepción es `scripts/demo-qa/borrar.ts`, y vale solo mientras conserve los 4 patrones
  que la hacen segura.
- Las mutaciones m5-a y m5-b caen.

**m6.**
- `CARPETAS_PLATAFORMA` incluye `tests/fabricas` (`tests/unit/guards/_aislamiento-por-empresa.ts:121`),
  y el control positivo exige verla.
- `tests/fabricas/empresa-y-usuarios.ts` entra en `EXCEPCIONES_DE_PLATAFORMA`
  (`lib/db/excepciones-aislamiento.ts:186-192`). La justificación es buena: el build la importa, así
  que cuenta como código de producción.
- Las mutaciones m6-a y m6-b caen.

**Decisión de Carlos sobre el corte de mañana:** está en `requirements.md > Decisiones cerradas`
como **D27** («solo sobre las empresas demo, dentro de `conEmpresa(<demo>)` y nunca por la ruta del
cron», detrás de `NOVEDAD_INTERNA_CON_CORTE_DE_MANANA`). También está en
`progress/features/SL-43.md > Decisiones`.

### Hallazgos nuevos

- **m9 (menor).** `10be881` edita `progress/features/SL-19.md` (`:35-36`, una entrada de Cierre sobre
  la T10.4 de SL-19 en QA).
  - La cabecera de esos archivos dice «Solo lo edita la rama de esta feature».
  - Es una nota de estado, no código, y SL-19 ya está mergeada. El leader decide si se queda aquí o se
    mueve.
  - No bloquea.

### Veredicto de la vuelta 2

**OK.** B1 está cerrado y verificado con dos mutaciones propias:
- una que borra jobs de plataforma cae;
- un escritor concurrente simulado no tumba el test.

m1–m8 están cerrados, y m5 y m6 los maté con mutaciones propias. Queda 1 menor nuevo (m9) que no
bloquea. Siguen pendientes, fuera de esta revisión, `gate-completo` en el PR y las puertas humanas T2b
y T12.
