# impl SLT-67 «Montos sin «.00» cuando el número es cerrado (campo compartido)»

Sin SDD (decisión del humano). Alcance y decisiones: `progress/features/SLT-67.md`.
Primer uso: formulario del plan (`/plataforma/planes`, crear y editar). Ningún otro formulario migrado.

## Reparto
- backend_dev: util en `lib/config/moneda.ts` + test unit.
- frontend_dev: campo compartido `components/shared/MontoInput.tsx` + uso en `PlanForm.tsx` + tests de componente.

## Archivos
| Archivo | Cambio |
|---|---|
| `lib/config/moneda.ts` | + `montoParaCampo(valor: string): string` (solo strings; reutiliza `FORMA_DECIMAL`, `partirSinSigno`, `esCero`, `ESCALA`) |
| `components/shared/MontoInput.tsx` | nuevo: envuelve `components/ui` `Input`, `value: string`/`onChange(string)`, `inputMode="decimal"`; sin foco muestra `montoParaCampo(value)`, con foco muestra lo tecleado tal cual; normaliza al enfocar/desenfocar |
| `app/(app)/plataforma/planes/_components/PlanForm.tsx` | `inicial()` aplica `montoParaCampo` a `mensual` y `montoAnual`; los dos `Input` de monto pasan a `MontoInput`. Porcentaje y topes intactos |
| `tests/unit/config/moneda-para-campo.test.ts` | nuevo, 11 tests |
| `tests/components/MontoInput.test.tsx` | nuevo, 7 tests |
| `tests/components/PlanForm.test.tsx` | R15 «precarga» y «De inmediato»: «10.00» → «10»; caso nuevo 500.00/5000.00 |
| `e2e/planes-superadmin.spec.ts` | sin cambios: no espera «.00» en ningún input de monto (su único `toHaveValue` es la fecha de ciclo). No corrido |

## Regla de formato (`montoParaCampo`)
- entero o cola de ceros → sin parte decimal: `"500"`, `"500.00"`, `"500.000"` → `"500"`; `"0.00"`, `"-0.00"` → `"0"`; `"-500.00"` → `"-500"`.
- con decimales → mínimo 2: `"500.5"` → `"500.50"`.
- más de 2 decimales significativos → NO redondea (cambiaría el valor enviado): `"500.505"` igual; `"12.345600"` → `"12.3456"`.
- `""`/blancos → `""`; sin forma decimal (`"500."`, `"500,50"`, `"-"`) → verbatim (el usuario está escribiendo).
- Separador punto, sin miles: lo exige `montoCobroSchema` (`/^\d{1,10}(\.\d{1,2})?$/`, `lib/types/cobro-plataforma.ts`) que usa `precioPlanSchema`.

## Valor enviado al servidor
- Sigue siendo un string decimal válido para el schema; nunca pasa por `number`.
- Editar sin tocar el precio ahora manda `"10"` en vez de `"10.00"`: NO es un cambio falso. `lib/planes/rastro.ts`
  compara en forma canónica (`importeCanonico`, «un importe «10» y el «10.00» que devuelve la base son el
  mismo precio»), así que `hayCambios` sigue en false y no se escribe rastro.

## Mapa R -> test (sin SDD: criterios del leader)
| Criterio | Test |
|---|---|
| C1 entero sin decimales (500 → 500), 0, negativos | `tests/unit/config/moneda-para-campo.test.ts` |
| C2 con decimales siempre dos (500.5 → 500.50), muchos decimales sin redondeo, vacío, tope DECIMAL(12,2) | `tests/unit/config/moneda-para-campo.test.ts` |
| C3 util money-safe (sin `Number(`/`parseFloat(`) | `tests/unit/config/moneda-para-campo.test.ts` (barrido de fuente) + `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` |
| C4 campo muestra sin .00 y no reescribe al teclear; onChange entrega string | `tests/components/MontoInput.test.tsx` |
| C5 PlanForm (crear/editar) muestra 500 / 5000 y la action recibe string válido | `tests/components/PlanForm.test.tsx` (caso nuevo + R15 ajustados) |

## Salida de verificación (binarios del checkout principal; el worktree no tiene node_modules)
- backend_dev: `vitest run` moneda-para-campo, moneda-formato, dinero-centimos-cuando-existen.guardia, liquidacion-money-safe → 4 files, 86 tests passed. `tsc --noEmit -p .` (8 GB) → 0 errores. eslint de sus 2 archivos → exit 0.
- frontend_dev: `vitest run tests/components/MontoInput.test.tsx tests/components/PlanForm.test.tsx` → «Test Files 2 passed (2) / Tests 32 passed (32)». `vitest related --run` sobre MontoInput.tsx, PlanForm.tsx y los dos tests → «Test Files 5 passed (5) / Tests 77 passed (77)». eslint de sus 4 archivos → exit 0. `tsc --noEmit -p .` → sin errores.
- No corridos (instrucción del leader): `./init.sh`, suite completa, E2E. prettier no está en `node_modules/.bin`.

## Candidatos a migrar a `MontoInput` (NO migrados)
- `components/shared/conciliacion/MarcarRecibidoDialog.tsx` («Monto recibido»; `e2e/cierre-bodega-satelite.spec.ts:116` acepta `9000` o `9000.00`)
- `components/shared/DesglosePagoField.tsx` (solo enteros a propósito; revisar si aplica)
- `components/shared/liquidacion/RegistrarPagoDialog.tsx`
- `components/shared/wallet/RegistrarMovimientoDialog.tsx`
- `app/(app)/wallet/_components/GastoFijoPlantillaDialog.tsx`
- `app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifaCampos.tsx`
- `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`
- `app/(app)/ranking/_components/PremioInputRow.tsx`

## Notas
- SLT-66 (pending) también toca `PlanForm.tsx`; aquí el cambio es mínimo (estado inicial + 2 inputs).
