# impl SLT-168 «Escaneo continuo en las recogidas del mensajero» — frontend_dev

Fecha: 2026-11-17. Rama `feature/SLT-168-escaneo-continuo-recogidas`, desde `9c84a227` (spec aprobado).
Tasks T1-T7 hechas (T7: E2E ajustados, **sin correr**, por instrucción del leader). T8 (gate con
`.env`, Preview con Carlos) queda para el leader.

## Commits

| SHA | Task |
| --- | --- |
| `6d0a4cab` | T1 textos por superficie (`TextosSesion`, `TEXTOS_RECEPCION/RECOGIDA/RECOLECCION`, `textos?`/`icono?`) |
| `975a4c4c` | T2 `useRecogerPorGuia` → `DesenlaceRecepcion`, sin toasts, `resumen` de la orden |
| `ad28aa7a` | T3 `useRecolectarPorGuia(conocidas)` → `DesenlaceRecepcion`, sin toasts |
| `c85e6f07` | T4 `RecogerPaqueteCard` con `TarjetaEscaneoContinuo` (`RecogerModule.tsx` sin cambios) |
| `528e59c9` | T5 `RecoleccionModule`: solo el contenido del `EscanerModal` y su `procesar` |
| `f219e2d2` | T6 guardias `lectura-guia-unica` y `rutas-336-retiradas` |
| `9f89030e` | T6 esperas con contenido (ancla-de-carga) + excepción en la guardia 455 (retirada después) |
| `8389162f` | T7 E2E `mis-asignaciones` y `pwa-mensajero-recoger-recoleccion` (b) |
| `8b2e38b7` | fix: comentario JSX dentro de llaves (lint) y tipos de los dobles |

## Archivos

Producción (6): `lib/utils/sesion-escaneo.ts`, `components/shared/EscaneoContinuo.tsx`,
`app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`, `.../RecogerPaqueteCard.tsx`,
`app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`, `.../RecoleccionModule.tsx`.

Tests (9): `tests/unit/utils/sesion-escaneo.test.ts`, `tests/components/EscaneoContinuo.test.tsx`,
`tests/components/useRecogerPorGuia.test.tsx`, `tests/components/RecogerPaqueteCard.test.tsx`,
`tests/components/RecogerModule.test.tsx`, `tests/components/RecoleccionModule.test.tsx`,
`tests/unit/guards/lectura-guia-unica.guardia.test.ts`, `tests/unit/guards/rutas-336-retiradas.guardia.test.ts`,
(`tests/unit/guards/nombres-estado-retirados.guardia.test.ts` vuelve a ser idéntica a `origin/dev`).

E2E (2): `e2e/mis-asignaciones.spec.ts`, `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`.
Spec: `specs/SLT-168-escaneo-continuo-recogidas/tasks.md` (T1-T7 marcadas).

Sin dependencias, sin servidor, sin esquema. Ningún archivo de recepciones de SLT-159 cambia salvo
las piezas compartidas (props opcionales con valor por defecto = lo de hoy).

## Mapa R → test

| R | Test |
| --- | --- |
| R595 | `RecogerPaqueteCard.test.tsx` «R595: tres lecturas seguidas (cámara, cámara, Enter)…» (3 llamadas en orden, `stop` sin llamar, sin toasts, la repetida no se reenvía); `RecoleccionModule.test.tsx` «R595: tres lecturas seguidas…»; E2E `pwa-mensajero-recoger-recoleccion` (b) dos guías con Enter → dos filas «Recolectada», diálogo abierto |
| R596 | `useRecogerPorGuia.test.tsx` (cada `status` → su desenlace con el motivo de hoy; `no_encontrada`; `recibida`); `RecogerPaqueteCard.test.tsx` «R596: ok → Recogida», «…No está entre tus órdenes», «conflict», «forbidden → … Reintentar vuelve a llamar sin añadir fila»; `RecoleccionModule.test.tsx` «R10 + R596», «R12 + R596», «R13 + R596: ya_recolectada», «R13 + R596: forbidden»; `sesion-escaneo.test.ts` textos M1/M2; E2E `mis-asignaciones` fila «Recogida» |
| R597 | `sesion-escaneo.test.ts` «R597: rótulo…», «R597: No se pudo recolectar y Código inválido no suman…»; `RecoleccionModule.test.tsx` «R597: ok, ya_recolectada y no_encontrada → 1, 1, 1» y «R11 + R597: Código inválido que no suma»; `RecogerPaqueteCard.test.tsx` «R597: Código inválido que no suma»; `EscaneoContinuo.test.tsx` «R597/R830: con los textos de M1…» |
| R598 | `RecogerModule.test.tsx` «R598: dos guías…refresca UNA vez al cerrar y ninguna antes», «R598: solo errores y cerrar: NO»; `RecogerPaqueteCard.test.tsx` «refresco único al cerrar» (3 casos, incl. dos relecturas = dos `listarMisAsignaciones`); `RecoleccionModule.test.tsx` «R598: dos recolectadas…», «R598: un ya_recolectada solo…», «R598: solo errores…» |
| R599 | `RecogerPaqueteCard.test.tsx` «R599: orden cargada reservada…» (aviso literal, acción sin llamar); `useRecogerPorGuia.test.tsx` «R599» y «R4 + R599» |
| R830 | `RecogerPaqueteCard.test.tsx` «R830: …Recogiendo…»; `RecoleccionModule.test.tsx` «R830: …Recolectando…»; `sesion-escaneo.test.ts` «R830» |
| R831 | `RecogerPaqueteCard.test.tsx` «R831: 1024 dos veces → Ya recogida…»; `RecoleccionModule.test.tsx` «R831: … Ya recolectada…»; `sesion-escaneo.test.ts` «R831» |
| R832 | `RecogerPaqueteCard.test.tsx` «R832: … cargada, relectura, «—»»; `RecoleccionModule.test.tsx` «R832: … Por recolectar (ok), Recogidos hoy (ya recolectada), «—»»; `useRecogerPorGuia.test.tsx` «R1/R2 + R832», «R10 + R832» |
| R833 | `RecogerPaqueteCard.test.tsx` «R833: …título, nombre accesible y botón, sin «recogida correctamente»; un solo disparador»; `RecoleccionModule.test.tsx` «R833: …»; E2E (b) el diálogo sigue con «Recolectar en tienda» |
| R834 | `EscaneoContinuo.test.tsx` y `sesion-escaneo.test.ts`: casos de SLT-159 sin tocar (solo cambió una línea de `import`), más «R834: sin `textos` pinta «Recibidas» y «Recibida»…» y «R834: sin textos, «Recibiendo…»» |

Casos sustituidos (no borrados sin sustituto): los de toast por acierto/rechazo y refresco por acierto
pasan a la fila y al refresco único; «R15: la confirmación permanece / sobrevive a cerrar» de
Recolección y «tras recoger, la confirmación del último acierto queda a la vista» de Recoger pasan a
R833 (decisión de Carlos 2026-11-17: se quita la línea).

## Salidas

- Typecheck `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`.
- Lint `pnpm exec eslint <18 archivos del diff>` → `LINT_EXIT=0` (antes del fix: 1 error
  `react/jsx-no-comment-textnodes` en `RecoleccionModule.tsx`, el comentario se pintaba como texto).
- Vitest (22 archivos: los 9 de arriba + `useSesionEscaneo`, `ContrasteBrandSoftOscuro`,
  `ancla-de-carga`, `estado-con-info`, `pwa-mensajero-sin-recorte`, `EscanerGuiaCard`, recepciones de
  SLT-159 `EscanerRecepcion*`, `RecepcionContinuaPagina`, `RecibirPaquetesEntrada`,
  `dia-reparto-textos`, `entregas-sin-recoleccion`) → `VITEST_EXIT=0`, `Test Files 22 passed`,
  `Tests 554 passed`.
- `pnpm run test:guardias` → 353/354 archivos verdes; rojo **preexistente y ajeno**:
  `dependencias-declaradas-presentes.guardia.test.ts` (4 casos: `init.sh` no invoca
  `scripts/verificar-dependencias.mjs`; `init.sh` y `scripts/` sin cambios en esta rama).
- E2E: ajustados, no corridos (sin dev server ni build, por instrucción).

## Mutaciones (todas en rojo; restauradas con `git checkout --`, árbol limpio después)

Commit previo `8b2e38b7`. Batería sobre 10 archivos de test (237 casos).

| Mutación | Resultado |
| --- | --- |
| M1 doble recogida: `estadoAlLlegar` nunca marca repetida | 6 rojos (R595 y R831 en M1 y M2, contadores) |
| M2 «Código inválido» suma a «No encontradas» | 5 rojos (R597 en M1, M2, sesión; R584) |
| M3a refresco por lectura en M1 (`onRecogida` tras cada `recoger`) | 7 rojos (R598 en `RecogerModule` y `RecogerPaqueteCard`) |
| M3b refresco por lectura en M2 (`router.refresh` tras cada `recolectar`) | 5 rojos (R598 ×3, R12, R522) |
| M4a texto de recepción en M1 (sin `textos={TEXTOS_RECOGIDA}`) | 24 rojos |
| M4b texto de recepción en M2 (sin `textos={TEXTOS_RECOLECCION}`) | 20 rojos |
| M4c la lista no recibe `textos` | 41 rojos |
| M5 guardia: `RecogerPaqueteCard` monta la tarjeta con alias (`<Continua`) | 2 rojos: `lectura-guia-unica` y `rutas-336-retiradas` (los de componente, verdes) |
| M6 M2 sin `resumen` en `ok` | 2 rojos (R832, R522) |
| M7 reserva 261 llama a la acción | 6 rojos (R599, R13, R22, R4) |
| M8 recepciones con el verbo de recogida (`textoEstado` por defecto = `TEXTOS_RECOGIDA`) | 12 rojos (R834 y casos de SLT-159) |
| M9 M1 sin `resumen` en `ok` | 3 rojos (R832 ×3) |

## Tamaño

`git diff --shortstat 9c84a227 HEAD` (antes de este archivo): 18 archivos, +1156 / −505.
Producción: 6 archivos, +180 / −162. Tests y E2E: 11 archivos, +969 / −336. Spec: +7 / −7.

## Abierto

- Rojo preexistente de `dependencias-declaradas-presentes.guardia.test.ts` (ajeno a esta rama).
- E2E sin correr; T8 (gate con `.env`, Preview) pendiente del leader.
- Choque con SLT-190 y SLT-194: solo cambió el contenido del `EscanerModal` y su `procesar` en
  `RecogerPaqueteCard.tsx` y `RecoleccionModule.tsx`; barra, buscador y listas, intactos.
- MCP del grafo no consultado: se trabajó con Grep/Read.

## Cambio 2026-11-17: «Recogida en tienda» (decisión de Carlos)

«Recolectada»/«Recolectadas» son nombres de estado retirados por la 455. Carlos decidió no usarlos:
`TEXTOS_RECOLECCION` pasa a fila «Recogida en tienda», «Ya recogida en tienda» y contador «Recogidas
en tienda». «Recolectando…» y «No se pudo recolectar» se quedan porque la guardia no los marca.
Se retiró la excepción de `nombres-estado-retirados.guardia.test.ts` (idéntica a `origin/dev`, en
verde). Literales actualizados a mano en `sesion-escaneo.test.ts`, `RecoleccionModule.test.tsx` y el
E2E (b); spec (R596-R598, R830, R831) y `progress/features/SLT-168.md > Decisiones`.

- Vitest (14 archivos de la ficha + guardia 455 + `ContrasteBrandSoftOscuro` + recepciones):
  `VITEST_EXIT=0`, `Tests 357 passed`. Typecheck y lint: ver el commit del cambio.
- Mutación: `TEXTOS_RECOLECCION.exito` = «Recolectada» → guardia 455 y tests de M2 en rojo
  (detalle abajo, restaurada con `git checkout --`).

Veredicto: SLT-168 implementada (T1-T7) con los textos finales de Carlos; typecheck, lint y tests en verde y las mutaciones en rojo; quedan el E2E y el gate del leader.
