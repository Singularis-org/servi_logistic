import { expect, type Locator } from "@playwright/test";

/**
 * SL-44 (review B1) — MARCAR UNA CASILLA SIN CARRERA DE HIDRATACIÓN. Única fuente para todo
 * `check` del E2E.
 *
 * Por qué: las casillas de la app son el `Checkbox` de `@base-ui/react` (`components/ui/checkbox.tsx`),
 * un `role=checkbox` que solo cambia con React hidratado. Recién cargada la página, `check()` puede
 * llegar a la casilla del HTML del servidor y no marcarla («Clicking the checkbox did not change its
 * state», run 40142523437 de CI). Un `toBeVisible()` previo no lo evita: el HTML del servidor ya es
 * visible antes de hidratar.
 *
 * Cómo: se reintenta `check` + `toBeChecked` hasta que la casilla queda marcada de verdad. `check` no
 * desmarca una ya marcada, así que reintentar es seguro.
 *
 * No esconde un fallo real: si la casilla nunca queda marcada (deshabilitada, ausente o que no
 * responde), `toPass` agota su plazo y el test CAE con el último error de `check` o de `toBeChecked`.
 */
export async function marcarCasilla(casilla: Locator, { timeout = 15_000 }: { timeout?: number } = {}): Promise<void> {
  await expect(async () => {
    await casilla.check({ timeout: 2_000 });
    await expect(casilla).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout });
}
