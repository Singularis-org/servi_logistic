# Review SLT-166 «PWA del mensajero: mapa de ruta»

Rebanada E de SLT-156 «PWA de los mensajeros: tablas usables en el móvil». Revisado `origin/dev...5befb42a`
(merge-base `03635a54`) en `.worktrees/SLT-166-pwa-mapa-ruta`, contra `specs/SLT-156-pwa-mensajero-tablas/`
(R539-R544, `design.md §11`, `tasks.md > Rebanada E`), `progress/impl_SLT-166.md`, `progress/features/SLT-166.md`
(`## Decisiones` del leader, ya aceptadas), `CHECKPOINTS.md` y `docs/checkpoints-proyecto.md`.
Grafo no usado: el diff es pequeño y conocido; se exploró con Grep/Read.

## Verificación ejecutada por el reviewer

- `vitest run` de `ruta-mapa-iconos`, `RutaMapaInner`, `CarruselCards`, `HojaParadaMapa`, `RepartoMapa`,
  `RepartoModule` y la guardia `pwa-mensajero-sin-recorte` (base `slt166_gate`): **7 archivos, 206 tests verdes**.
- `pnpm run test:guardias`: 351/352 archivos verdes; el rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json` (no es hallazgo).
- `pnpm run typecheck` exit 0; `eslint` sobre los 13 archivos de código y tests del diff exit 0.
- `node scripts/tamano-pr.mjs`: 15/40 archivos, 661/1000 de producción, 920/3000 de tests.
- `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin cambios: ninguna dependencia nueva.
- E2E: no lo corrí (no se levanta servidor en esta revisión). La bitácora deja la constancia: `--project=reparto`
  `pwa-mensajero-mapa`, `pwa-mensajero-reparto`, `mis-asignaciones`, `reintentos-escalado` → 13 passed, `E2E_EXIT=0`
  (`progress/impl_SLT-166.md:66-68`).

## Checklist

- [x] Ruta completa (frontend/high), spec del conjunto con requirements, design (alternativas descartadas en §13) y tasks.
- [x] `design.md > ## Lo que ya existe` presente; el diff reusa `Sheet`, `CarruselCards`, `AbrirEnAppNavegacion`,
      `GestionarOrdenCardButton`, `PosAmountRow`, `RutaMapa/RutaMapaInner`. No re-crea nada.
- [x] Tasks E1-E4 en `[x]`.
- [x] Tamaño del PR dentro del tope.
- [x] Trazabilidad R539-R544 → tests (tabla en `progress/impl_SLT-166.md:39-46`), revisada abajo.
- [x] Typecheck y lint verdes. Guardias verdes salvo el rojo del baseline.
- [x] Flujo crítico `mis-asignaciones`: E2E afectados corridos en local según bitácora.
- [x] Sin dependencias nuevas; sin secretos; sin literales de país en código nuevo (`PAIS_DE_OPERACION`);
      sin `db/`, sin queries, sin permisos nuevos.
- [x] Ningún recurso de Ordenex.

## Puntos pedidos por el leader

1. **Trazabilidad y tests contra su propia fuente.** Los tests comparan con literales que son el contrato
   (`"background:var(--color-brand-light)"`, `"Paradas 1 de 2"`, `"Parada 2 de 3"`, `rgb(255, 208, 0)`), no con
   `COLOR_MARCADOR`/`htmlMarcador`/`textoParadasEnMapa`. `ruta-mapa-iconos.test.ts:30-42` comprueba además que cada
   `var()` está DECLARADA en `globals.css` o en el tema de Tailwind (no contra el propio módulo). El E2E mide el color
   PINTADO (`pwa-mensajero-mapa.spec.ts:153-161`) y que cambia al pasar de tarjeta (R542). OK.
2. **«Gestionar» desde la hoja.** `HojaParadaMapa.tsx:175-179` usa el `GestionarOrdenCardButton` de la tarjeta;
   `RepartoModule.tsx:1029-1045` llama a `seleccionar(orden)`, la misma función que la tarjeta
   (`RepartoModule.tsx:641`), con la misma condición de apagado (`:636-640` vs `:1035-1040`). Ninguna llamada nueva al
   servidor; `RepartoMapa.test.tsx:213-239` lo prueba (foco en g2, `escogerParaGestion` no llamado) y el E2E (b) llega
   a «Confirmar guía». OK.
3. **`sinDesborde` y `.leaflet-container`** (`e2e/_pwa-mensajero-fixture.ts:85-87`). Exime solo a los DESCENDIENTES
   del contenedor (`n !== el`); el contenedor se sigue midiendo. En la app solo usan esa clase `RutaMapaInner` y
   `UbicacionMapaInner` (ambos Leaflet). Lo único propio dentro del contenedor es `BotonCentrar`, que solo existe en
   pantalla completa (ya `fixed`, ya exento antes). Leyenda, «Ver mapa completo», barra superior y hoja quedan fuera
   del contenedor y se miden. No abre hueco para A-D. OK.
4. **`CarruselCards.onIndiceChange`.** Prop opcional; `useAvisoDeIndice` sale sin suscribirse si no llega
   (`CarruselCards.tsx:148`) y lo fija `CarruselCards.test.tsx:245-255`. Los otros consumidores (`RecogerModule`,
   `RecoleccionModule`, `RecolectadasHoyLista`, `CarruselDePlanes`) no la pasan. OK.
5. **Sin `#hex` en marcadores; sin dependencia nueva.** `ruta-mapa-iconos.ts` solo usa `var(--color-*)`; el test lo
   fija con regex. Las `Polyline` siguen con `#2563eb`/`#111111` (`RutaMapaInner.tsx:313, 329`): no son marcadores y
   no están en R539. OK.
6. **E2E sin red.** `page.route(/tile\.openstreetmap\.org/)` sirve un PNG local (`pwa-mensajero-mapa.spec.ts:85-87`);
   el CSS de Leaflet va en el bundle. OK.

## Hallazgos

Ningún BLOQUEANTE.

- **menor** — Docs del spec sin la desviación aceptada: `tasks.md:171-172` (E1 *Hecho* aún dice «usa `var(--navy)`,
  `var(--brand-light)`, `var(--success)`»), `design.md:271` (mismas variables) y `requirements.md:401-403` (R541: «Ocultar
  mapa» bajo el mapa). La decisión está en `progress/features/SLT-166.md:31-33`, pero el spec dice otra cosa que el código.
- **menor** — «Gestionada» no está en una sección `## Deudas`: vive en `## Preguntas abiertas`
  (`progress/features/SLT-166.md:35-38`). Tiene que quedar como deuda en `## Cierre` / `progress/deudas.md` (R539 la pide
  y nunca se pinta).
- **menor** — Totales distintos para la misma idea: la hoja dice «Parada n de {total}» con `porGestionar.length`
  (`RepartoModule.tsx:1031`, igual que la tarjeta en `:604`) y la barra de pantalla completa «Paradas n de {total}» con
  `porGestionarFiltrado.length` (`RepartoModule.tsx:943`). Con el buscador o un filtro activo los dos totales no
  coinciden; a mirar con Carlos en Preview junto a la decisión de `progress/features/SLT-166.md:33`.
- **menor** — Escape en pantalla completa con la hoja abierta: el `keydown` de `window` (`RutaMapaInner.tsx:262-269`)
  cierra también la pantalla completa, no solo la hoja. Y el caso marcador → hoja ENCIMA de la pantalla completa
  (canvas RepartoMapaCompleto) no lo recorre ningún test; el E2E (b) toca el marcador con el mapa en su sitio.
- **menor** — `CarruselCards.tsx:103` lee `api.internalEngine().slideRegistry`, API interna de embla (puede cambiar en un
  minor). Tiene caída a `selectedScrollSnap()` y el test de varias por página la cubre; anotarlo.

## Veredicto

**OK**
