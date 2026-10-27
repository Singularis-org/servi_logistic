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

  it("poda los subítems de un módulo apagado y deja el resto del desplegable", () => {
    const menu = menuDeLaEmpresa(actor("maestro"), todosMenos("whatsapp", "api_integraciones"));
    const config = menu.find((i) => i.href === "/configuracion");
    expect(config?.children?.map((c) => c.href)).toEqual([
      "/configuracion",
      "/configuracion/tarifas",
      "/configuracion/integraciones",
      "/configuracion/vehiculos",
      "/configuracion/sinpe",
    ]);
    // El maestro conserva «Histórico» por «Acciones» (núcleo, P3), sin «Conversaciones».
    const historico = menu.find((i) => i.href === "/historico");
    expect(historico?.children?.map((c) => c.href)).toEqual(["/historico/acciones"]);
  });

  it("un desplegable que se queda sin subítems desaparece (Histórico del admin con WhatsApp apagado)", () => {
    // El `admin` ve «Histórico» solo por «Conversaciones» (WhatsApp); «Acciones» es del `maestro`.
    const conTodo = menuDeLaEmpresa(actor("admin"), TODOS);
    expect(conTodo.map((i) => i.href)).toContain("/historico");

    const sinWhatsapp = menuDeLaEmpresa(actor("admin"), todosMenos("whatsapp"));
    expect(sinWhatsapp.map((i) => i.href)).not.toContain("/historico");
  });

  it("los ítems del núcleo siguen visibles con los 8 módulos apagados", () => {
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

  it("con los 8 apagados no queda ninguna ruta de un módulo en ningún menú", () => {
    const deModulo = [
      "/analitica",
      "/monitoreo",
      "/recoleccion",
      "/recepcion-satelite/por-recibir",
      "/recepcion-satelite/en-bodega",
      "/mi-bodega",
      "/ranking",
      "/ranking/historico",
      "/wallet",
      "/wallet/tiendas",
      "/wallet/mensajeros",
      "/wallet/satelites",
      "/mi-wallet",
      "/configuracion/api",
      "/configuracion/plantillas",
      "/configuracion/envios-whatsapp",
      "/historico/conversaciones",
    ];
    const roles: RolValue[] = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero"];
    for (const rol of roles) {
      const visibles = rutas(menuDeLaEmpresa(actor(rol), NINGUNO));
      expect(visibles.filter((r) => deModulo.includes(r)), rol).toEqual([]);
    }
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
    const base = itemsVisibles(SIDEBAR_ITEMS, actor("maestro"));
    const filtrado = filtrarPorModulos(base, todosMenos("api_integraciones"));
    const configBase = base.find((i) => i.href === "/configuracion");
    const configFiltrada = filtrado.find((i) => i.href === "/configuracion");
    expect(configFiltrada).not.toBe(configBase);
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

  it("R32: adminSatelite con Bodegas satélite apagado aterriza en su primer destino que queda", () => {
    const menu = menuDeLaEmpresa(actor("adminSatelite"), todosMenos("bodegas_satelite"));
    expect(menu.map((i) => i.href)).not.toContain("/recepcion-satelite");
    expect(menu.map((i) => i.href)).not.toContain("/mi-bodega");
    expect(primerDestino(menu)).toBe("/cierres-admin");
  });

  it("R32: con los 8 apagados el adminSatelite sigue teniendo destino, del núcleo", () => {
    expect(primerDestino(menuDeLaEmpresa(actor("adminSatelite"), NINGUNO))).toBe("/cierres-admin");
  });

  it("R32: si no queda ningún destino, `primerDestino` da null (y `/dashboard` pinta su Inicio)", () => {
    // Un menú hecho solo de ítems de módulo: con todo apagado no queda nada a donde ir.
    const soloModulos: MenuItem[] = [
      { label: "B", href: "/b", iconKey: "warehouse", roles: ["adminSatelite"], modulo: "bodegas_satelite" },
      {
        label: "C",
        href: "/c",
        iconKey: "settings",
        roles: ["adminSatelite"],
        children: [{ label: "C1", href: "/c/1", modulo: "whatsapp" }],
      },
    ];
    expect(primerDestino(filtrarPorModulos(soloModulos, NINGUNO))).toBeNull();
  });

  it("los ítems apagados no son destino aunque fueran los primeros elegibles", () => {
    // El mensajero aterriza en «Entregas» (núcleo); con Recolección apagada no cambia.
    expect(primerDestino(menuDeLaEmpresa(actor("mensajero"), NINGUNO))).toBe(
      "/mis-asignaciones/reparto",
    );
    // El adminTienda aterriza en «Órdenes» (núcleo); Analítica (marcada) y Mi wallet no lo mueven.
    expect(primerDestino(menuDeLaEmpresa(actor("adminTienda"), NINGUNO))).toBe("/ordenes");
  });
});
