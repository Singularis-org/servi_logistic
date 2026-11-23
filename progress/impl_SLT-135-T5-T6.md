# SLT-135 «Planes: sin «De inmediato» al editar un plan» — T5.1–T5.3, T6.1, T6.2 (frontend_dev)

Fecha: 2026-11-18. Sin commit (lo hace el leader).

## Archivos modificados

Producción (`app/(app)/plataforma/`):
- `planes/_components/plan-form/estado.ts`: fuera `Accion` y `Formulario.aplicar`. `inicial`: al editar `vigenteDesde = precioDesde` (mañana); al crear, "". `camposEnOrden`: al editar, `vigenteDesde` siempre.
- `planes/_components/plan-form/borrador.ts`: `valoresDelPaso("vigencia")` = la fecha del campo visible; `conVigencia` sin rama `null`.
- `planes/_components/plan-form/revision.ts`: `filaDeCuandoRige({ cambiaPrecio, precioDesde, vigenteDesde })` → «Rige desde» o «A partir de».
- `planes/_components/plan-form/textos.ts`: fuera `aplicar`, `inmediato` y `fecha`; `programado` («A partir de») es la etiqueta del campo.
- `planes/_components/plan-form/PasoCuandoRige.tsx`: un solo `FormField`; sin `fieldset` ni `RadioGroup`.
- `planes/_components/plan-form/FechasPorEmpresa.tsx`: `vigenteDesde: string`; con `ok`, la tabla o el texto «sin empresas» salen siempre.
- `planes/_components/PlanForm.tsx`: `fechaDelCambio` en `erroresDelFormulario` y en `previsualizarCambio`; `textoEnviar` = «Programar cambio» al editar; `RECHAZOS.cambio_a_medias` pasa al texto genérico; fuera el import de `MENSAJE_EDITAR_CAMBIO_A_MEDIAS`. El `aria-label` del `form` no cambia.
- `planes/[planId]/_components/PlanDetalle.tsx`: `alEditar` usa `guardadoProgramado(F)` si `r.cambio`, y si no `sinCambios`; fuera `guardadoInmediato`.
- `empresas/[organizacionId]/_components/PlanEmpresa.tsx`: `cambio_a_medias` pasa al genérico; fuera el import retirado.

Tests:
- `tests/unit/planes/plan-form-borrador.test.ts`: R15 (sustituye «R2: los tres casos de vigencia»).
- `tests/unit/planes/plan-form-revision.test.ts`: R18 nuevo; las llamadas a `filaDeCuandoRige` van sin `aplicar`, y «R23: sin cambios» espera «A partir de».
- `tests/components/PlanForm.test.tsx`:
  - nuevos: R14, R15 («abre con mañana»), R16 ×2 y R17;
  - fuera: «R15: «De inmediato» envía vigenteDesde null» y «…vuelve a «Guardar» con «De inmediato»»;
  - los que elegían el radio «A partir de» y el campo «Fecha» usan ahora el campo «A partir de».
- `tests/components/PlanFormRevisar.test.tsx`: R18 nuevo; R23 espera «A partir de: mañana» y el subtítulo con «Programar cambio».
- `tests/components/PlanFormFechasPorEmpresa.test.tsx`: R19 sustituye «R17: De inmediato no muestra la tabla»; `programarEl` sin el radio.
- `tests/components/PlanFormBorrador.test.tsx`: «R9: una fecha pasada…» pulsa «Programar cambio» (con precio).
- `tests/components/PlanDetalle.test.tsx`:
  - R20 nuevo;
  - el `editarPlan` por defecto responde con la fecha (`PROGRAMADO`);
  - «R15 avisos» y «R13» esperan «Cambio programado desde …».
- **Fuera de la lista del spec:** `tests/components/PlanFormDescuentos.test.tsx` cayó porque buscaba el radiogroup «Aplicar». Ahora busca el campo «A partir de»: 3 aserciones y 2 nombres de `it`. Hay que añadirlo a `tasks.md > Archivos esperados`.

## Mapa R → test

| R | Archivo | `it` |
|---|---|---|
| R14 | tests/components/PlanForm.test.tsx | «R14: Cuándo rige sin De inmediato y con A partir de» |
| R15 | tests/components/PlanForm.test.tsx | «R15: abre con mañana» |
| R15 | tests/unit/planes/plan-form-borrador.test.ts | «R15: vigencia ida y vuelta con fecha, cambie o no el precio» |
| R16 | tests/components/PlanForm.test.tsx | «R16: Programar cambio envía la fecha de A partir de» |
| R16 | tests/components/PlanForm.test.tsx | «R16: con cambio de precio envía la de Rige desde» |
| R16 | tests/components/PlanFormBorrador.test.tsx | «R9: una fecha pasada al programar lleva a Cuándo rige» (botón «Programar cambio» con precio) |
| R17 | tests/components/PlanForm.test.tsx | «R17: fecha vacía no avanza» |
| R18 | tests/unit/planes/plan-form-revision.test.ts | «R18: la fila de la fecha» |
| R18 | tests/components/PlanFormRevisar.test.tsx | «R18: Revisar muestra A partir de» |
| R19 | tests/components/PlanFormFechasPorEmpresa.test.tsx | «R19: con la fecha por defecto se pide y se muestra la tabla» |
| R20 | tests/components/PlanDetalle.test.tsx | «R20: programar avisa con la fecha» |

## Salida real (NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm run typecheck`: sin errores en `app/`, `tests/components` ni `tests/unit/planes`. Solo quedan errores en `tests/integration/db/`, que son del otro agente (T4):
  - `plan-precio-historial.test.ts` (3);
  - `cobro-plataforma-plan.test.ts` (1);
  - `planes-edicion-en-uso.test.ts` (1);
  - `planes-historial.test.ts` (1).
- `pnpm exec eslint <9 de app/ + 8 tests>`: sin salida, exit 0.
- `pnpm exec vitest run <los 8 tests tocados>`: `Test Files 8 passed (8)`, `Tests 139 passed (139)`.
- `pnpm exec vitest related --run --exclude "tests/integration/**" <9 de app/>`: `Test Files 24 passed (24)`, `Tests 366 passed (366)`.
- `grep -rn "De inmediato" app/`: vacío (exit 1).

## Veredicto

T5.1–T5.3 y T6.1–T6.2 hechas: «Cuándo rige» tiene un solo campo de fecha (mañana por defecto), el botón final es siempre «Programar cambio» y la tabla de fechas sale siempre. R14–R20 en verde.
