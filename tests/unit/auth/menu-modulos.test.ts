import type { ModuloApagable, RolValue } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  filtrarPorModulos,
  itemsVisibles,
  menuDeLaEmpresa,
  type MenuItem,
  primerDestino,
  SIDEBAR_ITEMS,
} from "@/lib/auth/menu-visibility";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";

// SL-23 · T8 (design §6; R15, R32) — EL MENÚ DE LA EMPRESA: lo que el rol ve, menos los módulos
// apagados. `itemsVisibles` no cambia de firma; `filtrarPorModulos` va detrás y `menuDeLaEmpresa`
// es la composición que leen la barra, `/dashboard` y el 404.
//
// Los esperados van ESCRITOS COMO LITERALES, verificados leyendo `SIDEBAR_ITEMS` (mismo criterio que
// `destino-post-login.test.ts`): si un cambio mueve un ítem o su módulo, este archivo tiene que
// romperse y obligar a decidir.

const TODOS: ReadonlySet<ModuloApagable> = new Set(ORDEN_MODULOS);
const NINGUNO: ReadonlySet<ModuloApagable> = new Set();

function actor(rol: RolValue): Actor {
  return { usuarioId: `u-${rol}`, rol };
}

function todosMenos(...apagados: ModuloApagable[]): ReadonlySet<ModuloApagable> {
  return new Set(ORDEN_MODULOS.filter((m) => !apagados.includes(m)));
}

/** Las rutas navegables de un menú: el `href` de cada ítem sin hijos y el de cada subítem. */
function rutas(items: readonly MenuItem[]): string[] {
  return items.flatMap((i) => (i.children ? i.children.map((c) => c.href) : [i.href]));
}

describe("SL-23 · filtrarPorModulos (R15)", () => {
  it("quita los ítems de un módulo apagado", () => {
    const menu = menuDeLaEmpresa(actor("maestro"), todosMenos("analitica", "ranking"));
    const etiquetas = menu.map((i) => i.label);
    expect(etiquetas).not.toContain("Analítica");
    expect(etiquetas).not.toContain("Ranking");
    expect(etiquetas).toContain("Monitoreo");
    expect(etiquetas).toContain("Wallet");
  });

  // 2026-10-27: con WhatsApp en el núcleo, ningún subítem real del menú es de un módulo. La poda de
  // subítems se mide sobre un desplegable armado, con la misma forma que tenía «Configuración».
  const DESPLEGABLE: MenuItem = {
    label: "D",
    href: "/d",
    iconKey: "settings",
    roles: ["maestro"],
    children: [
      { label: "D1", href: "/d/1" },
      { label: "D2", href: "/d/2", modulo: "ranking" },
      { label: "D3", href: "/d/3" },
    ],
  };

  it("poda los subítems de un módulo apagado y deja el resto del desplegable", () => {
    const [podado] = filtrarPorModulos([DESPLEGABLE], todosMenos("ranking"));
    expect(podado?.children?.map((c) => c.href)).toEqual(["/d/1", "/d/3"]);
    // Y los del núcleo reales no se podan: el maestro ve «Configuración» completo con todo apagado.
    const config = menuDeLaEmpresa(actor("maestro"), NINGUNO).find((i) => i.href === "/configuracion");
    expect(config?.children?.map((c) => c.href)).toEqual(
      menuDeLaEmpresa(actor("maestro"), TODOS).find((i) => i.href === "/configuracion")?.children?.map((c) => c.href),
    );
  });

  it("un desplegable que se queda sin subítems desaparece", () => {
    const soloDeModulo: MenuItem = { ...DESPLEGABLE, children: [{ label: "D2", href: "/d/2", modulo: "ranking" }] };
    expect(filtrarPorModulos([soloDeModulo], TODOS)).toHaveLength(1);
    expect(filtrarPorModulos([soloDeModulo], todosMenos("ranking"))).toEqual([]);
    // El «Histórico» del `admin` (solo «Conversaciones») sigue con todo apagado: WhatsApp es núcleo.
    expect(menuDeLaEmpresa(actor("admin"), NINGUNO).map((i) => i.href)).toContain("/historico");
  });

  it("los ítems del núcleo siguen visibles con los 4 módulos apagados", () => {
    const etiquetas = (rol: RolValue) => menuDeLaEmpresa(actor(rol), NINGUNO).map((i) => i.label);
    expect(etiquetas("mensajero")).toContain("Cierre del día");
    expect(etiquetas("maestro")).toContain("Cierres del día");
    expect(etiquetas("adminSatelite")).toContain("Cierres del día");
    expect(etiquetas("adminTienda")).toContain("Novedades");
    expect(etiquetas("maestro")).toContain("Incidentes");
    expect(etiquetas("adminSatelite")).toContain("Incidentes");
    expect(etiquetas("maestro")).toEqual(
      expect.arrayContaining(["Inicio", "Órdenes", "Configuración", "Histórico", "Ayuda"]),
    );
  });

  it("con los 4 apagados no queda ninguna ruta de un módulo en ningún menú", () => {
    const deModulo = [
      "/analitica",
      "/monitoreo",
      "/ranking",
      "/ranking/historico",
      "/wallet",
      "/wallet/tiendas",
      "/wallet/mensajeros",
      "/wallet/satelites",
      "/mi-wallet",
    ];
    const roles: RolValue[] = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"];
    for (const rol of roles) {
      const visibles = rutas(menuDeLaEmpresa(actor(rol), NINGUNO));
      expect(visibles.filter((r) => deModulo.includes(r)), rol).toEqual([]);
    }
  });

  it("Recolección, Bodegas satélite, API y WhatsApp son núcleo (2026-10-27): siguen en el menú con los 4 apagados", () => {
    expect(rutas(menuDeLaEmpresa(actor("mensajero"), NINGUNO))).toContain("/recoleccion");
    expect(rutas(menuDeLaEmpresa(actor("maestro"), NINGUNO))).toEqual(
      expect.arrayContaining([
        "/configuracion/api",
        "/configuracion/plantillas",
        "/configuracion/envios-whatsapp",
        "/historico/conversaciones",
      ]),
    );
    expect(rutas(menuDeLaEmpresa(actor("adminSatelite"), NINGUNO))).toEqual(
      expect.arrayContaining(["/recepcion-satelite/por-recibir", "/recepcion-satelite/en-bodega", "/mi-bodega"]),
    );
    const marcados = SIDEBAR_ITEMS.flatMap((i) => [i, ...(i.children ?? [])]).filter((i) =>
      [
        "/recoleccion",
        "/recepcion-satelite",
        "/mi-bodega",
        "/configuracion/api",
        "/configuracion/plantillas",
        "/configuracion/envios-whatsapp",
        "/historico/conversaciones",
      ].includes(i.href),
    );
    expect(marcados).toHaveLength(7);
    for (const item of marcados) expect(item.modulo, item.href).toBeUndefined();
  });

  it("con todo encendido es exactamente `itemsVisibles`, y conserva la identidad de cada ítem", () => {
    const roles: RolValue[] = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"];
    for (const rol of roles) {
      const base = itemsVisibles(SIDEBAR_ITEMS, actor(rol));
      // Contra la MISMA lista: `itemsVisibles` crea un objeto nuevo en cada llamada para el ítem que
      // él poda por rol (el «Histórico» del `admin`), así que la identidad se mide sobre `base`.
      expect(menuDeLaEmpresa(actor(rol), TODOS)).toEqual(base);
      const filtrado = filtrarPorModulos(base, TODOS);
      expect(filtrado).toHaveLength(base.length);
      filtrado.forEach((item, i) => expect(item).toBe(base[i]));
    }
  });

  it("conserva la identidad de los ítems que no poda, y crea uno nuevo solo para el podado", () => {
    const base = [...itemsVisibles(SIDEBAR_ITEMS, actor("maestro")), DESPLEGABLE];
    const filtrado = filtrarPorModulos(base, todosMenos("ranking"));
    expect(filtrado.find((i) => i.href === "/d")).not.toBe(DESPLEGABLE);
    expect(filtrado.find((i) => i.href === "/ordenes")).toBe(base.find((i) => i.href === "/ordenes"));
  });

  it("superadmin: sin cambios con el conjunto vacío que le da `modulosDelMenu` («Empresas» no tiene módulo)", () => {
    const menu = menuDeLaEmpresa(actor("superadmin"), NINGUNO);
    expect(menu.map((i) => i.href)).toEqual(
      itemsVisibles(SIDEBAR_ITEMS, actor("superadmin")).map((i) => i.href),
    );
    expect(menu.map((i) => i.href)).toContain("/plataforma/empresas");
    expect(primerDestino(menu)).toBe("/plataforma/empresas");
  });

  it("sin sesión no hay menú", () => {
    expect(menuDeLaEmpresa(null, TODOS)).toEqual([]);
  });
});

describe("SL-23 · primerDestino sobre el menú filtrado (R15, R32)", () => {
  it("con todo encendido, los aterrizajes de siempre", () => {
    const destino = (rol: RolValue) => primerDestino(menuDeLaEmpresa(actor(rol), TODOS));
    expect(destino("maestro")).toBe("/dashboard");
    expect(destino("admin")).toBe("/dashboard");
    expect(destino("adminTienda")).toBe("/ordenes");
    expect(destino("mensajero")).toBe("/mis-asignaciones/reparto");
    expect(destino("adminSatelite")).toBe("/recepcion-satelite/por-recibir");
  });

  it("R32: con el primer destino en un módulo apagado, aterriza en el primero que queda", () => {
    // Bodegas satélite pasó al núcleo (2026-10-27) y ningún rol real aterriza hoy en un módulo:
    // el caso se mide sobre un menú armado, con Wallet como el módulo apagado.
    const menu: MenuItem[] = [
      { label: "W", href: "/w", iconKey: "wallet", roles: ["adminSatelite"], modulo: "wallet" },
      { label: "N", href: "/n", iconKey: "warehouse", roles: ["adminSatelite"] },
    ];
    expect(primerDestino(filtrarPorModulos(menu, TODOS))).toBe("/w");
    expect(primerDestino(filtrarPorModulos(menu, todosMenos("wallet")))).toBe("/n");
  });

  it("R32: con los 4 apagados el adminSatelite sigue aterrizando en Recepción satélite (núcleo)", () => {
    expect(primerDestino(menuDeLaEmpresa(actor("adminSatelite"), NINGUNO))).toBe("/recepcion-satelite/por-recibir");
  });

  it("R32: si no queda ningún destino, `primerDestino` da null (y `/dashboard` pinta su Inicio)", () => {
    // Un menú hecho solo de ítems de módulo: con todo apagado no queda nada a donde ir.
    const soloModulos: MenuItem[] = [
      { label: "B", href: "/b", iconKey: "warehouse", roles: ["adminSatelite"], modulo: "wallet" },
      {
        label: "C",
        href: "/c",
        iconKey: "settings",
        roles: ["adminSatelite"],
        children: [{ label: "C1", href: "/c/1", modulo: "ranking" }],
      },
    ];
    expect(primerDestino(filtrarPorModulos(soloModulos, NINGUNO))).toBeNull();
  });

  it("los ítems apagados no son destino aunque fueran los primeros elegibles", () => {
    // El mensajero aterriza en «Entregas» (núcleo); con todos los módulos apagados no cambia.
    expect(primerDestino(menuDeLaEmpresa(actor("mensajero"), NINGUNO))).toBe(
      "/mis-asignaciones/reparto",
    );
    // El adminTienda aterriza en «Órdenes» (núcleo); Analítica (marcada) y Mi wallet no lo mueven.
    expect(primerDestino(menuDeLaEmpresa(actor("adminTienda"), NINGUNO))).toBe("/ordenes");
  });
});
