# Review — SLT-162 «Ranking del mensajero en tarjetas en el móvil»

Ruta ligera, review acotada al diff `origin/dev...HEAD` (HEAD `c5abf2f6`, PR #188). Spec:
`specs/SLT-162-ranking-mensajero-tarjetas/requirements.md` (R750-R769, DC23, DC24). Grafo: worktree
sin indexar; exploración con Grep/Read.

## Veredicto: CAMBIOS

Un hallazgo mayor: el E2E nuevo está **rojo en CI** (`e2e (reparto)` del PR #188, run 43998053418,
sobre este mismo HEAD). El resto del diff está bien.

## Checklist

- [x] Ruta: frontend, solo presentación; no toca dinero, permisos, auth, integraciones ni webhooks.
  `git diff --stat origin/dev...HEAD -- lib db app/api components/shared/BuscadorFiltros.tsx` vacío.
- [x] Trazabilidad: R750-R769 con test en el mapa del spec; textos escritos a mano («1 · Ana», «5 / 5»,
  «Ver detalle de Beto Repartidor», «Ningún mensajero coincide con la búsqueda.»), no contra su fuente.
  R761 solo tiene E2E, y la parte (a) está roja (ver M1).
- [ ] Tasks: T1-T4 `[x]`; **T5 y T6 `[ ]`** (T5 depende del E2E en verde; T6 es `./init.sh` del leader).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 19/40 archivos, 546/1000 producción, 1188/3000 tests.
- [x] `## Lo que ya existe` presente y respetado: reusa `useIsMobile`, `BuscadorFiltros` sin tocarlo,
  `coincideBusquedaMensajero`/`normalizarBusquedaMensajero` sin copiarlos, `TEXTO_ENTERO`/`COLUMNA_FIJA`/
  `TACTIL_MOVIL`; promueve `DESPLEGABLE_TACTIL` en vez de duplicarlo.
- [x] Typecheck (`tsc --noEmit -p .`) → `TSC_EXIT=0`. Lint de los .ts/.tsx del diff → `LINT_EXIT=0`.
- [x] Vitest: RankingModule, RankingHistoricoModule, RankingPodio, RankingDescarga,
  RankingHistoricoDescarga, guardia `pwa-mensajero-sin-recorte`, ColaCierres*, CierreDiaColaPropia*,
  DataTable* → 12 archivos, 257 passed, `VITEST_EXIT=0`.
- [ ] E2E afectados: **rojo en CI** (M1). Sin constancia de ejecución local (`perfil-agentes.md:23,78`).
- [x] Sin literales de país/moneda en producción nueva; los `₡` están solo en aserciones de test que
  ya existían en el mismo archivo (salen de `money()`). Sin recursos de Ordenex. Sin dependencias nuevas.
- [x] Comentarios explican el porqué.

## Comprobaciones pedidas

- **Búsqueda solo en el navegador, sin filtrar podio ni premios** — `RankingModule.tsx:166-172`: `useMemo`
  sobre `ranking` de props; `ocupanteDe` (`:178-181`) sigue leyendo `ranking` entero; el podio vive en
  `page.tsx` con su propia prop. La descarga usa `rankingVisible` (R762). Test «no filtra «Premios del
  podio» ni el podio, y no pide nada al servidor» espía `fetch`, `obtenerRankingAction` y `editarPremioAction`.
  La barra de la `DataTable` se pinta aunque `data` quede vacía (`DataTable.tsx:591`), así que el campo
  no desaparece al no haber coincidencias.
- **Premios en la tarjeta (DC24)** — `PremioInputRow.tsx`: solo clases y rótulos `aria-hidden`; `guardar`,
  `editarPremioAction`, `router.refresh` y la condición `esEditable` sin cambios. Un solo DOM (3 «Guardar»).
  Sin cambios de permisos ni de datos.
- **Recortes / guardia con contraprueba propia** (restaurado con `git checkout --`, árbol limpio):
  - G-a `truncate` en el nombre de la tarjeta de `RankingModule.tsx:80` → ROJO (guardia, 1 failed).
  - G-b `max-md:gap-x-1.5` en `FILA_TARJETA` de `PremioInputRow.tsx` → ROJO (guardia, regla `escala`).
  - G-c `line-clamp-2` en `[data-premio]` de `RankingHistoricoModule.tsx` → ROJO (guardia).
- **Mutaciones funcionales propias**: `ocupanteDe` leyendo `rankingVisible` → ROJO; filtro con
  `includes` sensible a acentos/mayúsculas → ROJO; `nombreDesplegar` sin `abierta` → ROJO; `CHIP_TU` sin
  `max-md:text-xs` → ROJO (R768).
- **`DataTable.expandAriaLabel(row, abierta)`** — consumidores: `ProductosTabla.tsx:1237`,
  `ConciliacionSatelite.tsx:427`, `WalletLedger.tsx:427`, `EstadoCuenta.tsx:1150`, `ColaCierres.tsx:255,268`,
  `CierresDescarga.test.tsx:1736`: todos unarios, compatibles (un callback con menos parámetros es
  asignable); `tsc` verde lo confirma.
- **`ColaCierres.tsx` y `texto-entero.ts`** — `DESPLEGABLE_TACTIL` se mueve literal (misma cadena) y
  `ColaCierres` lo importa; nadie más lo importaba de `ColaCierres`. `DESCARGA_MOVIL` es nuevo y solo lo
  usan las dos pantallas de ranking. Tests de la cola en verde.
- **E2E** — registrado en el proyecto `reparto` (`playwright.config.ts:146-147`). Sin `waitForTimeout`
  ni `networkidle`; cada `boundingBox` va después de una espera anclada (`tactil`, `toHaveCount`,
  `toBeVisible`).
- **`lib/`, `db/`, `app/api/`** — no se tocan. `page.tsx` solo pasa `mensajeroPropioId` con la misma
  expresión que ya da al podio (`page.tsx:53` y `:63`).

## Hallazgos

### M1 — MAYOR (bloqueante): el E2E (a) está rojo en CI
`e2e/pwa-mensajero-ranking.spec.ts:173`, a 360 y 414 px, falla en los dos intentos:
`getByRole('list', { name: 'Resto del ranking diario' }).getByRole('listitem').filter({ hasText: MENSAJERO_LARGO })`
→ esperado 1, recibido 0. Las (b) y (c) pasan.

Causa probable, del propio `beforeAll` (`:100-116`): solo siembra **tres** mensajeros de la central,
así que el del nombre largo (50 %) queda **3º en el podio** y no en la lista del resto, que es lo que el
comentario de la cabecera (`:40-41`) da por hecho. Es un fallo de la siembra, no de la pantalla. Pero
como falla en la línea 173, el resto de (a) **no se ejecuta en CI**: R767 (sinSolapes de la fila propia),
R768 (`letraMinima`), R769 (`tactil` del buscador), R766 de Ranking del día, y R758/R759/R761 de
`/ranking` en el navegador real quedan sin verificar. R761 solo tiene ese E2E.

Qué falta: sembrar al menos un 4º mensajero por encima del largo (o lo que haga falta para que el largo
caiga en el resto), y dejar `e2e (reparto)` en verde, local o en CI. Con eso se puede marcar T5.

### M2 — menor: T5 y T6 sin marcar
`requirements.md:243,254`. T5 queda abierta hasta que M1 esté en verde; T6 (`./init.sh` con base
desechable) es del leader. Además, la regla `perfil-agentes.md:23,78` pide los E2E afectados corridos en
local antes del PR; si el leader los sustituye por el CI (como con SLT-176), que lo deje anotado, pero
con `e2e (reparto)` en verde.

### m3 — menor: orden de foco en el Histórico
`RankingHistoricoModule.tsx` (`DESPLEGAR_A_LA_DERECHA`): con `direction: rtl` el botón se ve a la derecha
pero sigue siendo el primer elemento enfocable de la fila. Aceptable (es el único control de la fila),
solo se anota.

### m4 — menor: pedestales del podio
`RankingPodio.tsx:64,74,84` baja el porcentaje del pedestal a `text-lg` en el teléfono, cuando el spec
deja los pedestales «como hoy». Está justificado por R761 (no cabe a 360 px) y anotado en la bitácora; no
contradice ningún requisito.

## Diferencias con el canvas declaradas

Chip «Tú» con el token del podio, porcentaje del pedestal a 18 px, la lista del resto con los bordes de
hoy, el desplegar en la columna derecha y `BuscadorFiltros` en las dos pantallas (DC23). Ninguna
contradice el spec: R750/R767 piden el chip y la posición, no su color; el spec manda «Todo lo demás es la
pantalla de hoy» para la lista; DC23 manda sobre el canvas.
