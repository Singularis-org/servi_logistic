import { randomUUID } from "node:crypto";

import { RolValue } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import type { IMiPlanRepository, PlanDeLaEmpresaLeido } from "@/lib/interfaces/repositories/IMiPlanRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { lineasDeCambioDelPlan } from "@/lib/planes/mensajes";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { VersionPlan } from "@/lib/types/planes";

// SLT-58 · T3 (design §3.1; R7, R8) — el servicio de «Mi plan» con un repositorio en memoria que
// cuenta sus llamadas. Lo que se mide: la autorización va antes que la base (un rechazo llega con el
// contador en cero), y el cambio pendiente sale de comparar la versión vigente con la pendiente con
// los mismos textos del correo de SL-24.

class RepoEnMemoria implements IMiPlanRepository {
  llamadas = 0;
  constructor(private readonly plan: PlanDeLaEmpresaLeido | null) {}
  async planDeLaEmpresa() {
    this.llamadas += 1;
    return this.plan;
  }
}

const AHORA = new Date("2026-10-29T12:00:00.000Z");

const VIGENTE: VersionPlan = {
  nombre: "Básico",
  topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10, adminTienda: 5 }, apiKeys: 2 },
  modulos: ["monitoreo"],
  precio: { tipo: "monto", mensual: "49.90", anual: null },
};

function leido(cambio: PlanDeLaEmpresaLeido["cambio"] = null): PlanDeLaEmpresaLeido {
  return {
    vigente: VIGENTE,
    ancla: new Date("2026-10-15T09:30:00.000Z"),
    uso: {
      ordenes: 1000,
      apiKeys: 2,
      porRol: { maestro: 1, admin: 0, mensajero: 8, adminTienda: 5, adminSatelite: 0 },
    },
    cambio,
  };
}

function actor(rol: RolValue): Actor {
  return { usuarioId: randomUUID(), rol };
}

const servicio = (repo: IMiPlanRepository) => new MiPlanService(repo, () => AHORA);

describe("SLT-58 — MiPlanService.ver: quién ve «Mi plan» (R8)", () => {
  const CON_ACCESO: readonly RolValue[] = ["maestro", "admin"];
  const SIN_ACCESO: readonly RolValue[] = ["mensajero", "adminTienda", "adminSatelite", "apiKey", "superadmin"];

  it("R8 — los siete roles están repartidos entre los que entran y los que no (ninguno queda sin caso)", () => {
    expect([...CON_ACCESO, ...SIN_ACCESO].sort()).toEqual(Object.values(RolValue).sort());
    expect([...ROLES_MI_PLAN]).toEqual(CON_ACCESO);
  });

  it.each(CON_ACCESO)("R8 — %s lee el plan de su empresa (una sola llamada al repositorio)", async (rol) => {
    const repo = new RepoEnMemoria(leido());
    const r = await servicio(repo).ver(actor(rol));
    expect(r.estado).toBe("ok");
    expect(repo.llamadas).toBe(1);
  });

  it.each(SIN_ACCESO)("R8 — %s recibe forbidden sin una sola llamada al repositorio", async (rol) => {
    const repo = new RepoEnMemoria(leido());
    expect(await servicio(repo).ver(actor(rol))).toEqual({ estado: "forbidden" });
    expect(repo.llamadas).toBe(0);
  });

  it("R8 — sin sesión (actor null) recibe forbidden sin una sola llamada al repositorio", async () => {
    const repo = new RepoEnMemoria(leido());
    expect(await servicio(repo).ver(null)).toEqual({ estado: "forbidden" });
    expect(repo.llamadas).toBe(0);
  });
});

describe("SLT-58 — MiPlanService.ver: lo que devuelve (R1, R2, R5, R6, R7)", () => {
  it("R6 — una empresa sin plan recibe { estado: ok, plan: null }", async () => {
    const r = await servicio(new RepoEnMemoria(null)).ver(actor("maestro"));
    expect(r).toEqual({ estado: "ok", plan: null });
  });

  it("R1, R2, R5 — arma nombre, precio sin moneda, módulos con su nombre, filas de consumo y reinicio; sin pendiente no hay sección", async () => {
    const r = await servicio(new RepoEnMemoria(leido())).ver(actor("admin"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");
    expect(r.plan.nombre).toBe("Básico");
    expect(r.plan.precioTexto).toBe("49.90 al mes");
    expect(r.plan.modulos).toEqual([{ clave: "monitoreo", nombre: "Monitoreo" }]);
    expect(r.plan.filas[0]).toMatchObject({ clave: "ordenes", texto: "1.000 de 3.000 órdenes del ciclo", estado: "normal" });
    expect(r.plan.filas.find((f) => f.clave === "adminTienda")?.estado).toBe("lleno");
    expect(r.plan.filas.find((f) => f.clave === "maestro")?.estado).toBe("sin_limite");
    // Ancla el 15 a las 09:30 UTC: el siguiente ciclo empieza el 15 de noviembre a las 09:30 UTC.
    expect(r.plan.reinicio).toEqual({ dias: 17, fecha: "2026-11-15" });
    expect(r.plan.cambioPendiente).toBeNull();
  });

  it("R7 — el pendiente trae la fecha en hora de la plataforma y las líneas de lineasDeCambioDelPlan entre vigente y pendiente", async () => {
    const pendiente: VersionPlan = {
      nombre: "Básico plus",
      topes: { ordenesPorCiclo: 5000, porRol: { mensajero: 10 }, apiKeys: 2 },
      modulos: ["monitoreo", "analitica"],
      precio: { tipo: "negociable" },
    };
    // Las 00:00 del 1 de diciembre en la hora de la plataforma.
    const cambio = { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: pendiente };
    const r = await servicio(new RepoEnMemoria(leido(cambio))).ver(actor("maestro"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");

    const esperadas = lineasDeCambioDelPlan({
      nombre: { antes: "Básico", despues: "Básico plus" },
      topes: { antes: VIGENTE.topes, despues: pendiente.topes },
      modulos: { antes: ["monitoreo"], despues: ["analitica", "monitoreo"] },
      precio: { antes: VIGENTE.precio, despues: { tipo: "negociable" } },
    });
    expect(r.plan.cambioPendiente).toEqual({ vigenteDesde: "2026-12-01", lineas: esperadas });
    // Y no es una igualdad vacía: cada cosa que cambia tiene su línea, y lo que no cambia no.
    expect(esperadas).toEqual([
      "Nombre del plan: Básico → Básico plus",
      "Órdenes por ciclo: 3000 → 5000",
      "Usuarios activos con el rol Admin de tienda: 5 → sin límite",
      "Se incluye el módulo Analítica.",
      "Precio: 49.90 al mes → negociable",
    ]);
  });

  it("R7 — un pendiente igual a la vigente deja la sección con la fecha y sin líneas", async () => {
    const cambio = { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: VIGENTE };
    const r = await servicio(new RepoEnMemoria(leido(cambio))).ver(actor("maestro"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");
    expect(r.plan.cambioPendiente).toEqual({ vigenteDesde: "2026-12-01", lineas: [] });
  });
});
