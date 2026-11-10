# impl SLT-89 — geo-jerarquica-zonas

> Bitácora del implementer. Base de pruebas: `logistic_slt89` en localhost (desechable, creada para esta
> feature con `prisma migrate deploy`; sin siembra de catálogos ni usuarios). Memoria baja:
> `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`. Sin push (lo hace el leader).

## Tanda 1 (2026-11-10): T0.1, T1, T2

Sha de partida: `0d4d7d99` (docs(SLT-89): F2.0, aprobado y choque con Tarifas aceptado), apilada sobre
`origin/feature/SLT-46-geo-jerarquica-admin` @ `51c0345e` (PR #107). T0.2 (maqueta) y T7 (UI) fuera de
esta tanda.

### T0.1 — la rama arranca en verde

Sin `./init.sh` (pila de horas en esta máquina, por instrucción del leader); en su lugar, sobre el sha
de partida:
- `pnpm install --frozen-lockfile` + `prisma generate`: limpios.
- `prisma migrate deploy` sobre `logistic_slt89` recién creada: «All migrations have been successfully
  applied» (última: `20261106120200_slt46_pais_tipos_de_nivel_opcional`).
- `pnpm run typecheck`: exit 0, sin errores.
- Contrato v1 congelado: `tests/integration/api/contrato-v1.route.test.ts` (modo comparar) →
  `Test Files 1 passed (1) · Tests 22 passed (22)`.
- CI: el PR #107 de SLT-46 «Geografía jerárquica: administración de países» (mismo sha `51c0345e` que
  la base de esta rama) no tiene corrida de `gate-completo` en `gh pr checks` (solo Vercel, verde). El
  verde de CI de la base queda pendiente de esa corrida.

Decisión del implementer (a revisar): `origin/dev` ya tiene `20261109120000_cobro_plataforma_traza`,
mismo timestamp que la migración del spec. Las migraciones de SLT-89 pasan a
`20261110130000_slt89_zona_nodo` y `20261110130100_slt89_historial_zona_nodo` (revisado contra `dev` y
todas las ramas remotas: SLT-81 usa `20261109130000`, `dev` `20261110120000`, SLT-97 `20261111120000`).

