# SLT-168 «Escaneo continuo en las recogidas del mensajero» — tasks

Requisito previo cumplido en `dev`: SLT-159 «Escaneo continuo en recepciones y recogidas» (rebanada b,
PR #192). Todo es `frontend_dev`; ningún archivo de servidor. Un solo PR.

- [x] **T1 — Textos por superficie.** `lib/utils/sesion-escaneo.ts`: `TextosSesion`,
  `TEXTOS_RECEPCION` (los literales de hoy), `TEXTOS_RECOGIDA`, `TEXTOS_RECOLECCION`; `textoEstado`
  con `textos` opcional. `components/shared/EscaneoContinuo.tsx`: `textos?` en `ContadoresEscaneo`,
  `LecturasEscaneo` y `TarjetaEscaneoContinuo`, `icono?` en la tarjeta. *Hecho:* R597, R830 y la parte
  de textos de R831 en verde en `tests/unit/utils/sesion-escaneo.test.ts`; R834: los casos de SLT-159
  de `sesion-escaneo.test.ts` y `EscaneoContinuo.test.tsx` en verde **sin tocarlos**, más el caso nuevo
  «sin `textos` pinta «Recibidas»».
- [x] **T2 [P] — M1 a desenlace (depende de T1 solo por el tipo).** `useRecogerPorGuia.ts`: devuelve
  `DesenlaceRecepcion` con `resumen` de la orden resuelta (lista o relectura), sin `useToast`; mismos
  motivos de hoy, mismo `nombreDeEstado`. *Hecho:* R596 (M1, por `status`), R599 y R832 (fuente) en
  verde en `tests/components/useRecogerPorGuia.test.tsx`; la relectura de SLT-69 una vez por lectura
  que la necesite.
- [x] **T3 [P] — M2 a desenlace (depende de T1 solo por el tipo).** `useRecolectarPorGuia.ts`: recibe
  `conocidas`, devuelve `DesenlaceRecepcion` con `resumen` si la guía está en ellas, sin `useToast`;
  sigue sin rechazar en cliente. *Hecho:* cubierto por los casos de T5 (no hay test propio del hook
  hoy).
- [x] **T4 — Diálogo continuo en M1 (depende de T1, T2).** `RecogerPaqueteCard.tsx`:
  `TarjetaEscaneoContinuo` dentro del `EscanerModal` de hoy, `alCerrarConRecepcion={onRecogida}`, sin
  `ultimaRecogida` ni `exito`. `RecogerModule.tsx` **no cambia**. *Hecho:* R595, R596, R598 (relectura
  y refresco único), R599, R830-R833 en verde en `tests/components/RecogerPaqueteCard.test.tsx` y
  `tests/components/RecogerModule.test.tsx` (los casos de toast y de refresco por acierto se reescriben
  al comportamiento nuevo, no se borran sin sustituto).
- [x] **T5 — Diálogo continuo en M2 (depende de T1, T3).** `RecoleccionModule.tsx`: lo mismo dentro de
  su `EscanerModal`; `router.refresh()` pasa a `alCerrarConRecepcion`; `conocidas` en memo. Nada fuera
  del bloque del escáner. *Hecho:* R595-R598, R830-R833 en verde en
  `tests/components/RecoleccionModule.test.tsx`.
- [ ] **T6 [P] — Guardias (depende de T4, T5).** `lectura-guia-unica.guardia.test.ts` y
  `rutas-336-retiradas.guardia.test.ts` según `design.md > Guardias`. *Hecho:* `pnpm run
  test:guardias` en verde; mutación anotada en `progress/impl_SLT-168.md`: quitar
  `<TarjetaEscaneoContinuo` de `RecogerPaqueteCard.tsx` pone las dos en rojo.
- [ ] **T7 — E2E (depende de T4, T5).** `e2e/mis-asignaciones.spec.ts:73`: el toast «Guía {n}
  recogida.» pasa a la fila «Recogida» del diálogo. `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (b):
  dos guías sembradas seguidas con Enter → dos filas «Recolectada» con el diálogo abierto; al cerrar,
  las listas se actualizan (ya lo comprueba). *Hecho:* los dos E2E en verde en local con base
  desechable (`docs/perfil-agentes.md > E2E en local antes del PR`).
- [ ] **T8 — Cierre.** `./init.sh` en verde (con `.env` copiado al worktree); mapa R → test en
  `progress/impl_SLT-168.md`; en Preview, Carlos recoge cinco paquetes seguidos con la cámara en
  `/mis-asignaciones/recoger` y en `/recoleccion` (una guía repetida, una ajena) y confirma los textos
  (`requirements.md > Preguntas abiertas` 1-3).

## Tamaño

Tope (`arnes.config.json` sin `gate.tamano_pr` → valores por defecto): 40 archivos (80 % = 32), 1 000
líneas de producción y 3 000 de tests, añadidas + borradas.

| Pieza | Archivos | Producción (estimada) | Tests (estimada) |
| --- | --- | --- | --- |
| Ficha entera | **16** (6 + 10) | **~330** | **~850** |

Desglose de producción: `sesion-escaneo.ts` 50, `EscaneoContinuo.tsx` 30, `useRecogerPorGuia.ts` 70
(cada `rechazar` con toast pasa a desenlace: borra y añade), `useRecolectarPorGuia.ts` 60,
`RecogerPaqueteCard.tsx` 60, `RecoleccionModule.tsx` 60.
Desglose de tests: `RecogerPaqueteCard.test.tsx` 250, `RecoleccionModule.test.tsx` 220,
`useRecogerPorGuia.test.tsx` 150, `RecogerModule.test.tsx` 60, `sesion-escaneo.test.ts` 50,
`EscaneoContinuo.test.tsx` 20, dos guardias 30, dos E2E 50.

Cabe (40 % de archivos, ~33 % de producción, ~28 % de tests).

## Archivos esperados

- `lib/utils/sesion-escaneo.ts`
- `components/shared/EscaneoContinuo.tsx`
- `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx`
- `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `tests/unit/utils/sesion-escaneo.test.ts`
- `tests/components/EscaneoContinuo.test.tsx`
- `tests/components/useRecogerPorGuia.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecogerModule.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/unit/guards/lectura-guia-unica.guardia.test.ts`
- `tests/unit/guards/rutas-336-retiradas.guardia.test.ts`
- `e2e/mis-asignaciones.spec.ts`
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`
