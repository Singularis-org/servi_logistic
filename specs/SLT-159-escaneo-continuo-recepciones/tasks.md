# SLT-159 «Escaneo continuo en recepciones y recogidas» — tasks

Requisito previo: SLT-158 «Entrada de escaneo para pistola» mergeada en `dev` (y con ella SLT-157
«Guía única leída por cámara o pistola»). Sin servidor: todo es `frontend_dev`.

- [ ] **T1 — Sesión pura.** `lib/utils/sesion-escaneo.ts`: tipos de fila y desenlace, reductor,
  `contadores` («Recibidas», «Repetidas», «No encontradas» con su número) y `textoContador` (singular/plural, solo M1/M2). *Hecho:* R586 en verde en
  `tests/unit/utils/sesion-escaneo.test.ts` con los literales a mano.
- [ ] **T2 — Hook de sesión (depende de T1).** `hooks/useSesionEscaneo.ts` sobre la cola de
  `useEntradaEscaneo` (SLT-158): `leerGuia`, repetidas (R585), filas por `id`, `huboRecepcion`.
  *Hecho:* R587 en verde en `tests/unit/hooks/useSesionEscaneo.test.ts`; R584-R585 en el reductor.
- [ ] **T3 [P] — Cámara continua.** `QrScanner` prop `continuo` (no cierra; mismo texto antes de
  `ESPERA_MISMO_CODIGO_MS = 3000` se ignora). Modo suelto intacto. *Hecho:* R588-R589 en verde en
  `tests/components/QrScanner.test.tsx`; los casos existentes de `QrScanner` sin tocar y en verde.
- [ ] **T4 — Lista y contadores (depende de T1).** `components/shared/EscaneoContinuo.tsx` (`role="log"`,
  más reciente arriba, alto máximo con desplazamiento). `EscanerGuiaCard` prop `continuo` (pasa a
  `QrScanner`, sin línea `exito`, lista debajo respetando el orden por puntero). `EscanerModal` prop
  `onCerrado`. «Reintentar» (44 px) en las filas «No se pudo recibir» (DC6). Página «Recibir paquetes» en escritorio
  (DC5, R600): su ruta y su punto de entrada los fija `design.md` antes de implementar. *Hecho:* R581-R584,
  R590-R591, R593 y R600 en verde en `tests/components/EscaneoContinuo.test.tsx`.
- [ ] **T5 — Recepciones (depende de T2-T4).** C1, C2 y C3/C4: `notificar` → `desenlace(result)` puro
  (los motivos son los textos de hoy), modo continuo con `useSesionEscaneo`, sin toast por lectura,
  `onRecibida` una vez al cerrar si `huboRecepcion`. Los padres (`OrdenesListado`, `PorRecibirModule`,
  `RecepcionSateliteModule`) pasan el refresco por `onCerrado`. *Hecho:* R580, R583, R592 en verde en
  los tests de las tres superficies.
- [ ] **T6 [P] — C5 (depende de T3).** `cierre-confirmacion-fisica.tsx` pasa `continuo` a su tarjeta;
  nada más cambia. *Hecho:* R588 (C5) en verde en `CierresAdminConfirmacionFisica.test.tsx`; sus
  casos existentes en verde.
- [ ] **T7 [P] — Verificar guía sigue suelta (depende de T3).** Sin cambios de producción; caso nuevo
  en `VerificarGuiaGate.test.tsx`. *Hecho:* R594 en verde.
- [ ] **T7b — Recogidas del mensajero (depende de T2-T4).** `useRecogerPorGuia` y
  `useRecolectarPorGuia` devuelven el desenlace (conservan relectura de SLT-69 y reserva de la 261);
  `RecogerPaqueteCard` y `RecoleccionModule` en modo continuo con el verbo de su superficie;
  `RecogerModule` y `RecoleccionModule` refrescan por `onCerrado`. *Hecho:* R595-R599 en verde en
  `RecogerPaqueteCard.test.tsx`, `RecoleccionModule.test.tsx`, `RecogerModule.test.tsx` y
  `sesion-escaneo.test.ts`; los casos existentes de SLT-69 y 261 en verde.
- [ ] **T8 — Dispositivo (depende de T5).** En Preview: en `/ordenes` (maestro) recibir 10 etiquetas
  seguidas con la pistola sin tocar la pantalla, con una repetida y una ajena; en el teléfono de
  tienda, cinco con la cámara abierta; en el teléfono de un mensajero, recoger cinco en bodega y
  recolectar tres en tienda con la cámara abierta (con el disparador de SLT-156 si ya está en `dev`). Comparar con el canvas aprobado (orden, textos, contadores).
  Nota en `progress/features/SLT-159.md`. *Hecho:* nota escrita y diferencias con el canvas, cero.
- [ ] **T9 — Cierre.** `./init.sh` en verde; E2E locales de las pantallas tocadas
  (`e2e/recepcion-satelite.spec.ts`, `e2e/cierres-admin.spec.ts`, `e2e/mis-asignaciones.spec.ts` y los de `/ordenes` que usan
  «Recibir paquete»; `docs/perfil-agentes.md > E2E en local antes del PR`); mapa R → test en
  `progress/impl_SLT-159.md`.

## Tamaño

- Archivos: **30** (18 de producción, 12 de tests); tope 40, 80% = 32. Por debajo: no se parte
  (corte de reserva en `requirements.md > Preguntas abiertas`).
- Producción: ~740 líneas (sesión ~110, hook ~110, lista ~120, cámara ~40, tarjeta/modal ~40,
  tres recepciones ~100, padres ~20, recogidas del mensajero ~200); tope 1000.
- Tests: ~1 250 líneas (lista ~350, hook ~150, sesión ~130, cámara ~80, recepciones ~220,
  mensajero ~320); tope 3000.

## Archivos esperados

- `lib/utils/sesion-escaneo.ts`
- `hooks/useSesionEscaneo.ts`
- `components/shared/EscaneoContinuo.tsx`
- `components/shared/EscanerGuiaCard.tsx`
- `components/shared/EscanerModal.tsx`
- `components/shared/QrScanner.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx`
- `app/(app)/recepcion-satelite/_components/PorRecibirModule.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx`
- `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`
- `app/(app)/mis-asignaciones/_components/RecogerModule.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`
- `tests/unit/utils/sesion-escaneo.test.ts`
- `tests/unit/hooks/useSesionEscaneo.test.ts`
- `tests/components/EscaneoContinuo.test.tsx`
- `tests/components/QrScanner.test.tsx`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/RecogerModule.test.tsx`
- `tests/components/VerificarGuiaGate.test.tsx`
