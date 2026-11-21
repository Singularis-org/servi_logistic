import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { NotificacionEvento } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ROLES_MI_PLAN, SIDEBAR_ITEMS } from "@/lib/auth/menu-visibility";
import { mensajeDelTope } from "@/lib/planes/mensajes";

// SLT-91 (design §7; R5, R8, R9, R10, R11) — «Mi plan» es solo del `maestro`, y nada le deja al `admin` otra
// vía hasta él: ni otra lista de roles, ni el componente del consumo en otra pantalla, ni un evento de la
// campana, ni un enlace, ni la ayuda, ni el texto del tope. Los esperados van escritos a mano.
//
// SLT-136 (design §8; R32) enmienda R10: la lista de quien puede nombrar la ruta admite además el catálogo de
// avisos (el atajo «Ver factura» del aviso de la factura emitida, solo para el maestro) y la plantilla del correo
// de esa factura (su botón). El catálogo es un `href`; la plantilla no (es la URL de un botón de correo).
//
// SLT-121 (design §4.2; R26-R28) la enmienda igual: los correos de la mora (recordatorio, congelada y activa de
// nuevo) van solo a los maestros y llevan el botón «Ver facturas» a «Mi plan». Tampoco es un `href`. El banner
// (`AvisoMora.tsx`, R24) entra en la lista con su tanda.

const RAIZ = process.cwd();
const RAICES_A_BARRER = ["app", "components", "lib", "public"];
const EXTENSIONES = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".webmanifest", ".html"]);

function archivosDe(dir: string, extensiones: ReadonlySet<string>): string[] {
  return readdirSync(path.join(RAIZ, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && extensiones.has(path.extname(e.name)))
    .map((e) => path.relative(RAIZ, path.join(e.parentPath, e.name)).replaceAll("\\", "/"));
}

const barridos = RAICES_A_BARRER.flatMap((raiz) => archivosDe(raiz, EXTENSIONES));
const leer = (archivo: string) => readFileSync(path.join(RAIZ, archivo), "utf8");
const conPatron = (patron: RegExp) => barridos.filter((archivo) => patron.test(leer(archivo))).sort();

/** `/mi-plan` como inicio de una ruta: tras una comilla o backtick, o tras un `${...}` con el dominio. */
const RUTA_MI_PLAN = /(?:["'`]|\})\/mi-plan(?=["'`/?#])/;
/** Una ruta de módulo que termina en el componente: cubre el import estático, el dinámico y el relativo. */
const MODULO_CONSUMO = /["'`][^"'`\n]*\/ConsumoDelPlan["'`]/;

describe("SLT-91 — la autocomprobación del barrido", () => {
  it("el barrido encuentra archivos y los cuatro de producción que nombran la ruta: una búsqueda vacía queda en rojo", () => {
    expect(barridos.length).toBeGreaterThan(100);
    expect(conPatron(RUTA_MI_PLAN)).toEqual(
      expect.arrayContaining([
        "lib/auth/menu-visibility.ts",
        "lib/modulos/reparto.ts",
        // SLT-136 R32: los dos admitidos nuevos tienen que aparecer, o la lista admitiría a quien ya no la nombra.
        "lib/notificaciones/catalogo-avisos.ts",
        "lib/services/email/plantillas/factura-emitida.ts",
        // SLT-121 R26-R28.
        "lib/services/email/plantillas/mora-aviso.ts",
      ]),
    );
    expect(conPatron(MODULO_CONSUMO)).toEqual(
      expect.arrayContaining([
        "app/(app)/mi-plan/_components/MiPlanModule.tsx",
        "app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx",
      ]),
    );
  });
});

describe("SLT-91 R5 — una única lista de roles, con el maestro solo", () => {
  it("R5: la lista es exactamente [maestro] y el ítem del menú lee esa constante", () => {
    expect([...ROLES_MI_PLAN]).toEqual(["maestro"]);
    const items = SIDEBAR_ITEMS.filter((i) => i.href === "/mi-plan");
    expect(items).toHaveLength(1);
    expect(items[0].roles).toBe(ROLES_MI_PLAN);
  });

  it("R5: el servicio lee la misma constante y nadie más la define", () => {
    expect(leer("lib/services/MiPlanService.ts")).toContain('import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";');
    expect(conPatron(/\bROLES_MI_PLAN\s*=/)).toEqual(["lib/auth/menu-visibility.ts"]);
  });
});

describe("SLT-91 R8, R9 — los avisos del plan", () => {
  it("R8: solo «Mi plan» y el detalle de empresa del superadmin importan `ConsumoDelPlan`", () => {
    expect(conPatron(MODULO_CONSUMO)).toEqual([
      "app/(app)/mi-plan/_components/MiPlanModule.tsx",
      "app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx",
    ]);
  });

  it("R9: ningún evento de la campana habla del plan", () => {
    const eventos = Object.values(NotificacionEvento);
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.filter((e) => /plan/i.test(e))).toEqual([]);
  });
});

describe("SLT-91 R10 — ninguna otra vía a «Mi plan»", () => {
  it("R10 (enmendado por SLT-136 R32 y SLT-121 R26-R28): fuera del menú, el reparto, la página, el catálogo de avisos y los correos de la factura y de la mora, nadie nombra la ruta", () => {
    const permitidos = [
      "app/(app)/mi-plan/page.tsx",
      "lib/auth/menu-visibility.ts",
      "lib/modulos/reparto.ts",
      "lib/notificaciones/catalogo-avisos.ts",
      "lib/services/email/plantillas/factura-emitida.ts",
      // SLT-121 R26-R28: el botón de los correos de la mora, que solo reciben los maestros.
      "lib/services/email/plantillas/mora-aviso.ts",
    ];
    expect(conPatron(RUTA_MI_PLAN).filter((archivo) => !permitidos.includes(archivo))).toEqual([]);
  });

  it("R10 (enmendado por SLT-136 R32): los únicos `href` a la ruta son el del menú y el atajo del aviso de la factura", () => {
    expect(conPatron(/href\s*[:=]\s*\{?\s*["'`]\/mi-plan(?=["'`/?#])/)).toEqual([
      "lib/auth/menu-visibility.ts",
      "lib/notificaciones/catalogo-avisos.ts",
    ]);
  });

  it("R10: la ayuda no nombra «Mi plan»", () => {
    const ayuda = archivosDe("docs/ayuda", new Set([".md", ".mdx"]));
    expect(ayuda.length).toBeGreaterThan(0);
    expect(ayuda.filter((archivo) => /mi plan/i.test(leer(archivo)))).toEqual([]);
  });
});

describe("SLT-91 R11 — el texto del tope no nombra «Mi plan»", () => {
  it("R11: ni la variante de rol ni la de API keys", () => {
    const deRol = mensajeDelTope({ tope: "rol", rol: "mensajero", maximo: 5, usados: 5, pedidas: 1 });
    const deApiKeys = mensajeDelTope({ tope: "api_keys", maximo: 2, usados: 2, pedidas: 1 });
    // Si alguna variante saliera vacía, «no contiene» pasaría sin decir nada.
    expect(deRol).toContain("Tu plan permite 5 usuarios activos");
    expect(deApiKeys).toContain("Tu plan permite 2 API keys activas");
    expect(deRol).not.toMatch(/mi plan/i);
    expect(deApiKeys).not.toMatch(/mi plan/i);
  });
});
