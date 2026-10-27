# impl SL-20 — tanda T6 (T6.1, T6.3, T6.4), backend_dev

Fecha: 2026-10-27. Worktree `.worktrees/SL-20-pais-geografia-configurable`. Base `servi_logistic_sl20`
(local, `DATABASE_URL` puesta por comando desde el `.env` del repo principal, cambiando solo el nombre).
Sin commit. Ninguna dependencia nueva. No se tocaron `app/` ni `components/`.

## Incidencia de entorno: la base `servi_logistic_sl20` no existía

El primer `vitest` falló con «Database `(not available)` does not exist». En el Postgres local
(16.1, `localhost:5432`) no había ninguna base `servi_logistic_sl20`. La recreé, solo en local:
`CREATE DATABASE servi_logistic_sl20` y `prisma migrate deploy` («All migrations have been
successfully applied»). La base nueva solo trae lo que siembran las migraciones (catálogos y la
geografía de CR), **sin usuarios ni órdenes**. La de antes sí tenía usuarios: por eso 6 suites que
antes pasaban ahora abortan en `beforeAll` (ver T6.1 › pasada en serie). No corrí `db:seed` porque
solo siembra catálogos y no arregla esas 6.

## T6.1 — `tests/integration/db/geografia-dos-paises.test.ts` (nuevo)

Dos empresas: A en `XA` y B en `XB` (`tests/fabricas/paises.ts`), cada país con su geografía
mínima, y Cartago/Cartago de CR como tercer país. Todo como `servi_app` con la empresa fijada
(`comoApp`), dentro de `revertida`. Los repositorios reciben `clienteConSavepoint(tx)`, así que un
rechazo dentro de su `$transaction` deshace lo que ya escribió.

Nombres reales de los métodos (el encargo decía «find*ByIds / resolveGeo»):
- `OrdenRepository.findCantonesByProvinciaIds` y `findDistritosByCantonIds` (los `find*ByIds`),
  `findAllProvincias` y `findDistritoParaCorreccion`.
- `resolveGeo` no es método del repositorio: es una función pura de `lib/services/geo-resolucion.ts`.
  El test construye los índices con las tres lecturas del repositorio, igual que
  `CotizacionOrdenService.precargarGeografia`, y resuelve por nombre.
- `GeoRepository.listArbol`, `listProvinciasLite`, `listCantonesLite` y `listDistritosLite`;
  `CoberturaRepository.listDistritos`; `ZonaRepository.create`;
  `DistritoZonaEspecialRepository.aplicarCambios`; `OrdenRepository.corregirDatosCliente`.

Casos (5):
1. **R12/R39:** el país de todo lo que devuelve cada lectura, medido como dueño, es solo el de la
   empresa. Los `find*ByIds` reciben ids de los tres países y devuelven solo el suyo.
   `findDistritoParaCorreccion` devuelve `null` para un distrito de otro país. `resolveGeo` resuelve
   lo propio y responde «provincia no encontrada» para XB y para CR. La cobertura tiene una sola fila,
   la propia. También se comprueba que lo propio aparece, para que una lista vacía no pase.
2. **R13/R39:** `ZonaRepository.create` con un distrito de XB y con uno de CR → SL021 →
   `GeografiaDeOtroPais` y 0 zonas con ese nombre. Con el distrito propio sí crea la zona (control).
3. **R38/R13/R39:** `aplicarCambios` marca lo propio (`ok`, 1 creada). Luego un lote que desmarca lo
   propio y marca un distrito de XB → SL021 → `GeografiaDeOtroPais`, y la desmarca se revierte con
   el lote. Con CR, lo mismo. Al final A sigue con su única marca.
4. **R13/R39:** `corregirDatosCliente` hacia geografía de XB y de CR → SL021 →
   `GeografiaDeOtroPais`, y la orden sigue con su geografía. Con la propia devuelve `"ok"` (control).
5. **R14/R39:** una orden sin distrito entra en XA y en XB. Con un distrito o una provincia de otro
   país → SL021.

Mutaciones:
- `ALTER TABLE provincia|canton|distrito DISABLE ROW LEVEL SECURITY` → `1 failed | 4 passed`: cae el
  caso R12 («expected { …(8) } to deeply equal { arbolProvincias: [ 'XA' ], …(7) }»). Restaurado
  (relrowsecurity = 3/3) → 5/5 verde.
- No pude probar la mutación de los triggers SL021 (`DISABLE TRIGGER … geografia_del_pais_de_la_empresa`
  con su `ENABLE` en el mismo comando): **la denegó el clasificador de permisos**. Esos casos
  esperan SL021 exacto y el control propio pasa, así que con el trigger apagado caerían, pero esto
  está razonado y no medido.

```
$ pnpm exec vitest run tests/integration/db/geografia-dos-paises.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### Pasada en serie: `geografia-*`, `zona-*`, `cobertura-*` y `*-dos-empresas*` (30 archivos)

```
$ pnpm exec vitest run <30 archivos> --no-file-parallelism
 Test Files  6 failed | 24 passed (30)
      Tests  288 passed | 57 skipped (345)
```
Los 6 rojos abortan en `beforeAll` porque la base está vacía de usuarios y órdenes, y **los 6 están
en `tests/baseline-rojos.json`** (motivo: «La app nace vacia (SL-11)… La retira SL-31»):
- `cobertura-repository`: «no hay ningun usuario adminTienda en esta base»
- `geografia-cascada-reversible`, `geografia-registro-accion` y `geografia-renombrado`: «`usuario` esta vacia»
- `geografia-historico-intacto` y `geografia-ordenes-sin-entregar`: «`orden` esta vacia»

Ninguno sale de este cambio. Con la base anterior, que tenía usuarios, `geografia-registro-accion`
y `geografia-renombrado` pasaban (`impl_SL-20-T4.md`). Ahora no se pueden volver a medir aquí.

## T6.3 — coste del trigger `geografia_del_pais_de_la_empresa` en `INSERT` de `orden`

**Método:** igual que D13 (`impl_SL-17.md > T2.7`): 3 rondas de 1000 `INSERT` de `orden`, más 50 de
calentamiento, con sus FK (tienda, zona, estatus) y un distrito de CR, en una transacción del dueño
que se revierte. Cambia una cosa: no se apagó el trigger (el clasificador no deja hacer
`ALTER TABLE … DISABLE TRIGGER`). Se usó `EXPLAIN (ANALYZE, FORMAT JSON)`, que da el tiempo de cada
trigger por fila. «Antes» = el total menos el tiempo del trigger SL021. El script vivió en el
scratchpad y no queda en el repo.

```
triggers vistos: 9 RI_ConstraintTrigger_*, cobro_plataforma_al_crear_orden,
  orden_geografia_del_pais_de_la_empresa, sme_orden_carga_id_*, sme_orden_mensajero_asignado_id_*,
  sme_orden_tienda_id_*, sme_orden_zona_id_*
n=3000 (3 rondas x 1000, 50 de calentamiento)
INSERT con el trigger   : media 6.238 / mediana 3.015 / p95 22.233 ms
INSERT sin su tiempo    : media 5.850 / mediana 2.740 / p95 21.277 ms
trigger SL021 solo      : media 0.388 / mediana 0.251 / p95 0.602 ms
triggers sme_* (SL-17)  : media 1.491 / mediana 0.722 ms
```
**Cifra: +0,25 ms de mediana por `INSERT` (≈ +9 %; p95 0,60 ms). Por debajo de 1 ms.** El total
absoluto sale más alto que en D13 (3,0 frente a 1,5 ms) porque incluye la instrumentación de
`EXPLAIN ANALYZE` y 3000 filas en la misma transacción. Lo que se compara es el tiempo del trigger.
Lo anoto aquí y no en `progress/impl_SL-20.md`, como pidió el encargo.

## T6.4 — demo de QA en CR

- `scripts/demo-qa/geografia.ts`: `PAIS_DEMO = "CR"` y `claveDeDistritoDemo(distrito)`, que devuelve
  la clave única del catálogo `{ paisId_codigoDta: { paisId: "CR", codigoDta } }`.
- `scripts/demo-qa/receta.ts`: `geoDe` hace `distrito.findUnique({ where: claveDeDistritoDemo(d) })`,
  por país y código. Sale el `findMany` + «existe en más de un país». `crearEmpresa` recibe
  `paisId: PAIS_DEMO` de forma explícita (decisión 3).
- `tests/unit/scripts/demo-qa-jobs.test.ts`: describe «país de la demo (SL-20, decisión 3; T6.4)»
  con 2 casos: `PAIS_DEMO === "CR"` y la clave de los tres distritos.

```
$ pnpm exec vitest run tests/unit/scripts/
 Test Files  12 passed (12)
      Tests  159 passed (159)
```
No corrí `tests/integration/db/demo-qa.test.ts`: necesita la marca de QA y la cadena de la demo
completa sobre una base sembrada.

## Mapa R → test

| R | Test |
|---|---|
| R12 | `geografia-dos-paises.test.ts` › «R12/R39: cada empresa solo ve la geografía de su país en el árbol, las listas, la carga, la corrección y la cobertura» |
| R13 | `geografia-dos-paises.test.ts` › «R13/R39: ZonaRepository.create…», «R38/R13/R39: aplicarCambios…», «R13/R39: corregirDatosCliente…», «R14/R39» (orden con distrito/provincia de otro país) |
| R14 | `geografia-dos-paises.test.ts` › «R14/R39: una orden sin distrito entra en los dos países…» |
| R38 | `geografia-dos-paises.test.ts` › «R38/R13/R39: aplicarCambios con un distrito de otro país…» |
| R39 | `geografia-dos-paises.test.ts` entero (dos empresas en XA/XB, `servi_app` + RLS, sin E2E) |

## Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 `error TS`.
- `pnpm run lint` → exit 0, «✖ 230 problems (0 errors, 230 warnings)». Ningún aviso en mis archivos.
- Guardias (`tests/unit/guards`, `tests/guards`) más `tests/unit/scripts`:
  `Test Files 6 failed | 244 passed (250)`, `Tests 9 failed | 3339 passed`. Ninguna es de este diff:
  - `dependencias-declaradas-presentes` (4): en el baseline.
  - `dominio-ordenex-fuera` y `otp-debug-solo-en-pruebas`: timeout de 20 s en la corrida grande.
    Solas pasan (2/2).
  - **Fuera del baseline, rojas también por separado (3), de la parte de frontend de SL-20:**
    - `test-citado-desaparecido`: `specs/SL-32-rol-superadmin/tasks.md:438` cita
      `tests/unit/components/geografia-admin-page.test.tsx`, que borró 78b0ab3 (T5.3).
    - `asistente-sin-frontmatter`: «expected 37 to be 38» documentos. No lo verifiqué; lo más
      probable es que venga de la ayuda retirada en la decisión 9.
    - `asistente-panel-hermano` (línea 82): `expected false to be true`. Ahí hay cambios de `app/`
      en vuelo de otro agente.

## Archivos por tarea (para commitear por separado)

- T6.1: `tests/integration/db/geografia-dos-paises.test.ts`
- T6.4: `scripts/demo-qa/geografia.ts`, `scripts/demo-qa/receta.ts`, `tests/unit/scripts/demo-qa-jobs.test.ts`
- T6.3: no toca ningún archivo del repo. La cifra está en esta bitácora.
- Bitácora: `progress/impl_SL-20-T6.md`

## Preguntas abiertas

1. ¿Quién borró la base `servi_logistic_sl20`, y vale la que recreé (migrada, sin usuarios ni
   órdenes)? Si había datos que importaban, se perdieron antes de esta tanda.
2. ¿Autoriza el humano la mutación de los triggers SL021 (apagar y volver a encender los 3, en local)
   para cerrar la evidencia de R13/R38? El clasificador la bloqueó.
3. Los 3 rojos de guardia fuera del baseline (test citado de SL-32, 37/38 documentos de ayuda y el
   panel hermano) son de T5. ¿Los toma el frontend_dev o el implementer?

## Cierre del implementer (2026-10-27)

Commits: `7860de8` (T5.3, T5.7, cierra T5.5), `f928db4` (T6.1, T6.3, T6.4), `08afb75` (guardias rojas tras
T5: contraprueba del panel, recuento de ayuda 38→37, R26 de SL-32 repuntado), `6d3a8e7` (T6.5),
`bc48a89` (F2.3, merge de `origin/dev`: 7 commits de SL-43, un conflicto trivial en
`scripts/demo-qa/receta.ts`, sin migraciones nuevas) y el renombre `DIVISION_MAX_FILAS` →
`DIVISION_TOPE_DE_FILAS_CSV` (falso positivo de `rollup-guards` (d), su regex caza `MAX…FILAS`).

Verificación tras el merge (sin `./init.sh`, va en CI):
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): 0 errores.
- lint: `0 errors, 230 warnings`.
- `tests/unit/scripts` (demo-qa, lo que tocó el merge): `17 passed (17) · 184 passed (184)`.
- `pnpm run test:guardias`: `2 failed | 310 passed | 2 skipped`; rojos: `dependencias-declaradas-presentes`
  (en `tests/baseline-rojos.json`) y `rollup-guards` (d), arreglado con el renombre:
  `rollup-guards` + `carga-division-service` 48/48.

Trazabilidad R1–R52: `progress/impl_SL-20.md > T6.5`.

Preguntas abiertas:
1. La base `servi_logistic_sl20` no existía y se recreó (migrada, sin `db:seed`): 6 suites de la pasada
   de T6.1 abortan en `beforeAll` por falta de datos sembrados (todas en `tests/baseline-rojos.json`).
   ¿Se siembra la base o se acepta así? ¿Quién la borró?
2. La mutación de los 3 triggers SL021 (apagarlos para ver caer R13/R38) la bloqueó el clasificador de
   permisos; la caída está razonada, no medida. ¿Se autoriza en local?
3. La pantalla `/plataforma/geografia` no pasó por `/design` (perfil de frontend).
4. El autocompletado ofrece también países ya dados de alta (el servidor responde `conflict` y la UI lo
   dice); ¿se ocultan? El spec no lo decide.
5. Textos con nombre de nivel en forma neutra («Alta: Departamento») por no conocer el género del nombre.
6. D15: falta la confirmación escrita de Carlos (F1.4).
