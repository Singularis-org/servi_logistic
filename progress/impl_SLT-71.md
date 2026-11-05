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
