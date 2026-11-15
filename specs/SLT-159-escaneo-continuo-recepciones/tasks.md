# SLT-159 «Escaneo continuo en recepciones y recogidas» — tasks

Requisito previo: SLT-158 «Entrada de escaneo para pistola» mergeada en `dev` (y con ella SLT-157
«Guía única leída por cámara o pistola»). Todo es `frontend_dev` salvo T0 (`backend_dev`).

**Rebanadas (DC7):** no cabe en un PR. Orden de merge: **(a)** T0; **(b)** T1-T7, T10-T11 y T8-T9 de
recepciones; **(c)** T7b y T8-T9 del mensajero. Cada una con su gate y su PR; (b) depende de (a) y
(c) de (b).

- [ ] **T0 — Resumen en las acciones (rebanada a, backend_dev).** `resumenRecepcion(ordenId)` en
  `OrdenRepository` + `IOrdenRepository`; los tres servicios añaden `resumen` a `ok` y `ya_recibida`;
  tipos de resultado en `lib/types/`. Los consumidores de hoy lo ignoran (campo nuevo). *Hecho:*
  R614 en verde en `recepcion-resumen.test.ts` y contra Postgres real en
  `recepcion-resumen-sql-real.test.ts` (matado con una mutación); los tests existentes de los tres
  servicios y acciones en verde.

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
  `onCerrado`. «Reintentar» (44 px) en las filas «No se pudo recibir» (DC6). *Hecho:* R581-R584, R590-R591 y R593
  en verde en `tests/components/EscaneoContinuo.test.tsx`.
- [ ] **T10 — Página «Recibir paquetes» (depende de T0, T2-T4).** `components/shared/RecepcionContinuaPagina.tsx`
  y las rutas `app/(app)/ordenes/recibir/page.tsx` y `app/(app)/recepcion-satelite/recibir/page.tsx`
  con el gate de rol de `por-recibir/page.tsx` (design.md > Página de recepción en escritorio).
  «Terminar recepción ({n})» con la lista blanca de `desde`. *Hecho:* R610, R612 y R613 en verde en
  `RecepcionContinuaPagina.test.tsx` y `recibir-paquetes-page.test.tsx`.
- [ ] **T11 — Entrada (depende de T5, T10).** «Recibir paquetes» en `OrdenesListado`, `PorRecibirModule`
  y `RecepcionSateliteModule`: enlace con puntero fino, diálogo continuo con puntero táctil; «Recibir
  paquete» sigue de guía suelta. *Hecho:* R611 en verde en `EscanerRecepcionBodegaCentral.test.tsx` y
  `PorRecibirModule.test.tsx`.
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

- Total: **46 archivos** (29 de producción, 17 de tests); tope 40, 80% = 32. **No cabe en un PR:
  se parte en tres rebanadas (DC7)**, cada una por debajo del 80 %:

| Rebanada | R | Archivos (prod + tests) | Líneas prod / tests |
| --- | --- | --- | --- |
| (a) resumen en las acciones | R614 | **10** (8 + 2) | ~120 / ~300 |
| (b) recepciones de bodega y tienda: sesión, lista, cámara continua, página y diálogo | R580-R594, R610-R613 | **28** (16 + 12) | ~800 / ~1 300 |
| (c) recogidas del mensajero | R595-R599 | **9** (5 + 4, `sesion-escaneo.test.ts` se toca otra vez) | ~200 / ~350 |

- Las líneas de cada rebanada quedan bajo los topes (1000 de producción, 3000 de tests).

## Archivos esperados

Todas las rebanadas (a, b y c); cada PR toca solo las suyas.

- `lib/types/recepcion-bodega-central.ts`
- `lib/types/recepcion-origen.ts`
- `lib/types/recepcion-satelite.ts`
- `lib/services/RecepcionBodegaCentralService.ts`
- `lib/services/RecepcionOrigenService.ts`
- `lib/services/RecepcionSateliteService.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `app/(app)/ordenes/recibir/page.tsx`
- `app/(app)/recepcion-satelite/recibir/page.tsx`
- `components/shared/RecepcionContinuaPagina.tsx`
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
- `tests/components/RecepcionContinuaPagina.test.tsx`
- `tests/components/PorRecibirModule.test.tsx`
- `tests/unit/app/recibir-paquetes-page.test.tsx`
- `tests/unit/services/recepcion-resumen.test.ts`
- `tests/integration/db/recepcion-resumen-sql-real.test.ts`
