# SL-31 — Bitácora de implementación

## Tanda 1 — CI: base migrada en los shards (T5; R16–R18)

Fecha: 2026-10-22. Implementer (sin subagentes: la tanda es un solo archivo de CI, sin código de
producción ni tests). Rama `feature/SL-31-tests-datos-propios-ci` (la indicó el leader; el spec ya
está commiteado en ella), PR propio a `dev`.

### Archivos modificados

- `.github/workflows/gate.yml`
  - `vitest`: paso nuevo «Base del shard (migrada + catalogos)» entre «Credenciales efimeras» y el
    gate: `set -euo pipefail; prisma generate; prisma migrate deploy; pnpm run db:seed` (R16).
  - `e2e`: «Base del E2E (migrada + catalogos)» con `migrate deploy` + `db:seed`, y fuera el
    comentario `ABIERTO` (R17).
  - Fuera `SEED_ADMIN_*` / `SEED_MAESTRO_*` y las contraseñas `P1`/`P2` que solo las alimentaban,
    en los dos jobs. Quedan `SESSION_SECRET` y `APP_BASE_URL` (R18).
  - Comentarios corregidos: ya no se cita `tests/helpers/test-database.ts` (no existe) ni se dice
    que los tests crean una base efímera desde una plantilla (R18).
- `specs/SL-31-tests-datos-propios-ci/tasks.md`: T5 marcada.

### Mapa R → evidencia

| Req | Evidencia |
|---|---|
| R16 | Reproducción local (abajo) + los tres shards de `vitest` del CI del PR |
| R17 | Mismo paso en `e2e`; el job solo corre en PR a `prod` o `workflow_dispatch` (P4): pendiente de esa corrida |
| R18 | Grep de `SEED_ADMIN`, `SEED_MAESTRO` y `test-database.ts` en `gate.yml`: 0 resultados |

### Verificación local

- YAML: `actionlint` no está instalado. Parseado con PyYAML: válido; pasos de `vitest` y `e2e` en
  el orden esperado. La validación definitiva es el propio CI del PR.
- Base desechable `servi_logistic_sl31` en el Postgres local (creada vacía, 0 tablas; borrada al
  terminar). `DATABASE_URL` nunca impresa.
- Los tres comandos del paso con `set -euo pipefail` sobre la base nueva: `PASO_EXIT=0`. «All
  migrations have been successfully applied.», «Seed de catalogos completado (tipo_identificacion,
  rol, order_status, vehiculos).». 89 tablas; `usuario`/`zona`/`orden` = 0/0/0 antes y después.
- Contraprueba: el mismo paso (script con `set -euo pipefail` corrido con `bash`, como en CI) contra
  `127.0.0.1:1`: `P1001: Can't reach database server`, `INALCANZABLE_EXIT=1`, no llega a `db:seed`.
- `GATE_SHARD=1/3 bash ./init.sh --completo` sobre esa base: `Test Files 84 failed | 755 passed
  (839)`, 437,97 s. **Los 84 rojos están en `tests/baseline-rojos.json`; 0 fuera.** `INIT_EXIT=0`
  (el shard no da veredicto).
- `TEST_RAPIDO_BASE=dev ./init.sh`: `INIT_EXIT=1`, por **un** rojo ajeno a esta tanda:
  `tests/unit/guards/test-citado-desaparecido.guardia.test.ts > ninguna excepción temporal
  sobrevive a su motivo`. Dos `EXCEPCIONES_TEMPORALES` de
  `specs/461-cobro-a-tienda-y-nombres-claros/design.md` (`reclasificacion-459-migration.test.ts`,
  `reclasificacion-459-lista.guardia.test.ts`): «su borrado ya no está en la historia de git». La
  historia de `origin/dev` se aplanó a un commit (`86d70bf`), así que falla igual en `dev`; no está
  en el baseline. No se toca aquí (la tanda solo toca `gate.yml`): queda reportado al leader.
  (Una primera corrida dio además 2 errores de lint en un script auxiliar mío dentro de
  `_trabajo/`; lo moví fuera del repo y no volvió a salir.)

Logs (gitignored): `_trabajo/sl31-paso.log`, `_trabajo/sl31-inalcanzable.log`,
`_trabajo/sl31-shard1.log`, `_trabajo/sl31-init-rapido.log`.

### CI del PR

(se completa al terminar el CI)
