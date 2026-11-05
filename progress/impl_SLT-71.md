# impl SLT-71 — geo-jerarquica-transito-analitica

Bitácora del implementer. Spec: `specs/SLT-71-geo-jerarquica-transito-analitica/`.

## Base de datos de esta feature

- Base local desechable **`logistic_slt71`**, en el mismo Postgres de `localhost` que la de desarrollo.
  La URL sale del `DATABASE_URL` del `.env` de la raíz cambiando solo el nombre de la base; no se
  escribe en ningún archivo del repo.
- Creada el 2026-11-04 con `CREATE DATABASE`, `pnpm exec prisma migrate deploy` (todas las migraciones,
  hasta `20261104130100_historial_accion_plan_tipo_cobro_cambiado`) y `pnpm run db:seed`.
- Se queda para las tandas siguientes. **No** se usa la base compartida `logistic` (tiene drift de
  migraciones; lo arregla el humano).

## F2.1 tanda 1 — integración de `dev`, T0 y T1 (backend_dev, 2026-11-04)

### Integración de `origin/dev`

- `git merge origin/dev` en **`c26cd50a`**, desde `origin/dev` = **`c301fc87`** (con SLT-64 PR #77 y
  SL-42 PR #76 dentro).
- Un conflicto, trivial: `docs/architecture.md`. Las dos ramas añadían entradas (geografía jerárquica
  SLT-43/44 por la rama; catálogo de vehículos SL-42 por `dev`). Se quedan las dos, en ese orden.
- Auto-mezclados sin conflicto: `db/schema.prisma`, `lib/db/excepciones-aislamiento.ts` (+1 entrada
  SL-42), `lib/db/modelos-de-negocio.ts` (+`VehiculoRastro`), `lib/types/historial-accion.ts`,
  `progress/deudas.md`. Ningún recuento que recalcular.
- Tras el merge: `tsc --noEmit` verde (después de borrar `.next/types`, artefacto ignorado que aún
  apuntaba a `/configuracion/vehiculos`, retirada por SL-42) y guardias con un único rojo heredado
  (abajo).
- Los nueve repositorios del alcance son idénticos en la rama y en `c301fc87`
  (`git diff origin/dev HEAD -- lib/repositories/{…}Repository.ts` vacío): SLT-65 no los toca (su R28)
  y `CicloVidaRepository.ts` ya es la versión de SLT-64.

### T0.1 — Llamadores de las lecturas (contexto)

Resultado: **ninguna lectura de analítica ni de las que comparten el recorte corre en
`comoPlataforma`, y ningún camino genera el informe de tránsito en plataforma ni sin contexto.** No
hay que parar.

| lectura | llamador | punto de entrada | contexto |
|---|---|---|---|
| `ConteoPorStatusRepository.contarPorStatus` | `lib/actions/conteo-por-status.ts:47` | action | sesión; `exigirModuloActivo("analitica")` + `prepararConteoEntregas` |
| `ConteoEntregasRepository.contar` (→ `contarPorStatus`) | `lib/actions/conteo-entregas.ts:62` | action | sesión; ídem |
| `ConteoCargadasPorDiaRepository` | `lib/actions/conteo-cargadas-por-dia.ts:47` | action | sesión; ídem |
| `ConteoDevolucionesRepository` | `lib/actions/conteo-devoluciones.ts:50` | action | sesión; ídem |
| `CicloVidaRepository` | `lib/actions/ciclo-vida.ts:51` | action | sesión; ídem |
| `CohorteCargaRepository` | `lib/actions/cohorte-carga.ts:66` | action | sesión; ídem |
| `ConteoHoyGestionRepository` | `lib/actions/conteo-hoy-gestion.ts:57` | action | sesión; ídem |
| `ConteoProductosRepository` | `lib/actions/conteo-productos.ts:55` | action | sesión; `prepararConsultaProductos` |
| `DineroProductosRepository` | `lib/actions/conteo-productos.ts:64`, `lib/actions/detalle-dinero-producto.ts:102` | actions | sesión; ídem |
| (las nueve, con caché) | `lib/cache/next-analitica-cache.ts:101` | `unstable_cache` de las actions de arriba | `conEmpresa(organizacionId, …)` |
| `InformeTransitoRepository` (vista previa) | `lib/actions/informe-transito.ts:45` | action, solo `maestro` | sesión |
| `InformeTransitoRepository` (envío) | `lib/whatsapp-envios/informes/transito/informe.ts:75` ← `informes/catalogo.ts` ← `EjecucionEnvioService` | jobs `whatsapp_envio_programado`/`_ejecucion`/`_reintento` en `app/api/cron/procesar-jobs/route.ts:266` (`conSuEmpresa`) | `conEmpresa` del job (`route.ts:114`) |

Detalle de lo comprobado:

- **El superadmin no llega a analítica.** `ROLES_SIN_ANALITICA = declararRolesNoLectores(ROLES_PLATAFORMA)`
  (`lib/analytics/alcance.ts:171`); `prepararConteoEntregas` (`entregas-conteo.ts:187`) y
  `resolverAlcanceProductos` (`productos-consulta.ts:108`) lo niegan con `rol_sin_analitica`.
- **La API de analítica** (`lib/api/analitica-integrador.ts`) no usa ninguno de estos repositorios
  (rollup operativo y `OrdenRepository`), y corre en `conEmpresaDeLaKey` (`api-key-request.ts:79`).
- **Los jobs del informe siempre tienen empresa.** `conSuEmpresa` solo corre en plataforma un job **sin**
  `organizacion_id` y no recurrente (`route.ts:121–122`). Los de envío heredan la empresa del DEFAULT
  de `jobs.organizacion_id` (`current_setting('app.organizacion_id')`, migración
  `20261022130200_jobs_organizacion_id`), y todos se encolan dentro de una empresa:
  - `whatsapp_envio_programado`: `WhatsappEnvioService.ts:329` (action con sesión),
    `whatsapp-envio-programado-handler.ts:57` y `whatsapp-envio-mantenimiento-handler.ts:60` (los dos
    ya en el `conEmpresa` del job; el mantenimiento es recurrente y corre por `paraCadaEmpresa`);
  - `whatsapp_envio_ejecucion`: `whatsapp-envio-evento-handler.ts:50` (en el job del evento);
  - `whatsapp_envio_reintento`: `EjecucionEnvioService.ts:428` (en el job).
  - El informe de tránsito no tiene eventos (`informe.ts:141`, `eventos: []`): solo hora fija.
- La rama «job sin empresa en plataforma» solo cubre filas previas a M4 o encoladas desde un script en
  plataforma; ningún script encola jobs de envío (`seed-jobs-whatsapp-envio-mantenimiento.ts` encola el
  mantenimiento, que es recurrente y va por empresa).
- Revisados y sin llegar a estas lecturas: el resto de archivos con `comoPlataforma(` (auth, rastreo
  público, organizaciones, geografía y vehículos de plataforma, planes, push, drenador, scripts geo).

### T0.2 — Fixture `geo-71.ts`

Sobre `geo-65.ts`, por empresa (CR y `XA`): una segunda provincia (cantón y distrito), una orden
entregada con distrito (gestión `entregado` y transición terminal), una devuelta sin distrito
(gestión `novedad`) en la segunda provincia, una devuelta con distrito en la primera, dos en tránsito
(`en_bodega_central`, cargadas hace 40 días, entrada a la central hace 30; una con distrito en la
primera provincia, otra sin distrito en la segunda) y la transición terminal de la `entregada` de
`geo-65`. La orden incoherente (`sembrarOrdenIncoherente`) va en CR. Datos personales: los de
`DATOS_PERSONALES_GEO65`.

Antivacío: `tests/integration/db/geo-71-fixture.test.ts`. Corre las nueve lecturas con el repositorio
de hoy y `filasEnAlerta`, como la app (`comoApp`, actor `maestro`, sin faceta), y exige filas en cada
una; en tránsito, exactamente las dos órdenes de la empresa.

### T1.1 — Medición compartida

`scripts/geo-equivalencia/medicion.ts`: `CORRIDAS`, `LadoMedido`, `MedicionDeLectura<N>`,
`ResultadoDeLectura<N>`, `mediana`, `variacion`, `leeGeografia`, `consultasQueCompletanAntes`,
`EntornoDeMedicion`, `DefinicionDeLectura<N>` (con `bloqueaPorPorcentaje`), `capturar`,
`medirLectura`, `medirOFallar` y `nombreDeError`. Los cuerpos son los de `geo-explain-consultas.ts`.

`geo-explain-consultas.ts` los importa y re-exporta lo que exportaba (`CORRIDAS`, `mediana`,
`variacion`, `consultasQueCompletanAntes`, `leeGeografia`, `LadoMedido`, `EntornoDeMedicion`,
`MedicionDeLectura` y `ResultadoDeLectura` fijados a sus cinco lecturas). Se queda con su regla
(`hayRegresion`, `codigoDeSalida`, `UMBRAL_DE_REGRESION`) y con el `Set` de las que bloquean, que
ahora pasa a la definición en un `medirOFallar` local.

### T1.2 — Copia literal (`scripts/geo-equivalencia/analitica-de-hoy.ts`)

- Tomada de `origin/dev` **`c301fc87`** con `git show c301fc87:lib/repositories/<X>Repository.ts`,
  **antes** de tocar ningún repositorio. Commit solo con ese archivo.
- Cada bloque cita archivo y líneas de `c301fc87`. Los cambios respecto del original están en la
  cabecera del archivo: funciones libres con `cliente`, sufijo `DeHoy`, `FilaCruda` renombradas,
  `comoParametros`/`enLista` copiadas una vez (idénticas en los cuatro orígenes, comprobado por hash).
- Desviación de la tabla de design §7, por SLT-64: `condicionDeVentanaTerminal` ya no existe; se
  copia `condicionDeVentanaDeCierre` como `condicionDeVentanaDeCierreDeHoy`. Las líneas de la tabla
  (de `fe16f5d1`) se reajustan a `c301fc87`:

| función de la copia | origen en `c301fc87` |
|---|---|
| `condicionDeAlcance`, `condicionesDeConsultaDeHoy`, `contarPorStatusDeHoy` | `ConteoPorStatusRepository.ts:60–173`, `:178–212` |
| `condicionesSinFechaDeHoy`, `condicionesDeCargadasDeHoy`, `contarCargadasPorDiaDeHoy` | `ConteoCargadasPorDiaRepository.ts:63–66`, `:107–110`, `:123–201`, `:206–230` (`DIA_CR` se importa) |
| `condicionesDeDevolucionesDeHoy`, `contarDevolucionesPorCausaDeHoy` | `ConteoDevolucionesRepository.ts:41–53`, `:66–119`, `:124–147` |
| `condicionesDeCicloDeHoy`, `condicionDeVentanaDeCierreDeHoy`, `acumularCiclosDeHoy` | `CicloVidaRepository.ts:46–55`, `:68–121`, `:126–153` |
| `filasEnAlertaDeHoy` | `InformeTransitoRepository.ts:23–85`, `:96–132` |
| `contarProductosDeHoy` | `ConteoProductosRepository.ts:49–59`, `:64–107` |
| `dineroProductosDeHoy` | `DineroProductosRepository.ts:97–258`, `:263–361` |
| `condicionesDeCohorteDeHoy`, `cohorteCargaDeHoy` | `CohorteCargaRepository.ts:61–132`, `:137–198` |
| `condicionesDelDiaDeHoy`, `conteoHoyGestionDeHoy` | `ConteoHoyGestionRepository.ts:46–77`, `:82–118` |
| `plegarEnDesenlaces` | re-exportada de `lib/repositories/ConteoEntregasRepository.ts` (no se copia) |

### Archivos

- `docs/architecture.md` (solo la resolución del merge)
- `tests/integration/db/_fixtures/geo-71.ts` (nuevo)
- `tests/integration/db/geo-71-fixture.test.ts` (nuevo)
- `scripts/geo-equivalencia/medicion.ts` (nuevo)
- `scripts/geo-explain-consultas.ts`
- `scripts/geo-equivalencia/analitica-de-hoy.ts` (nuevo)
- `specs/SLT-71-geo-jerarquica-transito-analitica/tasks.md` (T0.1, T0.2, T1.1, T1.2 en `[x]`)
- `progress/impl_SLT-71.md`

### Mapa R → test

Esta tanda no implementa ningún R (T0–T1 son preparación). El fixture y su antivacío sostienen los
tests de R1–R22 de las tandas siguientes; la copia es «el antes» de R1–R5, R8–R10, R17 y R19–R22.

### Corridas (Postgres local `logistic_slt71`, `NODE_OPTIONS=--max-old-space-size=8192`)

Los tests de integración **corrieron** contra `logistic_slt71` (no se saltaron).

```
$ pnpm exec tsc --noEmit                        # tras el merge y otra vez al final
rc=0

$ pnpm exec eslint scripts/geo-explain-consultas.ts scripts/geo-equivalencia/medicion.ts \
    scripts/geo-equivalencia/analitica-de-hoy.ts tests/integration/db/_fixtures/geo-71.ts \
    tests/integration/db/geo-71-fixture.test.ts
(sin salida: 0 errores, 0 avisos)

$ pnpm exec vitest run tests/integration/db/geo-71-fixture.test.ts tests/integration/db/geo-65-fixture.test.ts
 Test Files  2 passed (2)
      Tests  2 passed (2)

$ pnpm exec vitest run tests/integration/db/geo-explain-consultas.test.ts   # T1.1, sin cambios
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ pnpm exec vitest run guard
 Test Files  1 failed | 333 passed (334)
      Tests  4 failed | 4635 passed | 1 skipped (4640)
```

El único rojo de las guardias es heredado y está en `tests/baseline-rojos.json`:
`tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` busca en `init.sh` el marcador
`>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<` y `init.sh` tiene `>>> FIN PASO 2: DEPENDENCIAS <<<`.
`init.sh` y el test son iguales en la rama y en `origin/dev`; el merge no lo toca.

### Grafo de código

No se usó el MCP `codebase-memory-mcp`: todo con Grep/Read, porque el índice del worktree no estaba
garantizado tras el merge.

### Veredicto

Tanda 1 cerrada: `dev` integrado con SLT-64, contextos comprobados sin llamadores en plataforma, fixture
con antivacío verde, medición extraída sin cambiar su test y copia literal de `c301fc87` en su propio
commit; T2 sin empezar.

## F2.1 tanda 2 — T2 cerrada; T3 PARADA antes de tocar los repositorios (backend_dev, 2026-11-04)

### T2.1 — `sqlLugarEn` y `PROFUNDIDAD_DEL_NIVEL`

- `lib/repositories/_shared/lugar-orden.ts`: `PROFUNDIDAD_DEL_NIVEL` (movida, mismo valor) y
  `sqlLugarEn(ids)` →
  `(o."distrito_id" = ANY($1::text[]) OR (o."distrito_id" IS NULL AND o."canton_id" = ANY($2::text[])))`.
  Un array por rama, copiado; sin `COALESCE`.
- `lib/repositories/OrdenRepository.ts`: solo la importación de `PROFUNDIDAD_DEL_NIVEL` y el borrado de
  su declaración (R25).
- `tests/unit/repositories/lugar-orden.test.ts` ampliado (forma, parámetros, copia, profundidades).

### T2.2 — `lugares-del-filtro.ts`

- `lib/repositories/_shared/lugares-del-filtro.ts`: `FacetasGeograficas`, `LugaresDelFiltro`,
  `SIN_FACETAS_GEOGRAFICAS`, `tieneFacetasGeograficas`, `resolverLugaresDelFiltro` (puro),
  `condicionesDeLugar` (puro; `[]` → `FALSE`) y `lugaresDelFiltro` (carga el catálogo solo con faceta).
- `tests/unit/repositories/lugares-del-filtro.test.ts`: catálogo de 4 niveles; R1, R3, R5 y el rechazo de
  plataforma (R13) que sube tal cual.

### BLOQUEO — aserciones de salida fuera de design §11.1 (T3.1–T3.3)

R1 obliga a mandar los ids de cada faceta como **un parámetro de tipo array** (`= ANY($ids)`). Hoy
viajan como un parámetro escalar por id (`IN ($1, $2)`). Por eso cambian los **parámetros** de las
condiciones, no solo su texto. Design §11.1 solo deja cambiar el texto del SQL. Estas aserciones de
parámetros no están en esa lista y no pueden quedar verdes con R1:

| archivo:línea | aserción de hoy | por qué no puede seguir verde |
|---|---|---|
| `tests/unit/analytics/conteo-por-status-sql.test.ts:111–115` | `parametrosDe({ zona_id: ["z1","z2"], canton_id: ["c1"] })` `toEqual(["z1","z2","c1"])` | con faceta, los parámetros de `c1` son dos arrays (`[…ids], […ids]`); sin faceta resuelta, `c1` no está |
| `tests/unit/analytics/conteo-cargadas-servicio.test.ts:205–207` | `parametrosDe(...)` `toEqual(expect.arrayContaining(["z1","p1","c1","d1","t1"]))` | `p1`, `c1` y `d1` viajan dentro de arrays, no como escalares |
| `tests/unit/analytics/cohorte-carga-sql.test.ts:152` | por faceta, `parametrosDe(consulta)` `toContain("x1")` | para las tres geográficas, `x1` va dentro de un array (o, si no está en el catálogo, la faceta es `FALSE` y no hay parámetro) |

Además, para tenerlo en cuenta (no son aserciones, pero el reviewer lo verá en el diff):

- Los helpers `sqlDe` y `parametrosDe` de esos tests, y las llamadas a `condicionesDeConsulta(consulta)`
  de `conteo-productos-sql.test.ts` y `dinero-productos-sql.test.ts`, tienen que pasar el segundo
  parámetro `lugares`, que es obligatorio (§3.3). Esto cambia la **entrada**: no es un doble de
  `$queryRaw`.
- Las líneas de §11.1 se movieron con el merge de `dev`. Hoy, `ciclo-vida.test.ts` tiene el bucle en
  `:94–96` (§11.1 dice `:105`) y `conteo-devoluciones.test.ts` en `:139–141`. Son las mismas
  aserciones.

**Decisión que pide el humano:** ampliar §11.1 con las tres filas de arriba. La forma propuesta: el
parámetro de una faceta geográfica pasa a ser el array de ids resueltos, por ejemplo
`["z1","z2",["c1",…],["c1",…]]`. O bien la alternativa que el humano prefiera. Hasta entonces, T3.1–T3.4
no empiezan y T4 queda sin tocar. No se modificó ningún test existente.

### Corridas (Postgres local `logistic_slt71`, `NODE_OPTIONS=--max-old-space-size=8192`)

Los tests de integración **corrieron** contra `logistic_slt71`.

```
$ pnpm exec tsc --noEmit
rc=0
$ pnpm exec eslint lib/repositories/_shared/lugar-orden.ts lib/repositories/_shared/lugares-del-filtro.ts \
    lib/repositories/OrdenRepository.ts tests/unit/repositories/lugar-orden.test.ts \
    tests/unit/repositories/lugares-del-filtro.test.ts
(sin salida)
$ pnpm exec vitest run tests/integration/db/geo-consultas-conteo.test.ts \
    tests/unit/repositories/lugar-orden.test.ts tests/unit/repositories/lugares-del-filtro.test.ts
 Test Files  3 passed (3)
      Tests  33 passed (33)
$ pnpm run test:guardias
 Test Files  1 failed | 333 passed (334)
      Tests  4 failed | 4635 passed | 1 skipped (4640)   # solo el baseline dependencias-declaradas-presentes
```

### Mapa R → test (actualizado)

| R | test | estado |
|---|---|---|
| R1 | `tests/unit/repositories/lugares-del-filtro.test.ts` (resolver, condiciones); `lugar-orden.test.ts` (forma de `sqlLugarEn`) | unidad hecha; integración en T3.4 (pendiente) |
| R3 | `lugares-del-filtro.test.ts` (otro nivel, ausente, todos inválidos → `[]` → `FALSE`) | unidad hecha; integración en T3.4 |
| R5 | `lugares-del-filtro.test.ts` (sin faceta no crea ni carga el catálogo; sin condiciones) | unidad hecha; integración en T3.4 |
| R13 | `lugares-del-filtro.test.ts` (el rechazo `EmpresaNoResuelta` sube tal cual) | parcial; integración en T3.4/T4.2 |
| R2, R4, R6–R12, R14–R25 | — | pendientes (T3–T8) |

### Veredicto

T2.1 y T2.2 cerradas y en verde. T3 parada por tres aserciones de parámetros que §11.1 no cubre;
espera la decisión del humano.

## F2.1 tanda 2 (continuación) — T3 implementada en el árbol, PARADA por `alcance-dinero.guardia` (backend_dev, 2026-11-04)

El humano autorizó el 2026-11-04 las tres aserciones de parámetros del bloqueo anterior: el array de ids
resueltos por faceta, y `FALSE` sin parámetro cuando el id no está en el catálogo. Con eso, T3.1–T3.3 se
implementaron. **No hay commit:** el cambio deja en rojo una aserción existente que no está autorizada.

### BLOQUEO 2 — `tests/unit/analytics/alcance-dinero.guardia.test.ts:222`

```ts
it("(2) el repositorio de dinero IMPORTA `condicionesDeConsulta` y la usa", () => {
  const codigo = quitarComentarios(fs.readFileSync(FUENTE_DINERO, "utf8"));
  expect(codigo).toContain("@/lib/repositories/ConteoPorStatusRepository");
  expect(codigo).toContain("condicionesDeConsulta(consulta)");   // :222
});
```

- Design §3.3 hace obligatorio el segundo parámetro, así que `DineroProductosRepository` llama a
  `condicionesDeConsulta(consulta, lugares)`. El literal `condicionesDeConsulta(consulta)` desaparece del
  código y la aserción `:222` cae.
- La intención de la guardia, «usa el `where` compartido y no uno propio», se sigue cumpliendo: el
  bloque (2 bis) de la misma guardia, que prohíbe recortes escritos a mano, sigue en verde.
- Propuesta para el humano: `:222` pasa a `toContain("condicionesDeConsulta(consulta, lugares)")`, o a
  una regex `condicionesDeConsulta\(consulta\b`. La línea sintética `:238` (autocomprobación de 2 ter) no
  necesita cambiar: sigue detectando el recorte a mano.

Es el único rojo nuevo. `pnpm run test:guardias` da `Tests 5 failed`: 4 del baseline
`dependencias-declaradas-presentes` y este.

### Lo que está en el árbol, sin commit

- Repositorios (design §3.3–3.4): `ConteoPorStatusRepository`, `ConteoDevolucionesRepository`,
  `ConteoCargadasPorDiaRepository`, `CicloVidaRepository` (sitios 2–5), y `ConteoProductosRepository`,
  `DineroProductosRepository`, `CohorteCargaRepository` y `ConteoHoyGestionRepository` (comparten el
  recorte).
  - `lugares` es obligatorio en `condicionesDeConsulta`, `condicionesSinFecha`, `condicionesDeCargadas`,
    `condicionesDeDevoluciones`, `condicionesDeCiclo`, `condicionesDeCohorte` y `condicionesDeHoy`.
  - Las tres facetas geográficas salen de `facetas` y en su sitio va `...condicionesDeLugar(lugares)`,
    entre zona y tienda.
  - Cada repositorio tiene el catálogo por instancia (`catalogoGeografico()`) y llama a
    `lugaresDelFiltro` en el método. El cliente pasa a `Pick<PrismaClient, "$queryRaw"> & CatalogoPrismaClient`.
- Tests, cambios de **entrada**:
  - nuevo `tests/unit/analytics/_catalogo-facetas.ts`, con el catálogo `p1 → c1 → d1`, `lugaresDe` y
    `delegadosDelCatalogo`;
  - un envoltorio con `lugaresDe(c.filtro)` en `conteo-por-status-sql`, `cohorte-carga-sql`,
    `conteo-cargadas-servicio`, `ciclo-vida`, `conteo-devoluciones`, `conteo-hoy-gestion-servicio`,
    `conteo-productos-sql` y `dinero-productos-sql`;
  - delegados del catálogo en los dobles de `conteo-productos-sql`, `dinero-productos-sql` y
    `cohorte-consulta-unica`. `cohorte-consulta-unica` no está en la lista de archivos del design, pero
    solo cambia su doble (un caso con las seis facetas); ningún `expect`.
- Tests, cambios de **aserción**, todos autorizados (§11.1 y la decisión del 2026-11-04):

| archivo:línea (hoy) | cambio |
|---|---|
| `conteo-por-status-sql.test.ts:111–113` (antes 105–107) | zona/tienda `IN (`; tres condiciones `o."distrito_id" = ANY(` |
| `conteo-por-status-sql.test.ts:117–125` (antes 111–115) | `["z1","z2",["c1","d1"],["c1","d1"]]` |
| `conteo-por-status-sql.test.ts:~129–131` (antes 121–123) | zona sin `IN`, sin `= ANY(` |
| `conteo-devoluciones.test.ts:145–147` (antes 139–141) | zona/tienda `IN`; tres `= ANY(` |
| `ciclo-vida.test.ts:100–102` (antes 94–96; §11.1 decía 105) | ídem |
| `conteo-cargadas-servicio.test.ts:208–213` (antes 202–207) | ídem, y parámetros con los arrays `["c1","d1","p1"]`, `["c1","d1"]`, `["d1"]` |
| `cohorte-carga-sql.test.ts:143–147` y `:152–153` | las tres geográficas → `FALSE`; `x1` no viaja como parámetro en ellas |

### Corridas (Postgres local `logistic_slt71`, `NODE_OPTIONS=--max-old-space-size=8192`)

```
$ pnpm exec tsc --noEmit
rc=0
$ pnpm exec eslint <archivos tocados>
0 errores, 2 avisos ya existentes (`_c` sin usar en ciclo-vida.test.ts:302 y conteo-devoluciones.test.ts:326)
$ pnpm exec vitest run tests/unit/analytics tests/unit/repositories tests/unit/actions
 Test Files  1 failed | 429 passed (430)        # el rojo: alcance-dinero.guardia (2)
$ pnpm exec vitest run <integración de T3.4: conteo-productos.int, dinero-productos.int,
    ciclo-vida-gestion-final.int, cohorte-carga-*.int, conteo-por-status-cohorte.int,
    efectividad-por-rol.int, 455/caracterizacion/sql-crudo-*, geo-71-fixture>
 Test Files  5 failed | 14 passed (19)
      Tests  80 passed | 38 skipped (118)
$ pnpm run test:guardias
 Tests  5 failed | 4634 passed | 1 skipped     # 4 baseline + alcance-dinero (2)
```

Los tests de integración **corrieron** contra `logistic_slt71`. Los 5 archivos en rojo son rojos de
**entorno**, y están en `tests/baseline-rojos.json`: piden datos sembrados (geografía, zona, órdenes)
que `db:seed` no crea, y fallan en su `beforeAll` antes de leer nada. Son
`conteo-productos.int`, `dinero-productos.int`, `sql-crudo-avisos-y-corte`, `sql-crudo-cron-devoluciones`
y `sql-crudo-tablero-dia`. T3.4 cita los dos primeros; contra esta base no se pueden dar por verdes.
Los demás de T3.4 pasan: `conteo-por-status-cohorte`, `efectividad-por-rol`, `cohorte-carga-*`,
`ciclo-vida-gestion-final`, `sql-crudo-analitica` y `sql-crudo-conteos`.

### Pendiente

- T3.1–T3.3: commit en cuanto el humano decida sobre `alcance-dinero.guardia.test.ts:222`.
- T3.4 (`geo-analitica-lugar.test.ts`), T4.1 y T4.2: sin empezar.

## F2.1 tanda 2 (cierre) — T3.1–T3.4, T4.1 y T4.2 cerradas (backend_dev, 2026-11-04)

Decisiones del humano del 2026-11-04, aplicadas:
1. `alcance-dinero.guardia.test.ts:222` exige ahora `condicionesDeConsulta(consulta, lugares)` (texto
   exacto, con comentario). Va en su propio commit.
2. T3.4 lo cierra `geo-analitica-lugar.test.ts` sobre `geo-71`. `conteo-productos.int` y
   `dinero-productos.int` siguen como rojos de baseline y no se arreglan. Su «Hecho» se enmendó en una
   línea de `tasks.md`.

### Commits

| commit | qué |
|---|---|
| `dfc4f9b1` | T3.1: `ConteoPorStatusRepository` y `ConteoDevolucionesRepository`, más `ConteoProductos` y `DineroProductos`, porque comparten `condicionesDeConsulta`; con sus tests y `_catalogo-facetas.ts` |
| `3ff18057` | la guardia `alcance-dinero:222` (decisión 1) |
| `fcf11237` | T3.3 con `ConteoCargadasPorDiaRepository`: `condicionesSinFecha` es el constructor que usan cohorte y contador de hoy, así que va con ellos. Marca T3.3 |
| `eba8cfdf` | T3.2: `CicloVidaRepository`, sobre SLT-64. Marca T3.2; cargadas ya entró en `fcf11237` |
| `0360a80d` | T3.4: `geo-analitica-lugar.test.ts`; `geo-71.ts` admite `{ incoherente: false }` |
| `e751eed0` | T4.1: `InformeTransitoRepository` y el doble de `informe-transito-composicion.test.ts` |
| `aac13ebd` | T4.2: `geo-transito-nombres.test.ts` |

### T4.1 — `InformeTransitoRepository`

- `filasEnAlerta`:
  - proyecta `c."canton_id", c."distrito_id"`;
  - ya no tiene los `JOIN` a `canton` ni a `distrito`;
  - sin filas devuelve `[]` sin cargar el catálogo;
  - con filas carga `deLaEmpresa()` una vez por instancia y nombra con `nodo(...)`.
- Un nodo ausente:
  - se recorren todas las filas, juntando los nodos y las órdenes afectadas, sin duplicados y
    ordenados;
  - se escribe una línea con `logger.logError("analitica - informe transito - error: nodos ausentes del catalogo=[…] ordenes=[…]")`;
  - se lanza `CatalogoGeograficoInconsistente(primerNodo, …)`;
  - `seleccionarTransito` la envuelve como `informe transito: filasEnAlerta falló`.
- El logger es el segundo parámetro opcional del constructor (`defaultLogger`); el prefijo se exporta
  como `PREFIJO_LOG_NODO_AUSENTE`.
- `informe-transito-composicion.test.ts`: su doble de `$queryRaw` devuelve `canton_id`/`distrito_id` y
  gana los delegados del catálogo. Es un cambio de **entrada**: sus tres `expect` siguen igual. El
  archivo no está en la lista del design.

### Tests de entrada fuera de la lista de archivos del design

Solo cambia el doble o la entrada; ningún `expect`:

- `cohorte-consulta-unica.test.ts`;
- `informe-transito-composicion.test.ts`.

### Notas

- La copia congelada es de funciones libres, con un nivel menos de sangría. Por eso el texto de su SQL
  difiere del de los repositorios en espacios en blanco. R5 se compara con los espacios normalizados
  (`geo-analitica-lugar.test.ts`).
- Las suites `informe-transito-{catalogo-real,hitos,parados,seleccion,zonas}` (integración) son rojos
  de entorno, en `tests/baseline-rojos.json`: piden un distrito sembrado que `db:seed` no crea, y
  fallan igual antes y después de este cambio.
  - **Riesgo para el día que se siembren:** leen sin `conEmpresa` y como dueño, y `deLaEmpresa` toma
    una empresa cualquiera (`findFirst` sin `where`). Si su país no es el del distrito sembrado,
    `filasEnAlerta` fallaría por R12. Hoy no se puede ver.

### Mapa R → test

| R | test |
|---|---|
| R1 | `tests/unit/repositories/lugares-del-filtro.test.ts`; `tests/unit/repositories/lugar-orden.test.ts`; `tests/integration/db/geo-analitica-lugar.test.ts` (equivalencia por faceta y profundidad 4 por entrada) |
| R2 | `geo-analitica-lugar.test.ts` (combinaciones de facetas y zona; el alcance es la condición 0 con faceta); `conteo-por-status-sql.test.ts` y demás de §11.1 |
| R3 | `lugares-del-filtro.test.ts`; `geo-analitica-lugar.test.ts` (id de cantón como distrito, provincia de otro país, provincia como cantón → 0 en las cinco) |
| R4 | `geo-analitica-lugar.test.ts` (CR, XA y alcance de tienda, sin y con rango `mes`, frente a la copia; y la incoherente como única diferencia) |
| R5 | `lugares-del-filtro.test.ts` (sin faceta no se crea el catálogo); `geo-analitica-lugar.test.ts` (ninguna carga de nodos, SQL y parámetros de hoy); los unitarios de §11.1 sin faceta |
| R6 | `tests/unit/analytics/conteo-entregas-contrato.test.ts` y `entregas-filtro-analitica.test.ts`, sin cambios; `git diff origin/dev...HEAD -- lib/analytics/` vacío (se anota en T8.1) |
| R7 | `conteo-productos-sql.test.ts`, `dinero-productos-sql.test.ts` y `alcance-dinero.guardia.test.ts` (con `lugares`); `geo-analitica-lugar.test.ts` (productos, dinero, cohorte y hoy frente a la copia) |
| R8, R9 | `tests/integration/db/geo-transito-nombres.test.ts` (filas y modelo de la selección iguales a hoy) |
| R10 | `geo-transito-nombres.test.ts` (consultas con 1 y con 40 órdenes; sin `FROM/JOIN "canton"/"distrito"`); `informe-transito-repo-consultas.test.ts` sin cambios |
| R11 | `geo-transito-nombres.test.ts` |
| R12 | `geo-transito-nombres.test.ts` (prefijo, ids de nodo y de orden, sin `DATOS_PERSONALES_GEO65` ni nombres de nodo; contraprueba sin log) |
| R13 | `lugares-del-filtro.test.ts`; `geo-analitica-lugar.test.ts` y `geo-transito-nombres.test.ts` (catálogo solo de XA, una carga por instancia, `EmpresaNoResuelta` en plataforma) |
| R14–R25 | pendientes (T5–T8) |

### Corridas (Postgres local `logistic_slt71`, `NODE_OPTIONS=--max-old-space-size=8192`, desde la raíz del worktree)

Los tests de integración **corrieron** contra `logistic_slt71`; no se saltaron.

```
$ pnpm exec tsc --noEmit
rc=0
$ pnpm exec eslint <archivos tocados de T3/T4>
0 errores (2 avisos `_c` ya existentes en ciclo-vida/conteo-devoluciones)
$ pnpm exec vitest run tests/unit/analytics tests/unit/repositories tests/unit/actions tests/unit/whatsapp-envios
 Test Files  449 passed (449)
      Tests  6190 passed (6190)
$ pnpm exec vitest run geo-analitica-lugar geo-transito-nombres geo-71-fixture
 Test Files  3 passed (3)        Tests  14 passed (14)
$ pnpm exec vitest run ciclo-vida-gestion-final.int conteo-por-status-cohorte.int efectividad-por-rol.int \
    geo-65-fixture geo-consultas-conteo
 Test Files  5 passed (5)        Tests  44 passed (44)
$ pnpm exec vitest run cohorte-carga-*.int 455/caracterizacion/sql-crudo-{analitica,conteos}
 Test Files  10 passed (10)      Tests  40 passed (40)
$ pnpm exec vitest run tests/integration/db/informe-transito-
 Test Files  5 failed (5)        Tests  11 failed (11)
   # 11 × «475: no hay ningun usuario en la base de test»: rojo de entorno del baseline, igual que antes
$ pnpm run test:guardias
 Test Files  1 failed | 333 passed (334)
      Tests  4 failed | 4635 passed | 1 skipped (4640)   # solo el baseline dependencias-declaradas-presentes
```

`conteo-productos.int` y `dinero-productos.int` siguen en rojo de baseline (decisión 2): piden
geografía sembrada.

Hubo una corrida conjunta de unidad e integración que quedó colgada de noche: la máquina se suspendió y
los tiempos subieron a ~31.400 s. Dio muchos timeouts de 20 s por locks y conexiones caídas. Se
descartó y se repitió por grupos con la máquina activa; esos grupos son los resultados de arriba.

### Veredicto

T3.1–T3.4, T4.1 y T4.2 cerradas. Solo cambiaron las aserciones autorizadas (§11.1, las tres de
parámetros y la guardia `alcance-dinero:222`). Integración verde salvo los rojos de entorno del
baseline. T5 sin empezar.

## F2.1 tanda 3 — T5, T6 y T7 cerradas (backend_dev, 2026-11-05)

### Commits

| commit | qué |
|---|---|
| `b61f9d64` | T5.1: `scripts/geo-equivalencia-analitica.ts` y `pnpm geo:equivalencia-analitica` |
| `b7ca6a36` | T5.2: `tests/integration/db/geo-equivalencia-analitica.test.ts` |
| `029f738d` | T6.1: `scripts/geo-explain-analitica.ts`, `pnpm geo:explain-analitica` y la suma sin catálogo en `medicion.ts` |
| `b794c905` | T6.2: `tests/integration/db/geo-explain-analitica.test.ts` |
| `edfc87b2` | T7.1: `geografia-lecturas-sin-nodo-fk.guardia` y `geo-lecturas-sin-backfill` ampliadas (R14) |
| `b385b6be` | T7.2: antivacío de `catalogo-geografico-sin-instancia-de-modulo.guardia` (R16) |
| `eaec3e99` | T7.3: la URL no local de los dos tests de scripts se arma por partes (la marcaba `recursos-origen-fuera`, SL-34) |
| (este) | bitácora y T7.3 en `[x]` |

### T5.1 — `geo:equivalencia-analitica` (design §8)

- Reutiliza sin copiar:
  - `crearClienteDeSoloLectura` y `leerArgumentos` (SLT-44);
  - `compararPorId`, `Cifras` y `Diferencia` (`comparacion.ts`);
  - `esBaseLocal` (`geo-explain-consultas.ts`) y `nombreDeError` (`medicion.ts`);
  - `paraCadaEmpresa` y `resolverLugaresDelFiltro`.

  No abre plataforma, así que no entra en `EXCEPCIONES_DE_PLATAFORMA`.
- Bloques:
  - `analitica`: las 5 lecturas;
  - `comparten-recorte`: productos, dinero (importe total y número de órdenes), cohorte (solo con rango) y contador de hoy;
  - `transito`: por `ordenId`. `canton`, `distrito`, `destinatario`, `numRemision`, `numGuia` y `montoCobrar` solo dicen
    «distinto». Un fallo de `filasEnAlerta` (R12) cuenta como diferencia, con el nombre del error;
  - `cadena-incoherente`.
- Filtros (`filtrosDeLaEmpresa`, exportada), cada uno sin rango y con `mes`:
  - sin filtro;
  - cada provincia del catálogo (`PROFUNDIDAD_DEL_NIVEL.provincia`);
  - los `--muestra` cantones y distritos con más órdenes vivas;
  - provincia y cantón a la vez;
  - el cantón con más órdenes pedido como distrito. Los dos lados tienen que dar cero; si no, es diferencia.
- `--muestra` vale **20** por defecto (design §8). El parser de SLT-44 trae 200, así que se sustituye solo si no se pasa.
- **Cadena incoherente: cómo se aplica «si son la única diferencia, sale 0»**. Design §8 no fija el mecanismo. Un par
  (lectura, filtro) que difiere se disculpa si se cumplen las tres:
  - el filtro tiene faceta geográfica;
  - alguna orden incoherente entra por un lado y no por el otro (columna de hoy frente a lugar con los ids resueltos);
  - la cifra de órdenes difiere como mucho en ese número.

  Se cuenta aparte (`solo-incoherentes`) y no cambia la salida. **Para revisión del reviewer.**

### T6.1 — `geo:explain-analitica` (design §9)

- Las seis lecturas:
  - las de analítica, con `provincia_id` = la provincia con más órdenes vivas de la empresa;
  - tránsito, con `PARAMETROS_POR_DEFECTO` y todas las zonas. Las zonas se leen fuera de la medición.

  Se crea un repositorio nuevo por corrida, así que la carga del catálogo entra en cada una.
- `medicion.ts` gana `leeElCatalogo` y `LadoMedido.sinCatalogo` (opcional; `medirLectura` lo rellena siempre).
  - Tablas del catálogo: las de design §9.3 **más `zona`**, porque Prisma pide la zona de `zona_distrito` en una consulta
    aparte (ya lo anota `TABLAS_DE_LA_GEOGRAFIA` de SLT-65).
  - `geo-explain-consultas.test.ts` pasa sin cambios.
- `veredicto`, en este orden:
  1. Seq Scan nuevo (`despues > antes`) → `regresion`, en las seis.
  2. Bloquea y sube más de 20 % tanto el total como la suma sin catálogo → `regresion`.
  3. Bloquea y sube más de 20 % solo el total → `costo-fijo-del-catalogo`. Se imprime con las dos medianas sin catálogo.
  4. En otro caso → `ok`.

  Ciclo de vida imprime el porcentaje y no bloquea.
- Salida (R22): 2 si alguna lectura falló, 1 si hay regresión, 0 en otro caso.
- Sin `--empresa`, toma la empresa con más órdenes vivas. Las cuenta empresa por empresa con `paraCadaEmpresa`, sin abrir
  plataforma.

### T7

- **T7.1.** La guardia barre enteros los 10 archivos de design §6: tránsito, los 4 de analítica, los 4 que comparten el
  recorte y `lugares-del-filtro.ts`.
  - Cada uno tiene su ancla antivacío (`lugaresDelFiltro(` o `deLaEmpresa()`), y hay dos contrapruebas.
  - `geo-lecturas-sin-backfill` gana el caso SLT-71 en la base propia: las 9 lecturas con 6 facetas y tránsito dan lo mismo
    con la columna llena, en NULL y desviada.
- **T7.2.** El antivacío suma `InformeTransitoRepository` y `ConteoPorStatusRepository`. Las calcula el AST; el cálculo no
  cambia.
- **T7.3.** `pnpm run test:guardias` completo: solo queda el rojo de baseline `dependencias-declaradas-presentes` (4 tests).
  `geografia-sin-cte-recursiva` (R15), `alcance-obligatorio` y `modulo-puro` están en verde y sin cambios.

### Ninguna aserción existente cambiada

Esta tanda no tocó ningún `expect` existente:
- `geo-lecturas-sin-backfill` y las dos guardias solo **añaden** casos;
- el antivacío de la guardia del catálogo añade dos nombres al `arrayContaining`.

### Scripts sobre `logistic_slt71`

- La URL se arma con el `DATABASE_URL` de `../../.env`, cambiando solo el nombre de la base. No se imprime, y se aborta si el
  host no es local.
- La base tiene migraciones y seed, pero **ninguna empresa**:

```
$ pnpm -s geo:equivalencia-analitica
total: empresas=0 con-diferencias=0 cadena-incoherente=0 fallidas=0 salida=0
$ pnpm -s geo:explain-analitica
no hay ninguna empresa con ordenes vivas            # salida 2
```

Las cifras sobre datos salen de los tests sobre `geo-71` (abajo). Antes del merge, las da T8.3 (una persona, sobre la copia de
producción).

### Mapa R → test (actualizado)

| R | test |
|---|---|
| R1–R13 | como en la tanda 2 (arriba) |
| R14 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` (bloques SLT-71, con contraprueba); `tests/integration/db/geo-lecturas-sin-backfill.test.ts` (caso SLT-71) |
| R15 | `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts`, sin cambios (verde en T7.3) |
| R16 | `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (antivacío ampliado) |
| R17 | `tests/integration/db/geo-equivalencia-analitica.test.ts`: 0 diferencias en CR y XA; la incoherente solo en `cadena-incoherente`, con salida 0; contraprueba con un cantón movido de provincia → salida 1; `--muestra`; argumentos y código de salida |
| R18 | `geo-equivalencia-analitica.test.ts` y `tests/integration/db/geo-explain-analitica.test.ts`: INSERT → 25006; URL no local → sale 2 sin imprimirla; filas iguales; salida sin `DATOS_PERSONALES_GEO65`, nombres de nodo ni SQL |
| R19 | `geo-explain-analitica.test.ts`: seis lecturas, 5 corridas por lado, sumas sin catálogo, provincia con más órdenes |
| R20, R21 | `geo-explain-analitica.test.ts`, unidad de `veredicto`: +21/+21 → regresión; +21/+5 → costo fijo; +19 y +20 → ok; ciclo de vida +50 → ok; Seq Scan nuevo → regresión en las seis. `geo-explain-consultas.test.ts` sin cambios |
| R22 | `geo-explain-analitica.test.ts`: código 0/1/2; con el catálogo roto las seis salen fallidas y el código es 2 |
| R23–R25 | pendientes (T8: comprobaciones de diff y gate) |

### Corridas (Postgres local `logistic_slt71`, `NODE_OPTIONS=--max-old-space-size=8192`, desde el worktree)

Los tests de integración **corrieron** contra `logistic_slt71`; ninguno se saltó.

```
$ pnpm exec tsc --noEmit                       # tras T5, T6 y T7.1
(sin salida, rc=0)
$ pnpm exec eslint <los 8 archivos de la tanda>
(sin salida, rc=0)
$ pnpm exec vitest run tests/integration/db/geo-equivalencia-analitica.test.ts
 Test Files  1 passed (1)      Tests  8 passed (8)
$ pnpm exec vitest run tests/integration/db/geo-explain-analitica.test.ts tests/integration/db/geo-explain-consultas.test.ts
 Test Files  2 passed (2)      Tests  22 passed (22)
$ pnpm exec vitest run tests/integration/db/geo-lecturas-sin-backfill.test.ts
 Test Files  1 passed (1)      Tests  3 passed (3)
$ pnpm exec vitest run tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts
 Test Files  1 passed (1)      Tests  14 passed (14)
$ pnpm exec vitest run tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts
 Test Files  1 passed (1)      Tests  7 passed (7)
$ pnpm exec vitest run recursos-origen-fuera.guardia geo-equivalencia-analitica geo-explain-analitica   # tras eaec3e99
 Test Files  3 passed (3)      Tests  54 passed | 1 skipped (55)
$ pnpm run test:guardias
 Test Files  1 failed | 333 passed (334)
      Tests  4 failed | 4639 passed | 1 skipped (4644)   # solo el baseline dependencias-declaradas-presentes
```

La primera corrida de `test:guardias` dio un rojo nuevo en `recursos-origen-fuera` (SL-34): la URL con credenciales estaba
escrita entera en los dos tests nuevos. Se arregló en `eaec3e99` armando la URL por partes; la guardia no se tocó.

### Grafo de código

No se usó el MCP: todo con Grep/Read, porque el índice del worktree no está garantizado.

### Veredicto

T5.1–T7.3 cerradas: los dos scripts y sus tests en verde sobre `geo-71`, y las guardias en verde salvo el baseline. No se
cambió ninguna aserción existente. T8 sin empezar.

## F2.1 T8.1 — Mapa R → test completo y comprobaciones de diff (backend_dev, 2026-11-05)

**T8.1 queda SIN marcar.** Hay dos motivos:
- la comprobación de R23 contra `origin/dev` no sale vacía;
- R24 depende del gate de CI.

El detalle está abajo; lo decide el leader o el humano.

### Mapa R → test (R1–R25)

Formato: archivo › `describe` › `it` (o solo `it` cuando el `describe` no aporta).

| R | test |
|---|---|
| R1 | `tests/unit/repositories/lugares-del-filtro.test.ts` › «provincia → ella y sus tres niveles por debajo, ordenados por id»; `tests/unit/repositories/lugar-orden.test.ts` › «los ids viajan como UN array por rama, no como un parametro por id»; `tests/integration/db/geo-analitica-lugar.test.ts` › «R1 (profundidad 4): un nodo bajo el distrito pedido aporta sus ordenes, por el dominio y no por la columna» |
| R2 | `geo-analitica-lugar.test.ts` › «R2: con faceta geografica, el alcance sigue siendo la primera condicion de las cinco lecturas»; `lugares-del-filtro.test.ts` › «una condicion por faceta, en el orden provincia, canton, distrito» |
| R3 | `lugares-del-filtro.test.ts` › «R3: si ningun id es valido, la faceta queda `[]` (cero ordenes), nunca omitida» y «R3: una faceta `[]` es `FALSE`, sin array vacio»; `geo-analitica-lugar.test.ts` › «R3: un id de canton pedido como distrito, o uno de otro pais, da cero en las cinco lecturas» |
| R4 | `geo-analitica-lugar.test.ts` › «R1, R2, R4, R7: con la cadena coherente, cada lectura da lo mismo que hoy con cada faceta, combinacion y rango» |
| R5 | `geo-analitica-lugar.test.ts` › «R5: sin faceta geografica no se toca el catalogo y el SQL y los parametros son los de hoy»; `lugares-del-filtro.test.ts` › «R5: sin faceta geografica no crea ni carga el catalogo» |
| R6 | `tests/unit/analytics/conteo-entregas-contrato.test.ts` › «acepta las siete facetas, incluida la cadena geográfica» y `tests/unit/analytics/entregas-filtro-analitica.test.ts` › «las siete facetas viajan con las claves del esquema, y pasan la validación», sin cambios; además, `lib/analytics/` vacío en el diff (abajo) |
| R7 | `tests/unit/analytics/alcance-dinero.guardia.test.ts` › «(2) el repositorio de dinero IMPORTA `condicionesDeConsulta` y la usa»; `tests/unit/analytics/conteo-productos-sql.test.ts` › «el ALCANCE es la PRIMERA condicion, antes que cualquier faceta del cliente»; `geo-analitica-lugar.test.ts` › «R1, R2, R4, R7: …» (productos, dinero, cohorte y contador de hoy frente a la copia) |
| R8 | `tests/integration/db/geo-transito-nombres.test.ts` › «R8, R9: las filas en alerta y el modelo de la seleccion son los de hoy, fila a fila, en las dos empresas» |
| R9 | mismo `it` de R8 (el modelo de `seleccionarTransito`, del que salen totales, variables y PDF) |
| R10 | `geo-transito-nombres.test.ts` › «R10: sin unir con canton ni distrito, y el numero de consultas no depende del de ordenes (1 y 40)»; `tests/unit/whatsapp-envios/informe-transito-repo-consultas.test.ts` › «con 1 orden en alerta» y «con 500 ordenes en alerta (y el PDF de todas)», sin cambios |
| R11 | `geo-transito-nombres.test.ts` › «R11: sin ordenes en alerta, la generacion no carga el catalogo» |
| R12 | `geo-transito-nombres.test.ts` › «R12: un canton y un distrito ausentes del catalogo hacen fallar la generacion con una sola linea de log, solo con ids» |
| R13 | `geo-analitica-lugar.test.ts` › «R13: la empresa XA carga solo su catalogo, una vez por instancia aunque se lea dos veces» y «R13: en plataforma, con faceta, las cinco lecturas fallan con EmpresaNoResuelta sin devolver filas»; `geo-transito-nombres.test.ts` › «R13: XA carga solo su catalogo, una vez por instancia; en plataforma falla con EmpresaNoResuelta» |
| R14 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` › «ni transito, ni los cuatro conteos y ciclo de vida, ni las cuatro que comparten el recorte, ni `lugares-del-filtro` nombran la columna» (con sus contrapruebas SLT-71); `tests/integration/db/geo-lecturas-sin-backfill.test.ts` › «las nueve lecturas de analitica por provincia, canton, distrito y combinacion, y transito: llena = en NULL = desviada» |
| R15 | `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts` › «el barrido lee de verdad (anti-vacuidad)» y el resto del archivo, sin cambios |
| R16 | `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` › «las clases vigiladas estan calculadas y no vacias (antivacio)» y «ninguna `new` de una clase vigilada corre al cargar el modulo» |
| R17 | `tests/integration/db/geo-equivalencia-analitica.test.ts` › «R17: sobre el fixture todo coincide en las dos empresas; …», «R17 contraprueba: un canton movido a otra provincia …» y «R17: --muestra fija cuantos cantones y distritos entran …» |
| R18 | `geo-equivalencia-analitica.test.ts` › describe «R18 — no escribe, solo contra localhost …» (3 `it`); `tests/integration/db/geo-explain-analitica.test.ts` › «R19, R18: mide las seis lecturas …», «R18: con el cliente del script, un INSERT falla con 25006 …» y «R18: con una DATABASE_URL que no es local, …» |
| R19 | `geo-explain-analitica.test.ts` › «R19, R18: mide las seis lecturas con 5 corridas por lado, no escribe y no imprime SQL, nombres ni datos personales» |
| R20 | `geo-explain-analitica.test.ts` › «+21 % total y +21 % sin catalogo → regresion; …», «ciclo de vida con +50 % (total y sin catalogo) es ok: …» y «un Seq Scan sobre `orden` que antes no estaba es regresion en las seis; …» |
| R21 | `geo-explain-analitica.test.ts` › «+21 % total y +21 % sin catalogo → regresion; +21 % total y +5 % sin catalogo → costo fijo del catalogo; +19 % → ok» y «el costo fijo del catalogo se imprime con las dos medianas sin catalogo, sin SQL» |
| R22 | `geo-explain-analitica.test.ts` › «R22: 0 sin regresion (el costo fijo no cuenta), 1 con regresion, 2 si una lectura fallo» y «R22: si la lectura nueva falla al leer, la lectura sale como fallida y el codigo es 2» |
| R23 | Sin test: es la comprobación del diff de `db/` (abajo), como fija design §11. T9 no aplica. **Ver la comprobación: no pasa contra `origin/dev`.** |
| R24 | Las suites existentes con las aserciones intactas salvo las de §11.1 (lista abajo). La parte «las suites de integración de tránsito y los E2E pasan» **no tiene evidencia local**: las 5 `informe-transito-*` de integración son rojos de baseline (sin usuarios sembrados) y el E2E corre solo en `gate-completo` de CI (T8.2). **Hueco hasta CI.** |
| R25 | Sin test: es la comprobación del diff (abajo), como fija design §11 |

**Huecos:**
- R24 queda sin evidencia ejecutada para las integraciones de tránsito y los E2E: se cubre en CI (T8.2).
- R23 y R25 son, por diseño, comprobaciones de diff y no tests.

No se escribió ningún test nuevo en T8.1.

### Comprobaciones de diff

`origin/dev` = `c301fc87`. **Contexto:** la rama está montada sobre SLT-65 (PR #75, sin mergear todavía), que trae
consigo SLT-44 y SLT-43 (`fe16f5d1`). Por eso `origin/dev...HEAD` incluye todo ese stack. Cada comprobación se da dos veces:
- contra `origin/dev`, que es lo pedido;
- solo con lo que hace SLT-71, `c26cd50a..HEAD` (`c26cd50a` es el merge de `origin/dev` = `c301fc87` sobre la base de
  SLT-65).

| check | contra `origin/dev` (`origin/dev...HEAD`) | solo SLT-71 (`c26cd50a..HEAD`) |
|---|---|---|
| R23 `-- db/` | **NO vacío**: `db/schema.prisma` y las 6 migraciones `20261104120000`–`20261104120500` (`geo_enums_nodo_geografico` … `indices_nodo_geografico`), todas de SLT-43, que llegan por la base de SLT-65 | **vacío** |
| R6 `-- lib/analytics/` | **vacío** | **vacío** |
| R25 `GestionOrdenRepository.ts`, `lib/whatsapp-envios/informes/transito/{pdf,calculo,tipos}.ts`, `components/`, `lib/api/` | **ausentes** | **ausentes** |
| R25 `OrdenRepository.ts` (`condicionesSatelite`, `list`) | Diff grande, pero es de SLT-65 y SLT-44 (marcas, catálogo, resolución por nombres) | Solo la importación de `PROFUNDIDAD_DEL_NIVEL` desde `_shared/lugar-orden` y el borrado de su declaración (`:890–893`). `condicionesSatelite` y `list` no se tocan |
| R25 SLT-65 (órdenes, cierres, zonas, dinero) | — | Ningún archivo de SLT-65 en el diff salvo `OrdenRepository.ts` (fila anterior), `scripts/geo-explain-consultas.ts` (solo importa y re-exporta la medición, T1.1) y `_shared/lugar-orden.ts` (gana `sqlLugarEn` y `PROFUNDIDAD_DEL_NIVEL`, design §3.1) |

Fuera de R25, y sin ser de SLT-71, contra `origin/dev` aparece también
`app/(app)/historico/acciones/_components/historial-acciones-filtros-def.ts`. Viene del stack de SLT-65 y no está en
`c26cd50a..HEAD`.

**Lectura:** lo que SLT-71 añade cumple R23, R6 y R25. Contra `origin/dev` literal, R23 solo saldrá vacío cuando SLT-65 (con
SLT-43) entre en `dev` y se integre otra vez (F2.3). Hasta entonces no doy la comprobación por buena.

### R24 — aserciones existentes cambiadas (`c26cd50a..HEAD`)

Se barrieron todos los tests existentes modificados (`--diff-filter=M`), línea a línea. Los cambios de `expect`:

| # | archivo:línea (antes → ahora) | cambio | en §11.1 |
|---|---|---|---|
| 1 | `tests/unit/analytics/conteo-por-status-sql.test.ts:105–107 → 110–113` | `IN (` para las 5 columnas → `IN (` solo zona y tienda + 3 `o."distrito_id" = ANY(` | sí (texto SQL) |
| 2 | `conteo-por-status-sql.test.ts:114 → 122–123` | en el `toEqual` de parámetros, `"c1"` → `["c1","d1"], ["c1","d1"]` | sí (parámetros `:111–115`, decisión del 2026-11-04) |
| 3 | `conteo-por-status-sql.test.ts:121–123 → 130–132` | `not.toContain` de las 4 columnas → `not.toContain` de `zona_id` + `not.toContain("= ANY(")` | sí (texto SQL) |
| 4 | `tests/unit/analytics/conteo-devoluciones.test.ts:139–141 → 144–147` | como el #1 | sí |
| 5 | `tests/unit/analytics/ciclo-vida.test.ts:94–96 → 99–102` | como el #1 | sí (§11.1 dice `:94–96`) |
| 6 | `tests/unit/analytics/conteo-cargadas-servicio.test.ts:202–204 → 207–210` | como el #1 | sí (§11.1 dice `:202`) |
| 7 | `conteo-cargadas-servicio.test.ts:206 → 212` | `arrayContaining(["z1","p1","c1","d1","t1"])` → `arrayContaining(["z1",["c1","d1","p1"],["c1","d1"],["d1"],"t1"])` | sí (parámetros `:205–207`) |
| 8 | `tests/unit/analytics/cohorte-carga-sql.test.ts:143–145 → 148–152` | la columna esperada por faceta geográfica, `o."provincia_id"` etc. → `"FALSE"` (`x1` no está en el catálogo del doble) | sí (texto SQL) |
| 9 | `cohorte-carga-sql.test.ts:152 → 159–160` | `toContain("x1")` → `not.toContain("x1")` si la columna es `FALSE`; si no, `toContain("x1")` | sí (parámetros `:152`, con `FALSE` sin parámetro) |
| 10 | `tests/unit/analytics/alcance-dinero.guardia.test.ts:222 → 224` | `toContain("condicionesDeConsulta(consulta)")` → `toContain("condicionesDeConsulta(consulta, lugares)")` | **no está en §11.1**: es la guardia que el humano autorizó el 2026-11-04 (decisión 1 de la tanda 2) |

Ningún otro `expect` existente cambió. El resto de archivos existentes tocados solo cambian **entrada** o **añaden** casos:
- solo entrada (imports, envoltorios con `lugaresDe` o delegados del catálogo en el doble), sin `expect`:
  - `conteo-hoy-gestion-servicio.test.ts`, `conteo-productos-sql.test.ts`, `dinero-productos-sql.test.ts`;
  - `cohorte-consulta-unica.test.ts` (0 líneas borradas);
  - `informe-transito-composicion.test.ts` (la fila del doble de `$queryRaw` pasa de `canton`/`distrito` a
    `canton_id`/`distrito_id`; sus 3 `expect` igual).
- solo añaden:
  - `lugar-orden.test.ts` (solo cambia un import);
  - `geo-lecturas-sin-backfill.test.ts`, `geografia-lecturas-sin-nodo-fk.guardia.test.ts` y
    `catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (0 líneas borradas).

**Fuera de §11.1:**
- Solo el #10 (`alcance-dinero.guardia.test.ts:222`), ya autorizado por el humano.
- Dos tests cambian su doble fuera de la lista de archivos de design §11.1, sin tocar ningún `expect`:
  `cohorte-consulta-unica.test.ts` e `informe-transito-composicion.test.ts`. Ya estaban anotados en la tanda 2.

## T8.1 marcada (leader, 2026-11-05)
- Decisión del humano (2026-11-05): R23 se da por cumplido sobre los commits propios de SLT-71 (`c26cd50a..HEAD`, `db/` vacío).
  Cuando SLT-65 esté en `dev` y se integre (F2.3), se repite `git diff --name-only origin/dev...HEAD -- db/` antes de pedir el merge.
- R24: la evidencia de E2E y de las suites `informe-transito-*` es la de CI (`gate-completo`), no local.

## T8.2 (leader, 2026-11-05)
- `./init.sh` completo no cabe en local con la rama apilada (`vitest related` > 15 min, corte por memoria/tiempo). Regla del humano
  «gate en CI, no local»: en local typecheck y guardias; la suite completa en `gate-completo` de CI.
- `pnpm run typecheck`: exit 0.
- `pnpm run test:guardias`: `Test Files 1 failed | 330 passed | 3 skipped (334)`, `Tests 4 failed | 4616 passed | 24 skipped`.
  Los 4 rojos son `dependencias-declaradas-presentes` (baseline).
