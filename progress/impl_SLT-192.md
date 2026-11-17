# impl SLT-192 «Mapa de ruta según el canvas» — frontend_dev

Ruta ligera; spec `specs/SLT-192-mapa-ruta-segun-canvas/requirements.md` (R880-R890). T1-T4 hechas;
T5 (gate `./init.sh` + E2E en local) queda para el leader.

## Archivos

Producción:
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx` — props `onOcultar` y `nota`; bajo la
  leyenda: nota y fila «Ver mapa completo» + «Ocultar mapa» (`size="touch"`); a pantalla completa
  ninguno de los dos. Sin `onOcultar`, el pie queda como antes.
- `app/(app)/mis-asignaciones/_components/RutaMapa.tsx` — pasa las dos props.
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx` — rótulo «Mapa de ruta» siempre;
  `botonMapa` solo con el mapa cerrado («Mostrar mapa», aviso o rótulo como hoy); `RutaMapa` recibe
  `onOcultar` y la nota (sale de encima del mapa); al plegar desde el pie el foco pasa a «Mostrar
  mapa»; `HojaParadaMapa` ya no recibe `total`.
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx` — cabecera en una fila `flex-wrap`
  (número · remisión mono · destinatario · chip de estado); dirección con `lineaUbicacion`; sin botón
  «Cerrar» ni `CERRAR_HOJA`; `SheetTitle` `sr-only` «Parada {n}» / «Parada sin posición»; prop
  `total` eliminada (ya no se pinta «de {total}»).
- `app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts` — `lineaUbicacion()` pura.
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx` — usa `lineaUbicacion`
  (solo el armado de la ubicación; nada más).

Tests:
- `tests/components/RutaMapaInner.test.tsx` (nuevo describe SLT-192; nombre de la hoja «Parada 2»)
- `tests/components/RepartoMapa.test.tsx` (doble con `onOcultar`/`nota`; R544 reescrito; describe SLT-192)
- `tests/components/RepartoMovil.test.tsx` (R509 ajustado: abierto sin control en el aviso; cerrado, «Mostrar mapa»)
- `tests/components/RepartoModule.test.tsx` (el doble de `RutaMapa` pinta la nota)
- `tests/components/HojaParadaMapa.test.tsx` (describes R887-R890; fuera el test de «Cerrar»)
- `tests/unit/utils/pos-format.test.ts` (nuevo)
- `e2e/pwa-mensajero-mapa.spec.ts` ((a) y (b) ajustados) — **escrito, NO corrido** (necesita build; T5).

## R → test

| Req. | Test |
|---|---|
| R880 | `RutaMapaInner.test.tsx` › «R880/R885: bajo la leyenda va la nota y después los dos botones, ambos de 44 px»; `e2e/pwa-mensajero-mapa.spec.ts (a)` («Ocultar mapa» en el grupo, debajo del mapa, 44 px) |
| R881 | `RepartoMapa.test.tsx` › «R881: abierto, el módulo no pinta ningún «Ocultar mapa»/«Mostrar mapa»…» y «R881: con avisos y el mapa abierto, la fila del aviso no tiene control del mapa»; `RepartoMovil.test.tsx` › R509 |
| R882 | `RutaMapaInner.test.tsx` › «R882: pulsar «Ocultar mapa» llama a la acción de plegar»; `RepartoMapa.test.tsx` › «plegar desde el pie muestra «Mostrar mapa» (44 px, aria-expanded=false)…»; e2e (a) |
| R883 | `RepartoMapa.test.tsx` › «R883: con avisos y el mapa cerrado…» y el de R544; `RepartoMovil.test.tsx` › «sin avisos y con el mapa cerrado…»; e2e (a) |
| R884 | `RepartoMapa.test.tsx` › «R884: el rótulo «Mapa de ruta» se ve con y sin avisos, abierto y cerrado»; e2e (a) |
| R885 | `RutaMapaInner.test.tsx` › «R880/R885…» (orden leyenda → nota → botones); `RepartoMapa.test.tsx` › «R885: con origen aproximado…» y «R885: con origen GPS no hay nota» |
| R886 | `RutaMapaInner.test.tsx` › «R886: a pantalla completa no están ni la nota ni «Ocultar mapa»; vuelven al cerrarla»; e2e (a) (sin «Ocultar mapa» a pantalla completa) |
| R887 | `HojaParadaMapa.test.tsx` › describe «SLT-192 R887» (orden de la fila, mono, sin «Parada n de», «·» sin posición) |
| R888 | `HojaParadaMapa.test.tsx` › describe «SLT-192 R888» (4 casos); `tests/unit/utils/pos-format.test.ts` (6 casos) |
| R889 | `HojaParadaMapa.test.tsx` › describe «SLT-192 R889» (sin «Cerrar», Escape, asa hacia abajo); `RepartoMapa.test.tsx` › «cerrar la hoja (Escape…) vuelve al mapa»; e2e (b) |
| R890 | `HojaParadaMapa.test.tsx` › describe «SLT-192 R890» («Parada 2», «Parada sin posición»); `RutaMapaInner.test.tsx` (m4, «Parada 2»); e2e (b) |

«Tocar fuera» (R889) lo da la `Sheet` (backdrop de Base UI); en jsdom no se prueba el backdrop: cubren
el cierre Escape y el asa.

## Salida de los comandos

- `pnpm typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, tsc se quedó sin heap a
  los ~150 s, exit 134) → `tsc --noEmit`, **exit 0**.
- `pnpm lint` → `✖ 248 problems (0 errors, 248 warnings)`, **exit 0** (avisos previos; ninguno en
  archivos de producción tocados; el de `RepartoModule.test.tsx:163` `ordenCardsEnReparto` ya estaba).
- `pnpm exec vitest related --run <12 archivos tocados>` → `Test Files 55 passed (55)`,
  `Tests 924 passed (924)`, **exit 0**.
- E2E `e2e/pwa-mensajero-mapa.spec.ts`: no corrido (necesita build + base desechable; T5 del leader).

## Veredicto

T1-T4 hechas, R880-R890 con test, typecheck/lint/vitest related en verde; falta T5 (gate + E2E en local).
