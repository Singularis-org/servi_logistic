# review SLT-198 «Cerrar una bodega: dejar una zona sin distritos»

Reviewer, 2026-11-17. Rama `feature/SLT-198-zona-sin-distritos`, HEAD 74a6bb02 (base `dev` 5b9b23de).
Ruta ligera, fullstack, complexity low. Spec: `specs/SLT-198-zona-sin-distritos/requirements.md`
(R1220–R1233; R1225 corregido por el leader). Grafo no usado (worktree sin indexar): Grep/Read.

## Checklist

- [x] **Ruta.** Ligera es válida: el diff no toca dinero (tarifas y pagos se conservan; R1220 lo
      prueba), permisos, auth, integraciones ni webhooks; complejidad low; sin `db/`.
- [ ] **Especificación (ligera).** Hay alcance, EARS, `## Archivos esperados` y «Lo que ya existe»
      con la búsqueda hecha (el diff no re-crea nada: reutiliza `Badge`, la reconciliación 366/377,
      el rastro de SLT-76 y el retiro de SLT-197). **Pero `## Tasks` tiene T1–T7 en `[ ]`.** Ver B1.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 12/40 archivos, 59/1000 producción, 889/3000 tests.
- [x] **Trazabilidad.** Cada R1220–R1233 tiene test real (mapa en `progress/impl_SLT-198.md`):
      unit zod (R1220–R1222), unit servicio (R1222 literal, R1220), integración Postgres real
      (R1220, R1222 ×2 —marca ausente y marca true—, R1223–R1229, R1232), componente (R1230,
      R1231) y E2E (R1233). Las aserciones de «no cambió» comparan contra lo leído antes.
- [x] **Corrección de producción.**
      - `lib/types/zona.ts`: `distritoIds` sale de los comunes; crear conserva `.min(1)` (R1221);
        actualizar admite `[]`; `superRefine` rechaza `esCentral: true` + `[]`.
      - `ZonaRepository.update`: la guarda `central_sin_distritos` va antes de la primera escritura y
        después de `sin_zona_central`. `quedaraCentral = esCentral === true || (exists.esCentral &&
        esCentral !== false)`: cubre marca ausente y marca true; `false` explícito sobre la central ya
        salía antes por `sin_zona_central`. Ningún camino vacía la central: el formulario (zod),
        la acción sin marca (repo) y marcar central + vaciar (zod y repo).
      - `ZonaService`: traduce a `validation_error` en `distritoIds` con el literal compartido.
      - `ZonasModule.tsx`: `Badge variant="secondary"` «Sin distritos» con `distritosCount === 0`.
- [x] **Efectos colaterales.** Sin queries nuevas ni cambios en tarifas, grupos o reconciliación de
      `orden.zona_id`. Corrí las suites de integración que tocan `update`: `zona-central-guarda-y-rastro`,
      `zona-distrito-rastro`, `zona-distrito-unica`, `zona-guardado-conserva-costos`,
      `zona-guardado-conserva-inactivos`, `zona-reconciliacion-ordenes`, `zona-update-conserva-grupos`,
      `retiro-satelite-central.int`, `actions/zonas-action` → 9 archivos, 110 passed, 0 skipped.
- [x] **RLS / organizacion_id.** Sin tablas ni queries nuevas; la guarda usa la lectura `exists` que
      ya existía. Sin migración.
- [x] **Verificación ejecutable (propia, base desechable `servi_slt198_desechable`).**
      - `zona-sin-distritos.test.ts` + `zona-schema` + `zona-service` + `ZonasModuleListado` +
        `ZonaFormSinDistritos`: 5 archivos, 88 passed, 0 skipped.
      - typecheck: 0 `error TS`. Lint de los archivos tocados: 0 errores (1 warning previo,
        `normalizeName` sin uso, ajeno al diff).
      - `pnpm run test:guardias`: 1 archivo rojo, `dependencias-declaradas-presentes.guardia.test.ts`,
        que está en `tests/baseline-rojos.json`. No es hallazgo.
- [x] **Mutación propia.** Guarda del repo cambiada a «rechaza toda lista vacía»
      (`length === 0 || (quedaraCentral && false)`): rojo en 3 casos (R1220/R1223/R1225, flujo D4 y
      R1229). Restaurado con `git checkout`; `git status` limpio. Las 7 mutaciones de la bitácora
      cubren la otra dirección (quitar la guarda, solo `=== true`, zod y Badge).
- [x] **E2E (perfil: PR que toca pantalla).** `e2e/zona-sin-distritos.spec.ts` registrado en el
      proyecto `aislamiento` de `playwright.config.ts`, esperas por condición (sin `waitForTimeout`).
      Constancia de la corrida en local en la bitácora: base desechable nueva + `next build`,
      `zona-sin-distritos` + `zonas-crear-sin-costos` 12 passed, y tras el arreglo de SINPE 11 passed.
      Los demás E2E que abren `/configuracion/zonas` siembran zonas con ≥ 1 distrito; ningún test
      afirma «0 distritos». No lo re-corrí (lo corre el CI).
- [x] **Reglas del reviewer (perfil).** Sin literal de país/moneda/SINPE en código de producción
      nuevo (el del E2E va en constante y la guardia pasa). Sin dependencias. Sin Ordenex.
      Comentarios explican el porqué.
- [x] **Flujos críticos.** No cambia asignación, recepción ni dinero; el retiro y la recepción de
      SLT-197 sobre la zona vaciada están cubiertos por integración (R1227, R1228).

## Hallazgos

- **B1 — BLOQUEANTE.** `specs/SLT-198-zona-sin-distritos/requirements.md > ## Tasks`: T1–T7 siguen en
  `[ ]`. CHECKPOINTS.md > Especificación (ligera) exige todas en `[x]`. El trabajo está hecho y
  verificado; falta marcarlas (T1–T7 → `[x]`).
- **m1 — menor.** `progress/impl_SLT-198.md` todavía dice «ABIERTO — R1225» y «Veredicto: Hecho salvo
  un punto abierto». El leader ya cerró R1225 en el spec (74a6bb02), y el test afirma justo lo que
  quedó (zona intacta, `ordenesReconciliadas = 0`). Conviene anotar que quedó resuelto.
- **m2 — menor.** `progress/features/SLT-198.md > ## Estado` sigue en «pendiente de aprobación» y
  `## Preguntas abiertas` lista P1/P2 que ya están decididas en `## Decisiones`. Lo actualiza el leader.
- **m3 — menor (fuera de alcance, ya acordado).** Una zona vacía sigue siendo destino de «Rutear a
  bodega satélite» (P2, otra ficha). Y las órdenes del estante recibidas en la central siguen en
  Cartago hasta re-guardar GAM (R1228): es comportamiento documentado, no un fallo.

## Veredicto

**RECHAZADO** por B1 (solo trámite: marcar T1–T7 `[x]`). El código, los tests y la evidencia están
correctos. Con B1 resuelto, el veredicto pasa a OK sin más revisión de código.

## Vuelta 2 (acotada a 207e8a33..fa5f2772)

Solo docs (`requirements.md`, `impl_SLT-198.md`, `features/SLT-198.md`); el diff no toca `lib/`, `app/`,
`tests/` ni `e2e/`.

- [x] **B1** — `## Tasks`: T1–T7 en `[x]`. Resuelto.
- [~] **m1** — la sección pasó a «RESUELTO — R1225» y el mapa R→test dice «resuelto». Pero la línea final
      `## Veredicto` de `progress/impl_SLT-198.md` todavía dice «R1225 … contradice el codigo; requiere
      decision», y eso choca con la sección de arriba. **menor**, no bloquea.
- [x] **m2** — `## Estado` al día y `## Preguntas abiertas`: «Ninguna». Resuelto.

Sin regresiones: la vuelta no cambia código.

**Veredicto vuelta 2: OK.**
