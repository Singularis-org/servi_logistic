# Review SLT-178 «Siembra propia en los tests de cierres» — vuelta 1

Reviewer, 2026-11-17. Worktree `.worktrees/SLT-178-siembra-tests-cierres`, rama
`feature/SLT-178-siembra-tests-cierres`, HEAD `0abf7859`, merge-base `5b9b23de` (= `origin/dev`).
Ruta **ligera** (solo `requirements.md`). MCP del grafo no usado: el diff es solo de tests; Grep/Read.

## Checklist

- [x] **Ruta.** Diff de producción vacío (`git diff --name-only origin/dev...HEAD` = 17 tests +
  `tests/baseline-rojos.json` + `specs/` + `progress/`). No cambia comportamiento de dinero; la ligera
  es válida según el propio spec.
- [ ] **Tasks.** `requirements.md > ## Tasks`: las 8 (T1–T8) siguen `[ ]`. CHECKPOINTS.md > Ligera
  exige `## Tasks` todas `[x]`. → hallazgo B1.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 18/40 archivos, 0/1000 producción, 798/3000 tests. Sin
  línea de aceptación y no hace falta (R1012).
- [x] **`## Lo que ya existe`** presente y con contenido; el diff reutiliza `crearFksDeOrden` /
  `crearUsuarioDePrueba` / `comoApp` / `crearOrganizacion` y no re-crea nada. `_postgres-real.ts`,
  `454/_escenario.ts` y `_fixtures/orden-minima.ts` sin tocar (R1009 no aplica).
- [x] **Trazabilidad R→test** (`progress/impl_SLT-178.md > Mapa R → evidencia`): R1000–R1012 mapeados.
  R1011 queda pendiente del CI del PR, como prevé el spec.
- [x] **R1002.** Ningún `fksDeOrden`, ni `usuario.findFirst/findMany`, ni `zona.findFirst({esCentral})`
  en los 17. Todas las lecturas de `orden`/`cierreDia`/`gestionOrden` que quedan filtran por ids,
  `mensajeroId` o `numRemision` sembrados (revisado archivo por archivo). FK de catálogo de usuario por
  clave (`rol.mensajero`, `tipoIdentificacion.cedula`); `corte-diario` cambia `tipoIdentificacion.findFirst()`
  sin filtro por `findUnique({value:"cedula"})`.
- [x] **R1004.** Control positivo en cada archivo con mensaje que nombra la fila (`"usuarios sembrados (…)"`,
  `"zona sembrada"`, `"centrales visibles en la empresa del caso"`). No es comparación contra su propia
  fuente: cuenta en la base las filas por el id que devolvió la siembra, y una siembra que no llega lo pone
  rojo (mutaciones del implementer y la mía). Catálogo ausente → `throw` con el nombre. Ningún `return`
  antes de la primera aserción.
- [x] **R1005.** `it`/`test` por archivo origin/dev → HEAD: iguales en los 17. `expect(`: +2/+3 en 16,
  igual (25→25) en `rechazado-aviso-dedupe` (sus controles son `throw` en `beforeAll`/`afterAll`). Ninguna
  línea `-` del diff contiene `expect(`, `toBe`, `toEqual`, `it(`, `.skip` o `.todo`. Ningún literal esperado
  cambiado.
- [x] **R1003 (`cierre-rechazado-aviso-dedupe`).** Siembra confirmada en organización propia; `afterAll`
  borra notificaciones (+ lecturas), cierres, usuarios, zona y organización y lanza si queda alguna fila;
  `$disconnect` en `finally`. R9 conserva su limpieza en `finally`. Ver menor m1.
- [x] **Siembras en la tx del caso.** Los otros 16 siembran dentro de `enTransaccionRevertida`
  (directamente o vía `sembrarBaseDelCaso`/`conCorpus`/`escenario*`).
- [x] **R1007/R1008.** Baseline 152 → 138: salen exactamente las 14 claves del alcance que pasan; las 3
  restantes (`cierre-descarga-intentos-entrega`, `cierre-sin-gestion-tope`, `corte-diario-segundo-cierre`)
  conservan `desde` y reescriben `motivo` con clase, primera línea del error, `archivo:línea` (comprobado:
  :165, :182 y :108 son el `throw new Error(` del estatus que falta), fecha 2026-11-17 y ficha. Citan
  SLT-186 «Tests con estados retirados del catálogo» (decisión del leader; el motivo está bien escrito).
  Ninguna otra entrada cambia.
- [x] **R1010.** Nada en `lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`.
- [x] **Typecheck** (`tsc --noEmit`, 8 GB): exit 0, 0 errores. **Lint** de los 17: exit 0.
- [x] **Reglas del perfil (reviewer).** Sin `organizacion_id` olvidado en datos nuevos (R9 añade
  `organizacionId` al cierre confirmado y corre con `conEmpresa`); sin referencias a Ordenex; sin
  dependencias nuevas; comentarios `SLT-178:` explican el porqué. Sin diff de producción: no aplica la
  constancia de E2E.

## Verificación propia

- **Muestra en `servi_slt178b_desechable`** (con empresa ajena confirmada), por `con-desechable.cjs`:
  `cierre-rechazado-aviso-dedupe`, `cierre-rechazo-tienda-aprobacion`, `cierre-bloqueo-nv-sql-real`,
  `cierres-admin-retornables-sql-real` → **4 archivos, 45/45 passed, 0 saltados** (6+16+18+5, cuadra con
  la bitácora). El `afterAll` de `aviso-dedupe` no lanzó: 0 filas propias quedaron.
- **Mutación propia** (distinta de las del implementer): en `cierre-rechazo-tienda-aprobacion.test.ts`
  quitar `await comoApp(tx, org);` de `sembrarBaseDelCaso`. Misma base ajena → archivo rojo, 16 casos
  sin correr: `AssertionError: centrales visibles en la empresa del caso: expected 2 to be 1`. El control
  positivo ve la central de la otra empresa y detiene el caso, que es justo lo que pide R1001.
  Restaurado con `git checkout --`; `git status` limpio.

## Hallazgos

- **B1 — BLOQUEANTE (de forma; arreglo trivial).** `specs/SLT-178-siembra-tests-cierres/requirements.md > ## Tasks`:
  T1–T8 siguen `[ ]`, y CHECKPOINTS.md > Especificación > Ligera exige todas `[x]`. La bitácora muestra
  T1–T7 hechas. Falta: marcar T1–T7 `[x]` y T8 `[x]` con la nota «run de CI del PR pendiente (R1011)»,
  o dejar solo esa parte abierta si el leader lo prefiere así.
- **m1 — menor.** `cierre-rechazado-aviso-dedupe.test.ts`, `afterAll`: el recuento final de R1003 suma
  usuarios, cierres, notificaciones y organización, pero no la **zona** sembrada (sí la borra) ni
  `notificacion_lectura`. Si el `deleteMany` de la zona fallara en silencio (0 filas), no se detectaría.
  Basta con añadir `zona.count({ where: { id: fks.zonaId } })` a `quedan`.
- **m2 — menor.** Los controles «zona sembrada» cuentan por el id que devuelve `crearFksDeOrden`: detectan
  una siembra que no llega, pero no que el código bajo test lea esa zona. Es lo que pide R1004; se anota
  solo para no sobrevalorarlos.

## Veredicto

**RECHAZADO** — único bloqueante B1 (casillas de `## Tasks` sin marcar). El fondo está bien: diff solo de
tests, siembra dentro de la tx o confirmada con limpieza contada, controles positivos que fallan de
verdad, ningún `it`/`expect` quitado, baseline correcto. Con B1 arreglado (y m1 si se quiere), OK sin
nueva revisión de fondo.

## Vuelta 2 (acotada a 92e43a11..c24397ac)

- [x] **B1 resuelto.** `requirements.md > ## Tasks`: T1–T8 marcadas `[x]`; 0 casillas `[ ]`.
- [x] **m1 resuelto.** `cierre-rechazado-aviso-dedupe.test.ts > afterAll`: `quedan` suma ahora
  `notificacionLectura.count` (por los ids de las notificaciones propias) y `zona.count` de la zona
  sembrada (con guarda `fks ?`). Sin otros cambios en `tests/`.
- [x] **Sin regresión.** El archivo corrido en `servi_slt178b_desechable`: 6/6 passed, 0 saltados, y el
  `afterAll` no lanzó (0 filas propias).
- Resto del diff: `progress/impl_SLT-178.md` (bitácora) y las casillas del spec. Ningún hallazgo nuevo.

**Veredicto vuelta 2: OK.** R1011 sigue pendiente del `gate-completo` del PR.
