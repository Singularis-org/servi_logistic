# 477 — Tareas

> **Sin migración.** Toca dinero (snapshots y totales de cierre, `cierre_detail`): el gate es
> `./init.sh --rapido`, que se amplía solo con `tests/integration/db`. Nadie corre el completo.
> Zona `fullstack` → se secuencia **backend → frontend** (`backend_dev` primero con T1-T4,
> `frontend_dev` después con T5). `[P]` = paralelizable con las tareas de su misma tanda.
> Cada test de integración afirma primero que su siembra existe, y cada regla de un `WHERE` lleva
> su contraprueba de mutación anotada en `progress/impl_477.md`.

---

## T0 — Puertas antes de escribir código

- [x] **T0.1 — Respuestas a las Preguntas abiertas 1-6 de `requirements.md`.**
      **Hecho cuando:** cada una tiene «por defecto» o una alternativa elegida, escrita en
      `progress/impl_477.md`. Una alternativa distinta del defecto en las preguntas 1, 3 o 6 obliga
      a volver al spec antes de T1.
- [x] **T0.2 [P] — Medir en solo lectura (MCP `supabase`, producción; confirmar con
      `get_project_url`).** Cuántos cierres `rechazado` hay hoy y cuántas gestiones LEGADAS (sin
      evento `gestion_registrada`) viven en ellos.
      **Hecho cuando:** los dos números están en `progress/impl_477.md`. Si hay legadas en
      rechazados, se avisa al humano (R10 las deja sin corrección).

---

## T1 — Predicado único «orden en corrección» (backend)

- [x] **T1.1 — Módulo `lib/repositories/correccion-cierre.ts`** con el fragmento SQL de
      `design.md` D2 (filtros opcionales por órdenes y por cierre) y un comentario que diga por qué
      es SQL y quién lo consume.
      **Hecho cuando:** `pnpm typecheck` pasa y no hay una segunda copia del predicado en el repo.
- [x] **T1.2 — `OrdenRepository.findOrdenesEnCorreccion(mensajeroId, ordenIds)`** + firma en
      `IOrdenRepository`. Lista vacía ⇒ cero consultas.
      **Hecho cuando:** existe y lo usa T1.3. *Depende de:* T1.1.
- [x] **T1.3 — Test contra Postgres** `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts`:
      entra la orden con fila de `cierre_detail` en un `rechazado` propio y sin gestión vigente en
      él; NO entran la de un `solicitado`/`vencido`/`aprobado`, la de otro mensajero, ni la que
      conserva gestión vigente en el cierre. Contraprueba: quitar cada condición del `WHERE` pone
      rojo un caso.
      **Hecho cuando:** verde y con las mutaciones anotadas. *Depende de:* T1.2.

## T2 — Deshacer en cierre rechazado (backend)

- [x] **T2.1 — `findGestionParaDeshacer` gana `cierreEstado` y `cierreMensajeroId`** (+ tipo
      `GestionDeshacerRow`). **Hecho cuando:** typecheck verde y los tests existentes del deshacer
      siguen verdes.
- [x] **T2.2 — `CierreDiaRepository.anularGestionDeCierreRechazado`** según `design.md` §5.1 y §4:
      candado de `cierre_dia` → re-lectura `rechazado` + propietario → candado de `orden` →
      `updateMany` guardado (D1) → evento `gestion_anulada` + webhook → recálculo de los seis totales
      (D3, `computeTotales` + `sumarSnapshotsCongelados`).
      **Hecho cuando:** devuelve `false` sin efectos en cada carrera. *Depende de:* T2.1.
- [x] **T2.3 — Test contra Postgres** `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts`
      (R1, R2, R3, R6, R9, R11): tras deshacer, la gestión queda anulada, sin cierre y con snapshots
      NULL; hay un evento `gestion_anulada` y un job de webhook; los seis totales del cierre son los
      de las gestiones restantes al céntimo; con el cierre en `solicitado` (o la orden fuera de
      `en_reparto`) no se escribe nada. Contraprueba de cada condición del `WHERE` y del recálculo.
      **Hecho cuando:** verde con mutaciones anotadas. *Depende de:* T2.2.
- [x] **T2.4 — `CierreDiaService.deshacerGestion`** con el orden de guardas de `design.md` §5.2
      (exención D4 por objeto; caso (b) por `findOrdenesEnCorreccion`; R10 para legadas). El `Pick`
      de `OrdenRepo` se amplía con `findOrdenesEnCorreccion`.
      **Hecho cuando:** typecheck verde. *Depende de:* T1.2, T2.2.
- [x] **T2.5 — Test de servicio** `tests/unit/services/cierre-dia-477-deshacer.test.ts` (R4-R10):
      bloqueado + gestión no corregible ⇒ el MISMO `conflict` de bloqueo para inexistente, ajena y
      de cierre `solicitado` (afirmar igualdad de respuesta); caso (b) deshace por la rama 454;
      tienda, no-la-última, orden movida, legada ⇒ sus motivos, sin llamar a ninguna escritura.
      **Hecho cuando:** verde. *Depende de:* T2.4.

## T3 — Volver a gestionar con el bloqueo puesto (backend) — [P] con T2

- [x] **T3.1 — `MisAsignacionesService.escogerParaGestion` y `gestionar`:** con bloqueo, seguir
      solo si `findOrdenesEnCorreccion(actor, [ordenId])` la contiene; el resto de guardas intacto.
      **Hecho cuando:** typecheck verde. *Depende de:* T1.2.
- [x] **T3.2 — `listarMisAsignaciones` añade `enCorreccion`** al DTO (una llamada en lote, solo si
      el actor está bloqueado). **Hecho cuando:** `MiAsignacionDTO` lo declara obligatorio y
      `toDTO` emite `false` por defecto. *Depende de:* T1.2.
- [x] **T3.3 — Test de servicio** `tests/unit/services/mis-asignaciones-477-correccion.test.ts`
      (R12, R13): bloqueado escoge/gestiona la orden en corrección; NO la que no lo está (motivo de
      bloqueo de hoy, sin subir evidencias); la orden en corrección sigue sujeta al tope de
      intentos y a la reserva de día.
      **Hecho cuando:** verde. *Depende de:* T3.1, T3.2.
- [x] **T3.4 — Test contra Postgres** `tests/integration/db/477-regestionar-sin-cierre-sql-real.test.ts`
      (R14): la gestión rehecha nace con `cierre_id` NULL, evento `gestion_registrada` y la orden
      sigue `en_reparto`. **Hecho cuando:** verde. *Depende de:* T3.1.
- [x] **T3.5 — Composition root.** Comprobar que el `OrdenRepository` que reciben
      `CierreDiaService` y `MisAsignacionesService` en `lib/actions/` es el real con el método nuevo
      (leer el cableado, no solo el import). **Hecho cuando:** anotado en `progress/impl_477.md`
      con archivo:línea.

## T4 — Re-solicitud y aprobación (backend)

- [x] **T4.1 — `findCierreResolicitableMasViejo` devuelve `destinoZonaId`.**
      **Hecho cuando:** typecheck verde y los tests de la 271 siguen verdes.
- [x] **T4.2 — `CierreDiaRepository.resolicitarCierreRechazado`** con los seis pasos de
      `design.md` D5, en una `$transaction`, reutilizando `gestionesDelCierreWhere` SIN modificarlo.
      **Hecho cuando:** `false` sin efectos si el cierre ya no es `rechazado`. *Depende de:* T1.1.
- [x] **T4.3 — `CierreDiaService.solicitarCierre`, rama 2:** `rechazado` ⇒ resolver tarifa
      (zona destino + vehículo) y `resolicitarCierreRechazado`; `vencido` ⇒ `transicionarASolicitado`
      como hoy. **Hecho cuando:** typecheck verde. *Depende de:* T4.1, T4.2.
- [x] **T4.4 — Test contra Postgres** `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts`
      (R15-R20, R22): vincula solo las gestiones de órdenes en corrección de ESE cierre (sembrar una
      de otro rechazado, un rechazo de tienda y una sintética del tope: ninguna entra); congela
      pago/ingreso; borra solo las filas de `cierre_detail` sin gestión; los seis totales cuadran;
      sin correcciones, todo idéntico byte a byte a antes; carrera ⇒ sin efectos.
      **Hecho cuando:** verde con mutaciones anotadas. *Depende de:* T4.2.
- [x] **T4.5 — Test de servicio** `tests/unit/services/cierre-dia-477-resolicitud.test.ts`
      (R21, R22): un `vencido` sigue por `transicionarASolicitado` y nunca llama a la rama nueva;
      `false` ⇒ `MSG_DUPLICADO`; el aviso a la bodega recibe el id del cierre tocado.
      **Hecho cuando:** verde. *Depende de:* T4.3.
- [x] **T4.6 — Test de extremo a extremo contra Postgres**
      `tests/integration/db/477-aprobacion-tras-correccion-sql-real.test.ts` (R23, R24): gestión
      `entregado` en cierre → rechazo → deshacer → rehacer como `reprogramado` → re-solicitar →
      aprobar con el servicio real. Afirmar: ningún movimiento de `wallet_movimiento`,
      `wallet_tienda_movimiento` ni `pago_mensajero_movimiento` sale de la anulada (los importes son
      los del reprogramado); la orden transiciona a `reprogramada`; `contarIntentos` = intentos
      previos + 1; la anulada no cuenta.
      **Hecho cuando:** verde, y una mutación que conserve `cierre_id` en la anulada (A1) lo pone
      rojo. *Depende de:* T2.2, T3.1, T4.3.
- [x] **T4.7 — `listarCierreDia` devuelve `correcciones`** (`design.md` §5.2) con
      `findCorreccionesPendientes` + `findCierrePropioConGestiones`.
      **Hecho cuando:** un test de servicio cubre «sin rechazados ⇒ `[]` sin consultas extra» y
      «con rechazado ⇒ gestiones + órdenes en corrección con `regestionada`». *Depende de:* T1.1.
- [x] **T4.8 — Gate backend:** `./init.sh --rapido` (se amplía con `tests/integration/db`). Un
      rojo se repite aislado. **Hecho cuando:** verde, sin `skipped` inesperados en
      `integration/db`, con `INIT_EXIT` escrito en el log.

## T5 — Pantallas (frontend) — después de T4

- [x] **T5.1 — Panel «Corregir gestiones»** en la sección «Cierre rechazado» de
      `CierreDiaModule.tsx`: motivo del rechazo, gestiones vigentes con «Deshacer» (mismo modal y
      action; deshabilitado con su porqué si `desdeAyudaTienda`) y órdenes en corrección con su
      estado y enlace a Entregas (R25, R26).
      **Hecho cuando:** `pnpm typecheck` y lint verdes.
- [x] **T5.2 — Copia de la confirmación de re-solicitud** (R28): fuera «No se recalculan los
      montos»; con órdenes sin rehacer, cuántas saldrán del cierre. Sin la sigla «SLA».
      **Hecho cuando:** los textos viven en constantes y los usa el test de T5.4. [P] con T5.1.
- [x] **T5.3 — Entregas:** la tarjeta se deshabilita por bloqueo solo si `!enCorreccion` (R27),
      en `RepartoModule.tsx` y en el componente de tarjeta que reciba `bloqueado`. [P] con T5.1.
      **Hecho cuando:** typecheck verde.
- [x] **T5.4 — Tests de componente** `tests/components/CierreDiaModule477Correccion.test.tsx`
      (R25, R26, R28) y `tests/components/RepartoModule477Correccion.test.tsx` (R27).
      **Hecho cuando:** verdes. *Depende de:* T5.1-T5.3.
- [x] **T5.5 — Verlo en la app** (memoria «ver la app encuentra lo que la suite no»): con datos
      locales sembrados, recorrer rechazo → deshacer → Entregas → gestionar → re-enviar, y anotar en
      `progress/impl_477.md` qué se vio (capturas o descripción) y los totales antes/después.
      **Hecho cuando:** anotado. *Depende de:* T5.4.
- [x] **T5.6 — Gate final:** `./init.sh --rapido`. **Hecho cuando:** verde con `INIT_EXIT` en el
      log, y `progress/impl_477.md` mapea R1-R28 a su test.
