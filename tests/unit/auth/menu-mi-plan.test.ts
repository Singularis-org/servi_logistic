import type { ModuloApagable, RolValue } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  itemsVisibles,
  menuDeLaEmpresa,
  primerDestino,
  puedeVer,
  ROLES_MI_PLAN,
  SIDEBAR_ITEMS,
} from "@/lib/auth/menu-visibility";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";

// SLT-58 (design §4.1) — «Mi plan» en el menú: solo `maestro` y `admin`, con la constante que leen
// también la página y el servicio, sin mover el aterrizaje de nadie y sin depender de los módulos.
// Los esperados van escritos a mano: derivarlos de `primerDestino` sería una tautología.

const HREF = "/mi-plan";

const SIETE: RolValue[] = [
  "maestro",
  "admin",
  "adminTienda",
  "adminSatelite",
  "mensajero",
  "apiKey",
  "superadmin",
];

const TODOS: ReadonlySet<ModuloApagable> = new Set(ORDEN_MODULOS);
const NINGUNO: ReadonlySet<ModuloApagable> = new Set();

function actor(rol: RolValue): Actor {
  return { usuarioId: `u-${rol}`, rol };
}

function itemMiPlan() {
  return SIDEBAR_ITEMS.filter((i) => i.href === HREF);
}

describe("SLT-58 R10 — «Mi plan» en el menú", () => {
  it("R10: existe exactamente una vez, con su etiqueta e icono, sin subítems y sin `destinoInicial`", () => {
    expect(itemMiPlan()).toHaveLength(1);
    const [item] = itemMiPlan();
    expect(item.label).toBe("Mi plan");
    expect(item.iconKey).toBe("gaugeCircle");
    expect(item.children).toBeUndefined();
    expect(item.destinoInicial).toBeUndefined();
  });

  it("R10: `roles` ES la constante `ROLES_MI_PLAN` (identidad), y la constante es [maestro, admin]", () => {
    const [item] = itemMiPlan();
    expect(item.roles).toBe(ROLES_MI_PLAN);
    expect([...ROLES_MI_PLAN]).toEqual(["maestro", "admin"]);
  });

  it("R10: de los siete roles solo lo ven `maestro` y `admin`; sin sesión, nadie", () => {
    const [item] = itemMiPlan();
    expect(SIETE.filter((rol) => puedeVer(item, actor(rol)))).toEqual(["maestro", "admin"]);
    for (const rol of SIETE) {
      const hrefs = itemsVisibles(SIDEBAR_ITEMS, actor(rol)).map((i) => i.href);
      if (rol === "maestro" || rol === "admin") expect(hrefs, rol).toContain(HREF);
      else expect(hrefs, rol).not.toContain(HREF);
    }
    expect(puedeVer(item, null)).toBe(false);
  });

  it("R10: va justo después de «Histórico»", () => {
    const i = SIDEBAR_ITEMS.findIndex((it) => it.href === HREF);
    expect(SIDEBAR_ITEMS[i - 1]?.label).toBe("Histórico");
  });
});

describe("SLT-58 R10 — el aterrizaje post-login de cada rol no cambia", () => {
  const ANTES: Record<RolValue, string | null> = {
    maestro: "/dashboard",
    admin: "/dashboard",
    adminTienda: "/ordenes",
    adminSatelite: "/recepcion-satelite/por-recibir",
    mensajero: "/mis-asignaciones/reparto",
    apiKey: null,
    superadmin: "/plataforma/empresas",
  };

  for (const rol of SIETE) {
    it(`R10: ${rol} sigue aterrizando en ${ANTES[rol] ?? "ninguna parte"}`, () => {
      expect(primerDestino(itemsVisibles(SIDEBAR_ITEMS, actor(rol)))).toBe(ANTES[rol]);
    });
  }
});

describe("SLT-58 R12 — «Mi plan» es del núcleo", () => {
  it("R12: el ítem no declara módulo", () => {
    expect(itemMiPlan()[0].modulo).toBeUndefined();
  });

  it("R12: con todos los módulos apagados, `maestro` y `admin` lo siguen viendo", () => {
    for (const rol of ["maestro", "admin"] as const) {
      expect(menuDeLaEmpresa(actor(rol), NINGUNO).map((i) => i.href), rol).toContain(HREF);
      expect(menuDeLaEmpresa(actor(rol), TODOS).map((i) => i.href), rol).toContain(HREF);
    }
  });
});
