import { expect, type Locator, type Page } from "@playwright/test";

/**
 * PULSAR HASTA QUE SE ABRA LO ESPERADO, SIN CARRERA DE HIDRATACIÓN. Única fuente para todo clic
 * del E2E que abre algo (un diálogo, un panel) o navega con un enlace del cliente.
 *
 * Por qué: recién cargada, la página puede no estar hidratada todavía y el primer clic cae en el
 * HTML del servidor sin manejador, o en un `next/link` cuyo router aún no atiende: el clic se
 * pierde y la página no cambia (run 40875969358 de CI, `wallet-mensajeros.spec.ts`: la URL siguió
 * en `/wallet/mensajeros`). Un `toBeVisible()` previo no lo evita: el HTML del servidor ya es
 * visible antes de hidratar. Mismo problema que resuelve `marcarCasilla` (`casillas.ts`).
 *
 * Cómo: se reintenta clic + comprobación hasta que lo esperado aparece. Antes de cada clic se mira
 * si ya llegó, para no pulsar un control que el primer clic ya hizo desaparecer (la navegación) ni
 * pulsar dos veces cuando el primer clic solo fue lento. Por eso NO sirve para un control que
 * alterna (abre/cierra): ahí un segundo clic deshace el primero.
 *
 * No esconde un fallo real: si lo esperado nunca llega, `toPass` agota su plazo y el test CAE con
 * el último error del clic o de la comprobación.
 */
async function pulsarHasta(
  control: Locator,
  yaLlego: () => Promise<boolean>,
  comprobar: () => Promise<void>,
  timeout: number,
): Promise<void> {
  await expect(async () => {
    if (!(await yaLlego())) await control.click({ timeout: 2_000 });
    await comprobar();
  }).toPass({ timeout });
}

/** Pulsa `control` hasta que `abierto` es visible. */
export async function abrirCon(
  control: Locator,
  abierto: Locator,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  await pulsarHasta(
    control,
    () => abierto.isVisible(),
    () => expect(abierto).toBeVisible({ timeout: 2_000 }),
    timeout,
  );
}

/** Pulsa el enlace `control` hasta que la página está en una URL que casa con `url`. */
export async function navegarCon(
  page: Page,
  control: Locator,
  url: RegExp,
  { timeout = 30_000 }: { timeout?: number } = {},
): Promise<void> {
  await pulsarHasta(
    control,
    async () => url.test(page.url()),
    () => expect(page).toHaveURL(url, { timeout: 5_000 }),
    timeout,
  );
}
