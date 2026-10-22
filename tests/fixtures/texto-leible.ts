/**
 * SL-15 (R21) — lo que una persona lee u oye en el documento montado: el texto y los nombres
 * accesibles que no son texto (`aria-label`, `title`, `placeholder`, `alt`). Los atributos técnicos
 * (`data-*`, `id`, `class`) quedan fuera: no se ven ni se oyen.
 */
const ATRIBUTOS_LEIBLES = ["aria-label", "title", "placeholder", "alt"] as const;

export function textoLeible(raiz: ParentNode = document.body): string {
  const partes = [(raiz as Node).textContent ?? ""];
  for (const el of raiz.querySelectorAll(ATRIBUTOS_LEIBLES.map((a) => `[${a}]`).join(","))) {
    for (const a of ATRIBUTOS_LEIBLES) {
      const v = el.getAttribute(a);
      if (v) partes.push(v);
    }
  }
  return partes.join("\n");
}
