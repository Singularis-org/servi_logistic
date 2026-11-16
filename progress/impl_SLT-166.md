# impl SLT-166 «PWA del mensajero: mapa de ruta» — rebanada E de SLT-156 «PWA de los mensajeros: tablas usables en el móvil»

## Tanda 1 (E1-E4) · frontend_dev · 2026-11-15

Spec: `specs/SLT-156-pwa-mensajero-tablas/` (R539-R544, `design.md §11`, `tasks.md > Rebanada E`). Grafo no
consultado: lo tocado es un módulo conocido y se exploró con Grep/Read.

### Archivos

Producción (`MA/` = `app/(app)/mis-asignaciones/_components/`):
- `MA/ruta-mapa-iconos.ts` (nuevo) — E1: `htmlMarcador(tipo, numero)` y `COLOR_MARCADOR` (siguiente, pendiente,
  gestionada, origen «Tú»), solo `var(--color-*)`; área de 44 × 44 y nombre accesible «Parada {n}» en `sr-only`.
- `MA/RutaMapaInner.tsx` — E1/E3: marcadores con `htmlMarcador` (la activa amarilla, `zIndexOffset`), `click` →
  `onSeleccionarParada`, leyenda «Siguiente · Pendiente · Gestionada · Tú», «Ver mapa completo» (44 px), el MISMO
  contenedor pasa a `fixed inset-0 z-50` (`role="dialog"`) con «Cerrar» y «Paradas {n} de {total}», «Centrar en mi
  ubicación» (`icon-touch`, `aria-label`), `invalidateSize` al cambiar, `panTo` al cambiar la activa, Escape cierra.
  Las `Polyline` no cambian (las lee `paleta-secundaria`).
- `MA/RutaMapa.tsx` — pasa `paradaActivaId`, `onSeleccionarParada`, `totalParadas`.
- `MA/HojaParadaMapa.tsx` (nuevo) — E3: `Sheet side="bottom"` con asa (toque o arrastre), parada, remisión, estado,
  destinatario, dirección, `PosAmountRow` («Cobrar»), «Navegar» → `AbrirEnAppNavegacion` y el
  `GestionarOrdenCardButton` de la tarjeta; «Cerrar» de 44 px.
- `components/shared/CarruselCards.tsx` — E2: `onIndiceChange` en `select` y `reInit` (primera tarjeta de la
  página por `slideRegistry`).
- `MA/RepartoModule.tsx` — E2/E3: `indiceCarrusel` → `paradaActivaId` (solo Mosaico), nota «El mapa se centra en
  la orden del carrusel.», `HojaParadaMapa` con las mismas condiciones de «Gestionar» que la tarjeta y
  `seleccionar(orden)` (el modo foco de la rebanada B; ninguna llamada nueva al servidor), «Mostrar mapa» `touch`.

Tests y E2E:
- `tests/unit/utils/ruta-mapa-iconos.test.ts` (nuevo), `tests/components/RutaMapaInner.test.tsx` (mock con
  `useMap` compartido, 7 casos nuevos), `tests/components/CarruselCards.test.tsx` (3 casos; envuelve el hook real de
  embla), `tests/components/HojaParadaMapa.test.tsx` (nuevo), `tests/components/RepartoMapa.test.tsx` (nuevo).
- `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` — los 5 archivos de E con las tres reglas.
- `e2e/pwa-mensajero-mapa.spec.ts` (nuevo), registrado en el proyecto `reparto` de `playwright.config.ts`.
- `e2e/_pwa-mensajero-fixture.ts` — `sinDesborde` exime lo que hay DENTRO de `.leaflet-container` (tiles fuera de
  la vista por diseño, recortados por el contenedor); el contenedor sí se mide.

### R → test

| R | Test |
|---|---|
| R539 | `ruta-mapa-iconos.test.ts` (sin hex, cada `var()` declarada en `globals.css`/tema de Tailwind, colores por tipo); `RutaMapaInner.test.tsx` «la parada activa va amarilla…», «sin parada activa…», «leyenda»; E2E (a): el marcador se pinta `rgb(255, 208, 0)` |
| R540 | `HojaParadaMapa.test.tsx` (datos, asa, «Navegar» → «Abrir en:», «Gestionar» → diálogo → `onGestionar`, apagado, «Cerrar»); `RutaMapaInner.test.tsx` «el `click` del marcador…»; `RepartoMapa.test.tsx` «tocar el marcador de g2… modo foco, sin llamar al servidor», «cerrar la hoja»; E2E (b) |
| R541 | `RutaMapaInner.test.tsx` «Ver mapa completo la abre… invalidateSize; Cerrar la devuelve», «mide 44 px»; E2E (a): caja = ventana, «Paradas 1 de 2», mapa > 400 px |
| R542 | `CarruselCards.test.tsx` «en `select` emite…», «varias por página…»; `RutaMapaInner.test.tsx` «al cambiar `paradaActivaId` llama a `panTo`…»; `RepartoMapa.test.tsx` «en Mosaico, al deslizar…», «en Detalle…»; E2E (a): pasar de tarjeta cambia el color del marcador |
| R543 | `RepartoModule.test.tsx` «R28/mapa: …SOLO las paradas con coordenadas» (ya existía); `RepartoMapa.test.tsx` R543 (`totalParadas` 3, mapa g1/g2, tarjeta g3); E2E (a): un marcador y la tarjeta sin coordenadas |
| R544 | `RepartoMapa.test.tsx` R544 (textos, `aria-expanded`, `h-11`); E2E (a): `tactil` y plegar/desplegar |

### Mutaciones (todas rojas; revertidas con `cmp` igual)

| Mutación | Rojo en |
|---|---|
| E1 `siguiente` → `#2563eb` | `ruta-mapa-iconos.test.ts` + `RutaMapaInner.test.tsx` (5 rojos) |
| E2 quitar `api.on("select", avisar)` | `CarruselCards.test.tsx` (2 rojos) |
| E3 quitar `map.invalidateSize()` | `RutaMapaInner.test.tsx` R541 (1 rojo) |
| E4 `size="xs"` en «Mostrar mapa» | `RepartoMapa.test.tsx` R544 (1 rojo) y E2E (a) `tactil` 24 < 44 (build con la mutación) |
| E5 «Gestionar» de la hoja no avisa | `HojaParadaMapa.test.tsx` + `RepartoMapa.test.tsx` R540 (2 rojos) |
| E6 sin `onIndiceChange` en Reparto | `RepartoMapa.test.tsx` R542 (1 rojo) |

Tras revertir: `git diff --stat` igual que antes de mutar; `size="xs"` 0 veces en `RepartoModule.tsx`.

### Salida de los comandos

- `pnpm run typecheck` → exit 0. `pnpm exec eslint <archivos de E>` → exit 0.
- vitest (base desechable `slt166_gate`): los 5 archivos de E + guardias + `RepartoModule`/`RepartoMovil`/
  `RepartoModoFoco` → `6 passed (6) · 242 passed`, y los nuevos sueltos verdes.
- E2E (base nueva `servi_slt166_e2e`, `next build`, `E2E_PUERTO=3102`, `E2E_STORAGE_PUERTO=54402`,
  `NEXT_PUBLIC_APP_URL=http://localhost:3102`): `--project=reparto` `pwa-mensajero-mapa`, `pwa-mensajero-reparto`,
  `mis-asignaciones`, `reintentos-escalado` → `13 passed (1.1m)`, `E2E_EXIT=0`. `baseURL` respeta `E2E_PUERTO`.
- `./init.sh` (con `slt166_gate`): `Test Files 77 passed (77) · 997 passed | 1 skipped`, «tamano del PR: 15/40
  archivos, 663/1000 lineas de produccion, 924/3000 de tests», `== init OK ==`, `INIT_EXIT=0`.

### Desviaciones

- Variables: `design.md §11` nombra `var(--navy)`/`var(--brand-light)`/`var(--success)`, que no existen (pintarían
  transparente). Se usan `--color-brand-light`, `--color-brand-dark`, `--color-asfalto-4`, `--color-success`,
  `--color-white` (presentes en el CSS compilado; el E2E lo mide).
- «Ocultar mapa» se queda en su sitio (R509 y su test piden un solo control); bajo el mapa solo «Ver mapa completo».
- «Gestionada»: está en la leyenda y en `htmlMarcador`, pero no se pinta ninguna: `porGestionar` no trae gestionadas.
- E2E: las coordenadas se escriben con el cliente dueño (las empresas del E2E no geocodifican); tiles servidos en
  local.

Veredicto: rebanada E hecha y verificada (R539-R544 con test, 6 mutaciones rojas, E2E 13/13, init verde).
