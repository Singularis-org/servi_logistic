# Review SLT-184 «Orden y zona propias en tests de chat, notas y wallet»

Revisado HEAD `35fdf58b` contra `origin/dev`. Ruta ligera (spec único `requirements.md`), solo tests +
baseline. Reviewer: 2026-11-18.

## Checklist

- [x] **Ruta.** Ligera válida: diff de producción vacío (`git diff --name-only origin/dev...HEAD -- lib app
  components hooks db scripts .github package.json` → 0 archivos). No toca dinero/permisos/auth/webhooks.
- [x] **Helpers intactos.** `tests/integration/db/_fixtures/`, `db/_postgres-real.ts`, `db/454/` sin cambios
  (R1129 no aplica). Solo se IMPORTAN `crearFksDeOrden`/`crearUsuarioDePrueba`.
- [x] **Lo que ya existe.** Tabla presente y reutilizada (`crearFksDeOrden`, `enTransaccionRevertida`,
  `conEscenario`); nada re-creado.
- [x] **Tasks** T1–T9 en `## Tasks` todas `[x]` (T9 deja el CI del PR pendiente, como corresponde).
- [x] **Tamaño** (`node scripts/tamano-pr.mjs`): 19/40 archivos, 0/1000 producción, 632/3000 tests. Sin
  línea de aceptación necesaria (R1132).
- [x] **Typecheck** `pnpm run typecheck` exit 0; **lint** `eslint` de los 18 archivos exit 0.
- [x] **R1125 — nada debilitado.** En `git diff origin/dev...HEAD -- tests/integration` los únicos `expect`
  quitados son `expect(fks).not.toBeNull()` / `expect(mensajeroId).not.toBeNull()` del caso «hay FKs…» de
  `chat-entrante-telefono-cr`, sustituidos por siembra en tx + `count` exacto (más fuerte). El único `it`
  «quitado» es ese mismo caso, re-declarado `async` (mismo nombre). Nº de `it`/`test` igual en los 18
  archivos (contado origen vs HEAD). Ningún literal esperado cambiado; ningún `.skip`/`.todo`/`return`
  temprano añadido.
- [x] **R1122 — nada leído sin sembrar.** Desaparecen todos los `zona.findFirst`, `orden.findFirst`,
  `usuario.findFirst(OrThrow)` y el cartesiano `zona × provincia × canton LIMIT 1`. Revisado en particular:
  - `455/caracterizacion/api-lectura`: el distrito se lee por clave (Cartago/Cartago, `orderBy nombre`) y se
    ASOCIA en `e.tx` a `e.zonaSateliteId`, con control `zonaDistrito.count === 1`. `454/_escenario.ts` intacto.
  - `confirmacion-fisica-migration`: `sembrarGestiones` crea orden + mensajero + 2 gestiones con control
    `count === 2`; el backfill se planta por id en las sembradas (antes «primera/última» de la tabla).
  - `wallet-cierres-selector`: rol y tipo de identificación por `findUnique` de su clave.
  - Los `LIMIT 1` que quedan son preexistentes y no leen filas de negocio (comprobar que `nota` ya no
    existe tras el up).
- [x] **R1124 — controles positivos** contra el id sembrado (`count({ where: { id } })`), no contra su propia
  fuente: fallan si la fila no llega a la base (ver mutación abajo). Mensajes nombran la fila.
- [x] **R1127/R1128 — baseline.** 96 → 80 claves: 16 retiradas, todas del alcance; ninguna añadida; fuera de
  las 2 reescritas, ninguna otra entrada cambia (comparado objeto a objeto con `origin/dev`).
  - `db/habilitacion-api-migration` → SLT-187 «Tests de migración desfasados tras SL-17»: motivo con clase,
    primera línea, `habilitacion-api-migration.test.ts:293` (comprobado: es el `toEqual` de columnas en HEAD),
    `20261022130100_organizacion_id_en_negocio/migration.sql:203` (comprobado: el `ADD COLUMN organizacion_id`),
    fecha 2026-11-18. `desde` 2026-10-22 intacto.
  - `repositories/dinero-productos.int` → SLT-186 «Tests con estados retirados del catálogo» (decisión del
    leader): `dinero-productos.int.test.ts:759` comprobado (el `toMatch` sobre `Object.entries(tarifa)`),
    `lib/types/tarifa-flexible.ts:64` comprobado (`{ modelo: "viejo"; … }`). `desde` 2026-10-22 intacto.
- [x] **R1120/R1121 — ejecución propia** en `servi_slt184b_desechable` (con empresa ajena), vía
  `con-desechable.cjs`: `api-lectura`, `historico-conversaciones.int`, `confirmacion-fisica-migration`,
  `wallet-cierres-selector`, `chat-entrante-telefono-cr` → **5/5 archivos, 83/83 passed, 0 skipped**
  (9 + 27 + 19 + 8 + 20, igual que la bitácora).
- [x] **R1126 — mutación propia.** `api-lectura`: `await e.tx.zonaDistrito.create(` → `void (`. Resultado:
  archivo rojo, 9 sin ejecutar, `SLT-184: la asociacion zona-distrito sembrada no esta en la base: expected
  +0 to be 1`. Restaurado con `git checkout --`; `git status` limpio. Coincide con la fila de la bitácora.
- [x] **Trazabilidad R1120–R1132** → `progress/impl_SLT-184.md > Mapa R → test`, con tabla de resultados A/B,
  tabla de mutaciones (18 filas) y motivos medidos.
- [ ] **R1131 — `gate-completo` del PR**: pendiente (lo anota el leader tras abrir el PR). No bloquea la review.
- [x] **Reglas del proyecto** (`docs/perfil-agentes.md > reviewer`): sin código de producción, sin
  migraciones, sin dependencias, sin referencias a Ordenex. Literales «Cartago» solo en datos de test
  (mismo patrón que `_fixtures/orden-minima.ts`). Comentarios explican el porqué.

## Hallazgos

- **menor** — `confirmacion-fisica-migration`, caso «R20/R17»: la auditoría sigue contando TODA la tabla
  `gestion_orden` (sembradas incluidas; el comentario lo dice). Es la naturaleza del test (auditar que nadie
  hizo backfill), y la anti-vacuidad ya la garantiza la siembra; pero si otro test deja en CI una gestión
  marcada fuera de un cierre aprobado (SLT-188 «Tests que dejan filas fuera de su transacción»), este caso
  se pondría rojo por un dato ajeno. No se pide cambio aquí.
- **menor** — `chat-entrante-telefono-cr`, caso «hay FKs…»: los `not.toBeNull()` finales son triviales; la
  verificación real son los `count` dentro de `sembrarFks`. Correcto, solo es redundante.

Ningún hallazgo de docs/progress que corregir.

## Veredicto

**OK.** Sin bloqueantes. Pendiente solo R1131 (CI del PR), a cargo del leader.
