# SLT-135 «Planes: sin «De inmediato» al editar un plan» — T7.1 (E2E, frontend_dev)

## Archivos tocados

- `e2e/planes-costo-porcentual.spec.ts` (R23)
- `e2e/planes-borrador.spec.ts` (adaptación por T5)

## Qué cambió y por qué

### `e2e/planes-costo-porcentual.spec.ts` (R23)
- Test renombrado: «el superadmin programa por pantalla el plan en «Porcentual» con fecha de hoy (R23)».
- En «Cuándo rige» rellena «A partir de» (`getByLabel`, el campo de fecha único de `PasoCuandoRige`; el precio
  no cambia) con `fechaCalendarioCR(new Date())`, en vez de quedarse en «De inmediato».
- El botón final ahora es «Programar cambio» (`TEXTOS_PLAN_FORM.programar`), no «Guardar». El `aria-label` del
  form sigue siendo «Guardar» (`PlanForm.tsx`), así que el localizador del form no cambia.
- Espera el `status` «Cambio programado desde <hoy>.» (`guardadoProgramado` de `PlanDetalle` =
  `textoCambioProgramado(fecha)` + «.»; `vigenteDesde` vuelve como `AAAA-MM-DD`, `PlanesService.editar`).
- Ya no comprueba el plan en el acto: `expect(async () => { correrCron("procesar-jobs"); leer plan; expect… })
  .toPass({ timeout: 120_000 })` hasta costo fijo null, 2.00 % y mínimo 500.00. Sin `waitForTimeout`.
- Luego `page.reload()` y comprueba en el detalle «2.00 % del valor del paquete, mínimo 500.00».
- Cabecera del archivo actualizada (paso 2). Fuera `TEXTO.guardado` («Cambios guardados.»). El resto del
  recorrido (asignar, orden, wallet, «Mi plan») no cambia.

### `e2e/planes-borrador.spec.ts`
- Dependía del radio «A partir de» + campo «Fecha», que T5 quitó con «De inmediato» (R14: un solo campo de fecha
  con label «A partir de»). Ahora: `retomado.getByLabel("A partir de", { exact: true }).fill(f)`. El resto
  (tabla de fechas por empresa, «Programar cambio», «Cambio programado desde F») ya era compatible.

### Revisados y sin tocar
- `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts`: solo crean planes (form «Crear plan») y asignan
  por el modal de SLT-58; no editan un plan.
- `e2e/mi-plan-cambiar-plan.spec.ts`: flujo del maestro («Cambiar plan»), no el form de editar del superadmin.

## Mapa R → test
- R23 → `e2e/planes-costo-porcentual.spec.ts` › «el superadmin programa por pantalla el plan en «Porcentual» con
  fecha de hoy (R23)».

## Comandos

```
$ pnpm exec eslint e2e/planes-costo-porcentual.spec.ts e2e/planes-borrador.spec.ts
ESLint: No issues found

$ pnpm run typecheck
tests/integration/db/cobro-plataforma-plan.test.ts(178,28): error TS2339: Property 'editar' does not exist on type 'PlanesRepository'.
tests/integration/db/planes-edicion-en-uso.test.ts(218,46): error TS2339: Property 'editar' does not exist on type 'PlanesRepository'.
tests/integration/db/planes-historial.test.ts(241,35): error TS2339: Property 'editar' does not exist on type 'PlanesRepository'.
```
Ningún error en `e2e/`. Los tres son de `tests/integration/` (T4, fuera de este alcance).

Playwright no se corrió (lo corre el leader: necesita build y base).

## Veredicto
E2E de R23 adaptado y `planes-borrador` alineado con el campo único de T5; lint limpio y sin errores de tipos en e2e/, Playwright pendiente.
