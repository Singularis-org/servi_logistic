# SLT-235 — Moneda e impuesto del país en las pantallas de la empresa · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio
> **y** `pnpm run typecheck` está en verde. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque.

## Bloque 1 — Servidor (R2–R10)

- [x] **T1.1** `PaisRepository.deLaEmpresa` en una sola consulta (design §3).
  - *Hecho:* `tests/integration/db/pais-repositorio.test.ts` con el caso de R6 en verde: una sentencia
    con el espía, el mismo país para CR y `XA`, y `null` para la empresa de otro contexto. Los casos de
    `deLaEmpresa` de antes siguen verdes sin cambiar.
- [x] **T1.2** [P] `lib/services/pais-para-pantallas.ts`: `MemoPaisEmpresa`, `memoPaisEmpresa`,
  `paraPantallasDe`, `PARA_PANTALLAS_DE_PLATAFORMA` y `paisParaPantallasDelActor` (design §4).
  - *Hecho:* `tests/unit/services/pais-para-pantallas.test.ts` en verde con reloj falso. Cubre:
    - caducidad a 10 min (R7);
    - dos empresas y que no se memoriza un fallo ni un `null` (R8);
    - barrido a 1 000 entradas (R9);
    - las caídas con su aviso, una vez por lectura (R3, R4, R10);
    - lectura que falla (R5);
    - sin empresa, sin llamada (R2).
- [x] **T1.3** `IPaisService.paraPantallas` y `PaisParaPantallas`; `PaisService.paraPantallas` con el
  memo inyectable; se borra `etiquetasDeEmpresa` (design §5). Depende de T1.2.
  - Se actualizan sus dobles: `tests/unit/actions/geografia-plataforma-action.test.ts`.
  - Los casos de `etiquetasDeEmpresa` pasan a `paraPantallas` en `tests/unit/services/pais-service.test.ts`
    (con «dos llamadas = un `deLaEmpresa`», R7) y en `pais-repositorio.test.ts` (CR y `XA` con su
    moneda y su impuesto).
  - *Hecho:* los tres en verde.

## Bloque 2 — Layout, proveedor y hooks (R1, R2, R15, R17) (depende del bloque 1)

- [x] **T2.1** [P] `providers/MonedaDelPaisProvider.tsx` y `hooks/use-moneda-del-pais.ts` (design §6).
  - *Hecho:* en `tests/components/moneda-del-pais-pantallas.test.tsx`, sin proveedor dan
    `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO` (R15), y con el proveedor de prueba, `MONEDA_DE_PRUEBA` e
    «IGV» (R17).
- [x] **T2.2** `app/(app)/layout.tsx`: `paisParaPantallasDelActor` en el `Promise.all` y el proveedor
  dentro del de etiquetas. Se borra `etiquetasDelActor`.
  - *Hecho:* `tests/components/AppLayout.test.tsx` en verde. Su bloque SL-20/T5.1 pasa a doblar
    `paraPantallas` y cubre R1, R2 y R5: con empresa, una llamada y los dos proveedores con lo suyo;
    con superadmin, ninguna llamada; si falla, la página se pinta y queda en el log.

## Bloque 3 — Pantallas (R11–R14, R16) (depende del bloque 2)

Cada task añade sus casos a `tests/components/moneda-del-pais-pantallas.test.tsx`. Cada caso se
prueba con `MONEDA_DE_PRUEBA` y con `MONEDA_CR`; con `MONEDA_CR` el texto debe ser el mismo que sin
proveedor (R16). Los tests existentes de esas pantallas siguen en verde sin cambiar ningún valor
esperado.

- [x] **T3.1** [P] Componentes compartidos: `PriceLabel` (`"use client"`), `KpiValorAnimado` (R12) y
  `DesglosePagoField` con `mensajeDeCuadre(..., moneda?)`.
  - *Hecho:* sus casos en verde, y además la guardia 359 y `DineroIdentidadesEnPantalla.test.tsx` sin
    cambios.
- [x] **T3.2** [P] `mis-asignaciones`: `pos-format.formatMonto(monto, moneda)` y sus llamantes
  (`PosAmountRow`, `PosOrderCardDetalle`, `PosOrderCardMosaico`, `ChatConversacion`), además de
  `AsignacionDetalle`, `KpisMensajero` y `GestionarOrdenPanel`.
  - *Hecho:* sus casos en verde (R11).
- [x] **T3.3** [P] `recepcion-satelite`: `RecepcionDetalle` y `SateliteOrderCard`.
  - *Hecho:* sus casos en verde (R11).
- [x] **T3.4** [P] Vistas previas de plantilla: `EnviarPlantillaWhatsappButton`, `ChatConversacion`
  (la vista previa), y `sinpe-preview-segmentos` con `SinpeMensajePreview`.
  - *Hecho:* los casos de R13 en verde. El texto de cada superficie es igual a
    `renderPlantilla(cuerpo, resolverValoresPlantilla(vars, datos, undefined, MONEDA_DE_PRUEBA))`.
- [x] **T3.5** [P] `app/paquete/[numGuia]/page.tsx` con `paisParaPantallasDelActor`.
  - *Hecho:* los casos de R14 en verde, y `tests/components/EtiquetaFechaEnPantalla.test.tsx` sigue
    verde sin tocarlo (su actor no tiene empresa: no se consulta).

## Bloque 4 — Guardias, docs y cierre (depende del bloque 3)

- [x] **T4.1** Censo de R18: un `describe` en `moneda-del-pais-pantallas.test.tsx` con la lista de los
  archivos de design §7 y su contraprueba.
  - *Hecho:* en verde, y rojo si en uno de ellos se reescribe un `money(` o un `formatMonto(` de
    `@/lib/config/moneda`.
- [ ] **T4.2** (BLOQUEADA 2026-11-20: SL-21 T5.1 aún no está en esta rama; la guardia no tiene las fichas SLT-235/SLT-237) Lista de excepciones de `pais-sin-literales` (design §8). Depende de que SL-21 T5.1 esté
  en esta rama.
  - Se quita la entrada de `/paquete` y se baja el tope.
  - `FichaQueLoRetira` gana `SLT-240` a `SLT-246`, y cada entrada `SLT-235` pasa a su rebanada. Los dos
    ejemplos del catálogo van donde diga la respuesta a P2.
  - *Hecho:* `pnpm run test:guardias` en verde (R19).
- [ ] **T4.3** `docs/architecture.md`, bajo «País por empresa (SL-20)»: un punto «Moneda e impuesto en
  pantallas (SLT-235)». Cuenta:
  - la lectura única;
  - el memo de 10 min compartido con las etiquetas;
  - el proveedor y los dos hooks con su caída;
  - la regla «cada pantalla pasa la moneda a `formatearMontoEn`»;
  - el censo de R18 que crece por rebanada.
  - *Hecho:* el reviewer lo encuentra y cuadra con el código.
- [ ] **T4.4** Cierre.
  - `./init.sh` en verde.
  - E2E en local del grupo `dinero` y de los que tocan `mis-asignaciones`, `recepcion-satelite` y
    `/paquete` (`docs/perfil-agentes.md > E2E en local antes del PR`), sobre una base desechable.
  - El mapa R → test va en `progress/impl_SLT-235.md`.
  - El reviewer comprueba R20 en el diff.
  - *Hecho:* todo verde y el mapa con los 20 requisitos.

## Archivos esperados

Producción:
- `lib/repositories/PaisRepository.ts`
- `lib/services/pais-para-pantallas.ts`
- `lib/services/PaisService.ts`
- `lib/interfaces/services/IPaisService.ts`
- `app/(app)/layout.tsx`
- `providers/MonedaDelPaisProvider.tsx`
- `hooks/use-moneda-del-pais.ts`
- `components/shared/PriceLabel.tsx`
- `components/shared/KpiValorAnimado.tsx`
- `components/shared/DesglosePagoField.tsx`
- `components/shared/EnviarPlantillaWhatsappButton.tsx`
- `components/shared/sinpe-preview-segmentos.ts`
- `components/shared/SinpeMensajePreview.tsx`
- `app/(app)/mis-asignaciones/_components/AsignacionDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts`
- `app/(app)/mis-asignaciones/_components/pos-card/PosAmountRow.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`
- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionDetalle.tsx`
- `app/(app)/recepcion-satelite/_components/SateliteOrderCard.tsx`
- `app/paquete/[numGuia]/page.tsx`
- `docs/architecture.md`

Tests:
- `tests/unit/services/pais-para-pantallas.test.ts`
- `tests/unit/services/pais-service.test.ts`
- `tests/integration/db/pais-repositorio.test.ts`
- `tests/unit/actions/geografia-plataforma-action.test.ts`
- `tests/components/AppLayout.test.tsx`
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`

Grep del 2026-11-20. Si el typecheck o un test señalan otro archivo (un doble de `IPaisService`, un
componente montado desde el servidor que pide `"use client"`), se añade aquí antes del PR.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 25 | unas 450 |
| Tests | 7 | unas 750 |
| **Total** | **32** | |

Justo en el 80% de `gate.tamano_pr` (40 archivos): no queda margen. Un archivo de más que aparezca al
implementar pasa el aviso del 80%, y entonces el leader decide. Las líneas quedan muy por debajo de sus
dos topes (1 000 de producción y 3 000 de tests).
