# Review SLT-183 «Usuarios propios en tests de geografía, avisos y migraciones»

Rama `feature/SLT-183-usuarios-tests-geografia-avisos`, HEAD revisado `40bba6a3`, contra `origin/dev`.
Ruta ligera (spec = `requirements.md`, R1100–R1112). Diff: solo `tests/` + `progress/` + spec.

## Checklist

- [x] **Ruta.** Ligera válida: diff de producción vacío (`git diff --name-only origin/dev...HEAD -- lib app
  components hooks db scripts .github package.json` → nada). No toca dinero, permisos, auth, webhooks
  de producción ni migraciones.
- [x] **Tasks** T1–T8 en `## Tasks` todas `[x]` (T8 deja anotado «CI del PR pendiente»: correcto, es R1111).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` → `16/40 archivos, 0/1000 producción, 576/3000 tests`. Sin
  línea de aceptación y no hace falta (R1112).
- [x] **Lo que ya existe.** Tabla presente en el spec; se reutiliza `crearUsuarioDePrueba` y
  `superadmin-32` (`idDeRol`, `insertarUsuario`, `liberarHuecoDeSuperadmin`, `tomarLockDeSuperadmin`) sin
  re-crearlos.
- [x] **Helpers compartidos intactos** (R1109 no aplica): `_fixtures/*`, `_exclusion-demo-qa.ts`,
  `_whatsapp-envios-474.ts`, `_postgres-real.ts`, `454/` sin cambios en el diff.
- [x] **R1105 — nada quitado ni debilitado.** Por archivo, `it`/`test` y `expect` antes→después iguales
  (15/15). Las únicas `expect` borradas son las dos de «la base no tiene usuarios» (`asistente-uso-diario:55`,
  `vista-filtro:93`): la primera se sustituye por un control `count === 1` con `expect`; la segunda por un
  control que lanza con el nombre de la fila. Ningún literal esperado cambiado; `usuario-contar-adminsatelites`
  conserva `toBe(0)`/`toBe(1)` y cuenta por la zona sembrada en la tx (estable con datos ajenos).
- [x] **R1102.** Desaparecen todos los `findFirst` sin filtro, `findMany({take})` y `SELECT … LIMIT 1` de
  usuario; `cobertura-repository` acota la central y la tarifa (NULL, NULL) a la empresa del caso
  (`current_setting('app.organizacion_id')`).
- [x] **R1103 — filas confirmadas.** `asistente-uso-diario`, `reparto-manana-aviso-dedupe` y
  `whatsapp-envio-idempotencia-programado` crean empresa + usuarios bajo el lock de la 227
  (`bajoLockDeEscrituraReal` o `serializarEscriturasReales` dentro de la tx de siembra), los borran bajo el
  lock en `afterAll` y lanzan si el recuento por id no es 0.
- [x] **R1104 — controles positivos.** `count({ where: { id } }) === 1` contra el id insertado, comparado con
  un literal (no contra su propia fuente); lanzan, no `return`.
- [x] **R1107/R1108 — baseline.** −11 claves (exactamente las 11 retiradas); 4 motivos reescritos con clase,
  primera línea, `archivo:línea`, fecha 2026-11-17 y ficha; `desde: "2026-10-22"` intacto en las cuatro.
  Líneas citadas comprobadas en el HEAD: `asistente-uso-diario.int:125` (`consumirUnaConsulta`),
  `reparto-manana-aviso-dedupe:307` (`emitirRepartoManana` por `clienteA`), `whatsapp-envio-idempotencia-programado:81`
  (`insertarProgramada`), `webhook-suscripcion-circuito-migracion:288` (`toEqual` de columnas). Destinos
  SLT-185 «aporte-capital sin empresa en contexto» ×3 y SLT-187 «Tests de migración desfasados tras SL-17» ×1,
  decisión del leader. Ninguna otra entrada cambia.
- [x] **Trazabilidad.** `progress/impl_SLT-183.md > Mapa R → test` cubre R1100–R1112; R1111 pendiente del CI
  del PR, como prevé el spec.
- [x] **Typecheck** (`pnpm run typecheck`, exit 0) y **lint** (eslint sobre los 15 archivos, exit 0), corridos
  por el reviewer.
- [ ] **`gate-completo` del PR** (R1111): pendiente, lo corre el CI.
- [x] Checkpoints de proyecto: sin tablas, queries de producción, migraciones, secretos ni recursos de Ordenex
  en el diff. No toca `db/`, pantallas ni dinero: no aplica E2E local.

## Verificación propia (base `servi_slt183b_desechable`, con empresa ajena confirmada)

- `vitest run` de `usuario-contar-adminsatelites`, `notificacion-evento-traspaso-migration`,
  `geografia-registro-accion`, `cobertura-repository` → **4 archivos, 49 passed, 0 failed, 0 skipped**.
- Mutación repetida: comentar la siembra del 2.º adminSatelite (`pii-b`) de R22 en
  `usuario-contar-adminsatelites.test.ts:155` → **R22 rojo** `AssertionError: expected +0 to be 1`, 1 failed |
  1 passed. Restaurado con `git checkout --`; `git status` limpio.

## Hallazgos

1. **menor** — En `notificacion-evento-geocodificacion-caida-migration` (`:433`) y
   `webhook-suscripcion-circuito-migracion` el control positivo es el `expect`/anti-vacuidad que ya existía, con
   su mensaje antiguo («no hay ningún usuario en la base»), que ya no nombra la fila sembrada como pide R1104
   al pie de la letra. Se dejó así para no tocar una aserción (R1105); el caso sí cae con la mutación. No pide
   cambio.
2. **menor** — Medición local en Postgres 18.2 (CI usa 17). Lo cierra el `gate-completo` del PR (R1111).

## Veredicto

**OK.** Sin bloqueantes. Queda R1111 (CI del PR con «sin rojos nuevos» y 0 «por limpiar»).
