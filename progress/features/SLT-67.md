# SLT-67 «Montos sin «.00» cuando el número es cerrado (campo compartido)»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-67 | montos-sin-decimales-cerrados | frontend | low | feature/SLT-67-montos-sin-decimales-cerrados | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.0 (2026-10-30): tomada, worktree creado, sin SDD. Implementación delegada.

## Evaluación
- zone frontend: solo cómo se muestra el monto en el formulario; el valor guardado no cambia.
- complexity low: una función de formato y un campo compartido, primer uso en crear/editar orden.

## Decisiones
- 2026-10-30: sin SDD (decisión del humano).
- 2026-10-30: entero sin decimales (500 → 500); con decimales, siempre dos (500,5 → 500,50).
- 2026-10-30: se hace reutilizable: util de formato compartida + campo de monto compartido (shared) para futuros formularios.
- 2026-10-30: primer uso = todos los campos de monto de `PlanForm.tsx` (crear y editar plan). La util
  vive en `lib/config/moneda.ts` junto a `formatMontoString`/`montoExacto`. Ningún otro formulario se
  migra; los diálogos con monto quedan como candidatos en `progress/impl_SLT-67.md`. No se adelanta
  nada de SLT-66 (también toca `PlanForm`).
- 2026-10-30: la util solo opera sobre strings (sin float) y NO redondea: con más de 2 decimales
  significativos los conserva; solo quita ceros sobrantes, con mínimo 2 decimales si no es entero.

## Preguntas abiertas
- 2026-10-30 (implementer, BLOQUEO antes de tocar código): **no existe un formulario de crear/editar
  orden con campos de monto** en `dev` (3c4c22c) ni en ninguna rama remota.
  - Las órdenes se crean por carga masiva (`components/shared/BulkUpload.tsx` +
    `app/(app)/ordenes/_components/OrdenesCarga*.tsx`, archivo CSV/XLSX: el monto viene del archivo,
    no hay input) o por API key.
  - La única edición de orden es `CorregirDatosClienteModal.tsx`, que deja fuera `montoCobrar`
    a propósito (líneas 46 y 141-145: «El monto a cobrar ... no se cambian desde aquí»).
  - No hay ningún `type="number"` en `app/` ni `components/`; los inputs de monto con `inputMode`
    están en otros flujos: `components/shared/conciliacion/MarcarRecibidoDialog.tsx` (el E2E
    `e2e/cierre-bodega-satelite.spec.ts:116` acepta `9000` o `9000.00` en «Monto recibido»),
    `DesglosePagoField.tsx`, `liquidacion/RegistrarPagoDialog.tsx`, `wallet/RegistrarMovimientoDialog.tsx`,
    `wallet/GastoFijoPlantillaDialog.tsx`, `cierres-admin/AjustarPagoMensajeroDialog.tsx`,
    `configuracion/tarifas/TarifaCampos.tsx`, `plataforma/planes/PlanForm.tsx`,
    `plataforma/empresas/CobroPorOrden.tsx`, `ranking/PremioInputRow.tsx`.
  - Pregunta al humano: ¿en qué pantalla vio «500.00»? (¿otra app, p. ej. Ordenex, o uno de los
    diálogos de arriba?) ¿Cuál es el «primer uso» de la util + campo compartido? No se implementa
    nada hasta saberlo (regla 6, «No inventes»).
  - **RESPONDIDA 2026-10-30 (humano, vía leader):** era el **formulario del plan**
    (`/plataforma/planes`, crear y editar: `PlanForm.tsx`), no órdenes. Tarjeta corregida en Trello.

## Tandas

## Modelos (overrides)

## Cierre
