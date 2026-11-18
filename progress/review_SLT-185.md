# review SLT-185 «aporte-capital sin empresa en contexto»

Ruta ligera, solo tests. Revisado sobre `origin/dev...f32944b0` (PR #221). Alcance: las 9 entradas del
spec + 7 del alcance ampliado (`progress/features/SLT-185.md > Cierre`) = 16 archivos.

## Checklist

- [x] **Ruta.** Ligera; el diff no toca producción (dinero, permisos, auth, integraciones): solo
  `tests/` + baseline + progress. `git diff origin/dev...HEAD -- lib app db components hooks` → **vacío**
  (0 líneas), también comprobado tras mis mutaciones (`git status` limpio).
- [x] **Trazabilidad R1140..R1149 → test.** Mapa en `progress/impl_SLT-185.md > Mapa R -> test`; cada R
  tiene test o control con aserción real (controles «SLT-185: …»). R1148 y R1149 se verifican por diff y
  baseline (no son comportamiento).
- [~] **Tasks.** T1-T7 `[x]`; T8 (cierre: `./init.sh` del leader + CI `gate-completo` del PR) `[ ]` —
  depende de pasos posteriores a esta revisión (menor).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 19/40 archivos, 0/1000 producción, 691/3000 tests.
- [x] **Lo que ya existe.** Ruta ligera: la sección está en `requirements.md` y el diff reutiliza
  `conEmpresa459`, `clienteConEmpresa459`, `reglasPaisFijas`, `crearOrganizacion`/`comoApp`,
  `conAislamientoPorEmpresa` y la opción `organizacionId` de `enTransaccionRevertida`. Los dos helpers
  nuevos de `454/_escenario.ts` (`clienteDeLaApp454`, `enEmpresaDe`) son envoltorios de una línea sobre
  lo existente, simétricos a `clienteConEmpresa459`; no re-crean nada.
- [x] **Typecheck** `pnpm run typecheck` → exit 0. **Lint** `eslint` de los 18 `.ts` tocados → exit 0.
- [x] **Tests (base desechable `servi_slt185_desechable`, por `con-desechable.cjs`).**
  - Los 16 archivos: **125/125 verdes, 0 saltados** (picking y rechazo cayeron la primera vez con
    `Cannot find module .prisma/client` — otro worktree regenerando el cliente Prisma compartido;
    re-corridos solos: 3/3 y 10/10. No es del diff).
  - Usuarios de los helpers tocados (`tests/integration/db/454` + `419`, 51 archivos): 251 verdes; los 7
    rojos (`orden-evento-migration`, `registro-gestion-sin-transicion-sql-real`,
    `retiro-estados-migration`, `caracterizacion/{cierre-rechazado,deshacer,dinero-aprobacion,multi-dia-271}`)
    están **todos en `tests/baseline-rojos.json`** con otra ficha; los 10 saltados son de
    `retiro-estados-migration` (baseline). Ningún rojo nuevo.
- [x] **Mutaciones propias (restauradas con `git checkout --`).**
  - `sembrarComprometido` sin `comoApp(tx, organizacionId)` → `no-doble-gestion` ROJO (hook, 2 saltados, exit 1).
  - `aporte-capital` R71: movimiento previo fechado hoy en vez de hace 3 días → 4 p / 1 f ROJO.
  Coinciden con M7/M3 de la bitácora.
- [x] **R1147.** Nº de `it` por archivo igual en los 16 (origin/dev vs HEAD). Aserciones quitadas: solo
  sustituidas por equivalentes o más estrictas — `haySaldoInicialVigente` por el cliente acotado (×3),
  `avisosPushDe` dentro de `enLaEmpresa`, `rejects.toThrow()` → `toThrow(/23505/)`, huella R71
  `caja: 0` → `caja: 1` (el movimiento que el propio caso siembra; `huella` cuenta por
  `registradoPor ∈ p.usuarios`). R30 de `asistente-uso-diario` suma `organizacion_id` a la lista literal:
  es el contrato del esquema (SL-17), no se compara con su propia fuente.
- [x] **Helpers compartidos retrocompatibles.** `limpiar419` y `limpiarComprometido` solo ganan campos
  opcionales (`organizacionId?`, `centralZonaId?`); sin ellos se comportan como antes. `Comprometido`
  gana dos campos requeridos, pero solo lo construye `sembrarComprometido` y sus 3 únicos usuarios (los
  del alcance) pasan el objeto entero a `limpiarComprometido`. `escrituras-459.ts` no se toca.
- [x] **Baseline.** −16 entradas (exactamente los 16 archivos), 0 añadidas, 0 quedan citando SLT-185;
  JSON válido.
- [x] **Reglas del proyecto (`perfil-agentes > reviewer`).** Sin tablas/queries/migraciones nuevas, sin
  dependencias, sin Ordenex, sin `console.log`; comentarios explican el porqué. La regla de E2E aplica a
  PR que toca `db/`, pantallas o dinero de producción: no es el caso (solo tests).

## ¿Fijar la empresa oculta un fallo real de la app?

No. Comprobado en el código de producción, no solo en la bitácora:
- Server Actions (`aporte-capital`, `wallet`, `wallet-anulacion`, `listarCierresAdmin`, `informe-picking`,
  `analitica-financiera`): el cliente global es `conAislamientoPorEmpresa(..., resolverEmpresaDeLaPeticion)`
  (`lib/db/prisma-client.ts:182`); en producción la empresa sale de la sesión. Los tests llaman a la
  action fuera de una petición, así que ponerla con `conEmpresa` reproduce lo que hace la sesión.
- Caminos sin sesión: el cron de jobs (`app/api/cron/procesar-jobs/route.ts:123,134`, que cubre el
  envío programado de WhatsApp) y `aviso-reparto-manana`/`corte-diario` (`paraCadaEmpresa`) ya corren
  dentro de `conEmpresa`. El test de `whatsapp-envio-idempotencia-programado` y el de reparto usan un
  resolutor que devuelve la empresa sembrada, equivalente.
- Repos bajo concurrencia (454, 419, rechazo, preferencia): ahora pasan por la misma envoltura de
  producción (baja a `servi_app`, RLS y triggers activos), que es **más** fiel que el cliente dueño de antes.

## Hallazgos

1. **menor** — T8 sin marcar: queda `./init.sh` del leader y `gate-completo` del PR #221 en verde.
2. **menor** — `usuario-preferencia` usa `EMPRESA_DE_LA_CARRERA = randomUUID()` sin fila de
   `organizacion`; R1141 pide «la empresa de los datos sembrados». Aceptable: el clon `LIKE ... INCLUDING
   ALL` no copia la FK y el control positivo afirma que la fila lleva esa empresa; pero no es una empresa
   real sembrada.
3. **menor** — `progress/features/SLT-185.md`: `## Estado` sigue en F1.2 y la columna assignee dice «—»
   (el commit `chore(SLT-185): feature tomada por ArqDev` indica que sí la tomó). Lo actualiza el leader.
4. **menor (entorno, no del diff)** — `vitest` en este worktree puede caer con `Cannot find module
   .prisma/client` si otro worktree hace `prisma generate` sobre el `node_modules` compartido; re-correr.

## Veredicto

**OK** — sin bloqueantes.
