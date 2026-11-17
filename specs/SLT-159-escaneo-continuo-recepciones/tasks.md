# SLT-159 «Escaneo continuo en recepciones y recogidas» — tasks

**Rebanada (b) de DC7** (acotado el 2026-11-16). Requisito previo cumplido en `dev`: SLT-158 «Entrada
de escaneo para pistola», SLT-167 «Recepción: destinatario y tienda en la respuesta» (la antigua T0,
**fuera**: R614 hecho en #186) y SLT-160 «Buscar escaneando en los listados». Las recogidas del
mensajero (antigua T7b, R595-R599) son de SLT-168 «Escaneo continuo en las recogidas del mensajero».
Todo es `frontend_dev`; ningún archivo de servidor.

**Corte propuesto por tamaño (pendiente de decisión, `requirements.md > Preguntas abiertas` 5):**
(b1) = T1-T7 y T9 de b1; (b2) = T10, T11, T8 y T9 de b2. Si se decide un solo PR, el orden es el
mismo.

## (b1) Escaneo continuo en el diálogo

- [x] **T1 — Sesión pura.** `lib/utils/sesion-escaneo.ts`: tipos de fila (con `hora` y `resumen?` de
  `ResumenRecepcion`) y desenlace, reductor, `contadores`, `horaLectura` (`HH:mm:ss`) y
  `lineaDeEstado`. *Hecho:* R586 en verde en `tests/unit/utils/sesion-escaneo.test.ts` con literales a
  mano (incluido «—» sin `resumen`).
- [x] **T2 — Llegada y sesión (depende de T1).** `hooks/useEntradaEscaneo.ts`: opción `alLlegar`
  (opcional; sin ella, nada cambia). `hooks/useSesionEscaneo.ts`: `registrar` / `procesar` /
  `reintentar`, cola FIFO de filas pendientes, cadena de promesas única, `alCerrarConRecepcion` al
  desmontar. *Hecho:* R585 y R587 en verde en `tests/unit/hooks/useSesionEscaneo.test.ts`; los casos
  de SLT-158 en `tests/components/EscanerGuiaCard.test.tsx` siguen en verde sin tocarlos.
- [ ] **T3 [P] — Cámara continua.** `QrScanner` props `continuo` (no cierra; mismo texto antes de
  `ESPERA_MISMO_CODIGO_MS = 3000` se ignora) y `alCerrar`. Modo suelto intacto. *Hecho:* R588-R589 en
  verde en `tests/components/QrScanner.test.tsx`; sus casos existentes sin tocar y en verde.
- [ ] **T4 — Lista y tarjeta (depende de T1-T3).** `components/shared/EscaneoContinuo.tsx` (variantes
  `lista` y `tabla`, `role="log"`, «Reintentar» 44 px). `EscanerGuiaCard`: `continuo`, `alLlegar`,
  `children`. *Hecho:* R581-R584, R590, R591 y R593 en verde en
  `tests/components/EscaneoContinuo.test.tsx` (tarjeta continua + sesión + acción doble).
- [ ] **T5 — Recepciones en diálogo (depende de T4).** C1, C2 y C3/C4: `modo`, `desenlace(result)`
  puro y exportado (motivos = textos de hoy), sin toast en continuo, `onRecibida` una vez al
  desmontar. `components/shared/RecibirPaquetesEntrada.tsx` (en b1: botón que abre el diálogo con
  cualquier puntero; en b2 gana el enlace). `OrdenesListado` y `EscanerRecepcion` la montan en
  `acciones`. *Hecho:* R580, R583, R592 y R594 (guía suelta) en verde en los tests de las tres
  superficies; R611 (diálogo) en `RecibirPaquetesEntrada.test.tsx` y `OrdenesPage.test.tsx`.
- [ ] **T6 [P] — C5 (depende de T3).** `cierre-confirmacion-fisica.tsx` pasa `continuo` a su tarjeta.
  *Hecho:* R588 (C5) en verde en `CierresAdminConfirmacionFisica.test.tsx`; sus casos en verde.
- [ ] **T7 [P] — Verificar guía sigue suelta (depende de T3).** Sin cambio de producción; caso nuevo
  en `VerificarGuiaGate.test.tsx`. *Hecho:* R594 en verde.

## (b2) Página «Recibir paquetes» en escritorio

- [ ] **T10 — Página (depende de T4, T5).** `components/shared/RecepcionContinuaPagina.tsx` (dentro de
  `AppPage`; campo propio, línea de estado, cámara compacta con `encendidaAlMontar` + `alCerrar`,
  contadores, `tabla`, «Terminar recepción ({n})»). `modo="pagina"` en C1, C2 y C3. Rutas
  `app/(app)/ordenes/recibir/page.tsx` y `app/(app)/recepcion-satelite/recibir/page.tsx` con el gate
  de `por-recibir/page.tsx` y la lista blanca de `desde`. *Hecho:* R610, R612, R613 y R615 en verde en
  `RecepcionContinuaPagina.test.tsx` y `recibir-paquetes-page.test.tsx`.
- [ ] **T11 — Enlace con puntero fino (depende de T10).** `RecibirPaquetesEntrada`: enlace con puntero
  fino, diálogo con táctil; `href` de la satélite con `desde` por `usePathname()`. *Hecho:* R611 en
  verde en `RecibirPaquetesEntrada.test.tsx`, `OrdenesPage.test.tsx` y `EscanerRecepcion.test.tsx`.
- [ ] **T8 — E2E y dispositivo (depende de T10-T11).** `e2e/recibir-paquetes.spec.ts`: maestro, tres
  guías sembradas con Enter seguidas en `/ordenes/recibir` → tres «Recibida» con destinatario y tienda
  sembrados; «Terminar recepción (3)» vuelve a `/ordenes`. En Preview: recibir 10 etiquetas con la
  pistola sin tocar la pantalla (una repetida, una ajena) en la página; en el teléfono de tienda,
  cinco con la cámara abierta en el diálogo. Comparar con `Main.dc.html` (orden, textos, contadores).
  Nota en `progress/features/SLT-159.md`. *Hecho:* E2E en verde en local; nota escrita con las
  diferencias con el canvas (solo las anotadas en `## Preguntas abiertas`).
- [ ] **T9 — Cierre (cada PR).** `./init.sh` en verde; E2E locales de las pantallas tocadas
  (`e2e/recepcion-satelite.spec.ts`, `e2e/cierres-admin.spec.ts`, los de `/ordenes` que abren «Recibir
  paquete», y `e2e/recibir-paquetes.spec.ts` en b2; `docs/perfil-agentes.md > E2E en local antes del
  PR`); mapa R → test en `progress/impl_SLT-159.md`.

## Tamaño

Tope (`arnes.config.json` sin `gate.tamano_pr` → valores por defecto): 40 archivos (80 % = 32), 1 000
líneas de producción y 3 000 de tests, añadidas + borradas.

| Pieza | Archivos | Producción (estimada) | Tests (estimada) |
| --- | --- | --- | --- |
| (b) entera | **29** (15 + 14) | **~1 010** | ~1 500 |
| (b1) diálogo | 23 (12 + 11) | ~690 | ~1 000 |
| (b2) página | 13 (7 + 6; 4 de producción y 3 de tests repetidos de b1) | ~380 | ~550 |

Desglose de producción de (b): `sesion-escaneo.ts` 110, `useSesionEscaneo.ts` 110,
`useEntradaEscaneo.ts` 15, `EscaneoContinuo.tsx` 130, `RecepcionContinuaPagina.tsx` 190,
`RecibirPaquetesEntrada.tsx` 55, `EscanerGuiaCard.tsx` 35, `QrScanner.tsx` 45, dos `page.tsx` 80, tres
superficies 220 (partir `notificar` borra y añade), `OrdenesListado.tsx` 15, C5 5.

**(b) entera cabe en archivos pero no en líneas de producción** (estimación ~101 % del tope, sin
contar los comentarios largos que se usan en este repo). Propuesta: corte en (b1) y (b2), ver
`requirements.md > Preguntas abiertas` 5.

## Archivos esperados

Rebanada (b) entera; (b1) toca todo salvo `RecepcionContinuaPagina.tsx`, las dos `page.tsx`, sus dos
tests y el E2E.

- `lib/utils/sesion-escaneo.ts`
- `hooks/useSesionEscaneo.ts`
- `hooks/useEntradaEscaneo.ts`
- `components/shared/EscaneoContinuo.tsx`
- `components/shared/RecepcionContinuaPagina.tsx`
- `components/shared/RecibirPaquetesEntrada.tsx`
- `components/shared/EscanerGuiaCard.tsx`
- `components/shared/QrScanner.tsx`
- `app/(app)/ordenes/recibir/page.tsx`
- `app/(app)/recepcion-satelite/recibir/page.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `tests/unit/utils/sesion-escaneo.test.ts`
- `tests/unit/hooks/useSesionEscaneo.test.ts`
- `tests/components/EscaneoContinuo.test.tsx`
- `tests/components/QrScanner.test.tsx`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/VerificarGuiaGate.test.tsx`
- `tests/components/RecibirPaquetesEntrada.test.tsx`
- `tests/components/OrdenesPage.test.tsx`
- `tests/components/RecepcionContinuaPagina.test.tsx`
- `tests/unit/app/recibir-paquetes-page.test.tsx`
- `e2e/recibir-paquetes.spec.ts`
