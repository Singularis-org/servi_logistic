import { expect, type Locator, type Page } from "@playwright/test";

/**
 * SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (`design.md §12`) — utilidades comunes de
 * los E2E de las pantallas del mensajero (`e2e/pwa-mensajero-*.spec.ts`). Miden en el navegador lo
 * que la guardia estática no ve: que nada se salga, se recorte con «…» ni se monte encima de otro
 * dato, y que los controles midan 44 × 44 px.
 *
 * Los textos largos van FIJOS aquí, escritos a mano: no se leen de la fuente que se prueba.
 */

/** 80 caracteres, con una palabra de 40 sin espacios (obliga a partir la palabra). */
export const DESTINATARIO_LARGO = "Ana María Rodríguez Villalobosdelosangelesmontealtovalverdex Sáenz Quesada Ramos";
/** Tienda de 60 caracteres. */
export const TIENDA_LARGA = "Distribuidora Comercial del Valle Central Sucursal Norte SA";
/** Dirección de unos 200 caracteres. */
export const DIRECCION_LARGA =
  "Del antiguo Higuerón de San Pedro de Montes de Oca 300 metros al este, 150 al norte y 25 al " +
  "oeste, casa esquinera de dos plantas color verde con portón negro, verjas blancas y buzón roj";
/** Producto de unos 120 caracteres. */
export const PRODUCTO_LARGO =
  "Juego de sartenes antiadherentes de cerámica con mango de madera, tapa de vidrio templado y " +
  "espátula de silicona incl.";
/** Motivo de rechazo de 300 caracteres. */
export const MOTIVO_LARGO = ("El cliente no quiso recibir el paquete porque dice que no lo pidió y que no conoce la tienda. ").repeat(4).slice(0, 300);
/**
 * El importe más ancho que admite una orden: ₡99 999 999. El monto a cobrar es ENTERO
 * (`orden_monto_cobrar_entero_check`), y el monto recibido de una entrega tiene que cuadrar con él.
 */
export const IMPORTE_LARGO = 99_999_999;

/** Anchos de teléfono de la ficha (R501). */
export const ANCHOS_MOVIL = [360, 414] as const;
export const ALTO_MOVIL = 780;

/** El contenedor del contenido de las pantallas autenticadas (`SidebarInset`, `app/(app)/layout.tsx`). */
export const CONTENIDO = '[data-slot="sidebar-inset"]';

/**
 * R501 — nada desborda en horizontal.
 *
 * Medir solo `document.documentElement.scrollWidth` NO sirve: el contenido vive dentro de
 * `SidebarInset`, que lleva `overflow-x-clip` y `min-w-0`, así que lo que se sale se RECORTA sin que
 * el documento lo note (lo cazó el reviewer de SLT-156). Por eso, además del documento, se mide cada
 * descendiente visible del contenido: ninguno puede tener su borde derecho (`getBoundingClientRect`)
 * más allá del borde derecho del contenido. Se saltan los `position: fixed` (flotantes) y lo que vive
 * dentro de un contenedor con scroll horizontal propio (`overflow-x: auto|scroll`), que es su
 * manera legítima de enseñar algo ancho. En un carrusel, cada diapositiva no puede ser más ancha que
 * su vista y lo de dentro no puede salirse de su diapositiva.
 *
 * `selector` es opcional: además, cada contenedor que case cumple `scrollWidth <= clientWidth`.
 */
export async function sinDesborde(page: Page, selector?: string): Promise<void> {
  const r = await page.evaluate(
    ({ sel, contenido }) => {
      const doc = document.documentElement;
      const medidas: { que: string; scroll: number; client: number }[] = [
        { que: "documento", scroll: doc.scrollWidth, client: doc.clientWidth },
      ];
      if (sel) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
          medidas.push({ que: `${sel} #${i}`, scroll: el.scrollWidth, client: el.clientWidth });
        });
      }

      const raiz = document.querySelector<HTMLElement>(contenido);
      if (!raiz) return { medidas, hayContenido: false, revisados: 0, fuera: [] as string[] };
      const borde = raiz.getBoundingClientRect().right;
      const fuera: string[] = [];
      let revisados = 0;

      /** ¿`el` o un ancestor hasta `raiz` es fijo o tiene scroll horizontal propio? */
      function exento(el: HTMLElement): boolean {
        for (let n: HTMLElement | null = el; n && n !== raiz; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.position === "fixed") return true;
          if (n !== el && (cs.overflowX === "auto" || cs.overflowX === "scroll")) return true;
        }
        return false;
      }

      for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
        const caja = el.getBoundingClientRect();
        if (caja.width === 0 || caja.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        revisados++;
        if (exento(el)) continue;
        // Carrusel (`components/ui/carousel.tsx`): las diapositivas de fuera de la vista están a la
        // derecha POR DISEÑO. Ahí la regla es otra: la diapositiva no es más ancha que su vista, y lo
        // de dentro no se sale de su diapositiva.
        if (el.getAttribute("data-slot") === "carousel-item") {
          const vista = el.closest<HTMLElement>('[data-slot="carousel-content"]');
          const ancho = vista ? vista.getBoundingClientRect().width : borde;
          // Sin el relleno: el hueco entre diapositivas (`pl-*` con `-ml-*` en la pista) es del carrusel.
          const cs = getComputedStyle(el);
          const util = caja.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          if (util > ancho + 1) fuera.push(`diapositiva de ${Math.round(util)} px útiles en una vista de ${Math.round(ancho)}`);
          continue;
        }
        const diapositiva = el.parentElement?.closest<HTMLElement>('[data-slot="carousel-item"]');
        const limite = diapositiva && raiz.contains(diapositiva) ? diapositiva.getBoundingClientRect().right : borde;
        if (caja.right > limite + 1) {
          const nombre = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""}`;
          fuera.push(`${nombre} acaba en ${Math.round(caja.right)} > ${Math.round(limite)}`);
        }
      }
      return { medidas, hayContenido: true, revisados, fuera: fuera.slice(0, 10) };
    },
    { sel: selector ?? null, contenido: CONTENIDO },
  );

  expect(r.hayContenido, `no hay contenido ${CONTENIDO} que medir`).toBe(true);
  expect(r.revisados, "el contenido no tiene nada visible que medir").toBeGreaterThan(0);
  if (selector) expect(r.medidas.length, `no hay ningún ${selector} que medir`).toBeGreaterThan(1);
  for (const m of r.medidas) {
    expect(m.scroll, `${m.que} desborda: scrollWidth ${m.scroll} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client);
  }
  expect(r.fuera, "elementos que se salen del contenido por la derecha (recortados por el inset)").toEqual([]);
}

/**
 * R490 — ningún elemento con texto de la región se recorta: ni `text-overflow: ellipsis`, ni
 * `-webkit-line-clamp`, ni `overflow: hidden|clip` con el contenido más ancho que la caja.
 */
export async function sinElipsis(region: Locator): Promise<void> {
  await expect(region.first()).toBeVisible();
  const recortados = await region.evaluateAll((raices) => {
    const out: string[] = [];
    for (const raiz of raices) {
      const todos = [raiz as HTMLElement, ...Array.from(raiz.querySelectorAll<HTMLElement>("*"))];
      for (const el of todos) {
        const propio = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
        if (!propio) continue;
        const cs = getComputedStyle(el);
        const clamp = cs.getPropertyValue("-webkit-line-clamp");
        const texto = (el.textContent ?? "").trim().slice(0, 40);
        if (cs.textOverflow === "ellipsis") out.push(`ellipsis: «${texto}»`);
        else if (clamp && clamp !== "none") out.push(`line-clamp ${clamp}: «${texto}»`);
        else if (
          (cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.overflow === "hidden" || cs.overflow === "clip") &&
          el.scrollWidth > el.clientWidth + 1
        ) {
          out.push(`overflow oculto (${el.scrollWidth} > ${el.clientWidth}): «${texto}»`);
        }
      }
    }
    return out;
  });
  expect(recortados).toEqual([]);
}

/**
 * R492 — las cajas de los datos de una fila (`selectorDato`, dentro de `fila`) no se intersectan.
 * Mide el primer hijo de cada celda (el elemento con el texto), que es lo que se monta encima.
 */
export async function sinSolapes(fila: Locator, selectorDato: string): Promise<void> {
  await expect(fila.first()).toBeVisible();
  const choques = await fila.first().evaluate((raiz, sel) => {
    const cajas = Array.from(raiz.querySelectorAll<HTMLElement>(sel)).map((celda) => {
      const el = (celda.firstElementChild as HTMLElement | null) ?? celda;
      return { que: celda.getAttribute("data-columna") ?? celda.tagName, r: el.getBoundingClientRect() };
    });
    const out: string[] = [];
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i].r;
        const b = cajas[j].r;
        if (a.width === 0 || b.width === 0) continue;
        const cruzan = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        if (cruzan) out.push(`${cajas[i].que} × ${cajas[j].que}`);
      }
    }
    return { out, total: cajas.length };
  }, selectorDato);
  expect(choques.total, `la fila no tiene datos «${selectorDato}»`).toBeGreaterThan(1);
  expect(choques.out).toEqual([]);
}

/** R493 — la caja del control mide al menos 44 × 44 px. */
export async function tactil(control: Locator): Promise<void> {
  const caja = await control.boundingBox();
  expect(caja, "el control no tiene caja (¿está visible?)").not.toBeNull();
  expect(caja!.width).toBeGreaterThanOrEqual(44);
  expect(caja!.height).toBeGreaterThanOrEqual(44);
}
