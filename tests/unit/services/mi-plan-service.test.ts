import { randomUUID } from "node:crypto";

import { RolValue } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import type {
  IMiPlanRepository,
  LecturaDeMiPlan,
  PlanDeLaEmpresaLeido,
} from "@/lib/interfaces/repositories/IMiPlanRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MiPlanService } from "@/lib/services/MiPlanService";
import type { VersionPlan } from "@/lib/types/planes";

// SLT-58 · T3 (design §3.1; R7, R8) — el servicio de «Mi plan» con un repositorio en memoria que
// cuenta sus llamadas. Lo que se mide: la autorización va antes que la base (un rechazo llega con el
// contador en cero), y el cambio pendiente sale de comparar la versión vigente con la pendiente con
// los mismos textos del correo de SL-24.
//
// SLT-86 (R5, R12, R15, R26, R27): el doble lee lo que `plan_de_la_empresa` da desde 20261106130000: la
// entrada, el precio del período en curso, el pendiente de la empresa (sin actor) y, sin plan, la primera
// asignación pendiente. Sin fila de órdenes con tope (R8).

class RepoEnMemoria implements IMiPlanRepository {
  llamadas = 0;
  constructor(private readonly plan: LecturaDeMiPlan) {}
  async planDeLaEmpresa() {
    this.llamadas += 1;
    return this.plan;
  }
}

const AHORA = new Date("2026-10-29T12:00:00.000Z");

const VIGENTE: VersionPlan = {
  nombre: "Básico",
  topes: { porRol: { mensajero: 10, adminTienda: 5 }, apiKeys: 2 },
  modulos: ["monitoreo"],
  precio: { tipo: "monto", mensual: "49.90", descuentos: {} },
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
};

function leido(cambio: PlanDeLaEmpresaLeido["cambio"] = null): PlanDeLaEmpresaLeido {
  return {
    vigente: VIGENTE,
    // SLT-86 (R5): la entrada, las 00:00 de la plataforma del 15 de octubre.
    entrada: new Date("2026-10-15T06:00:00.000Z"),
    // SLT-86 (R15): el precio que regía al empezar el período en curso; aquí, el mismo que el vigente.
    precioDelPeriodo: VIGENTE.precio,
    pendiente: null,
    uso: {
      ordenes: 1000,
      apiKeys: 2,
      // SLT-66 R5: el uso ya no trae al maestro.
      porRol: { admin: 0, mensajero: 8, adminTienda: 5, adminSatelite: 0 },
    },
    cambio,
    // SLT-66 R18: la lectura trae el costo vigente (el plan no fija costo por orden: el global).
    costoVigente: { modo: "fijo", monto: "500.00", fuente: "global" },
    cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo de la lectura
    // Ajuste planes-custom (D6): cómo paga la empresa.
    tipoCobro: "mensual",
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
  it("R6 — una empresa sin plan recibe { estado: ok, plan: null } y sin pendiente", async () => {
    const r = await servicio(new RepoEnMemoria(null)).ver(actor("maestro"));
    expect(r).toEqual({ estado: "ok", plan: null, pendienteSinPlan: null });
  });

  it("SLT-86 R26 — sin plan y con su primera asignación pendiente: plan null y el pendiente, sin actor", async () => {
    const pendiente = { planNombre: "Pro", tipo: "quincenal" as const, desde: "2026-11-10" };
    const r = await servicio(new RepoEnMemoria({ sinPlan: true, pendiente })).ver(actor("admin"));
    expect(r).toEqual({ estado: "ok", plan: null, pendienteSinPlan: pendiente });
  });

  it("R1, R2, R5 — arma nombre, precio sin moneda, módulos con su nombre, filas de consumo y reinicio; sin pendiente no hay sección", async () => {
    const r = await servicio(new RepoEnMemoria(leido())).ver(actor("admin"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");
    expect(r.plan.nombre).toBe("Básico");
    expect(r.plan.precioTexto).toBe("49.90 / mes");
    expect(r.plan.modulos).toEqual([{ clave: "monitoreo", nombre: "Monitoreo" }]);
    // SLT-86 (R7, R8): las órdenes del período van aparte, sin fila ni tope.
    expect(r.plan.filas.map((f) => f.clave)).toEqual(["admin", "mensajero", "adminTienda", "adminSatelite", "api_keys"]);
    expect(r.plan.ordenesDelPeriodo).toBe(1000);
    expect(r.plan.filas.find((f) => f.clave === "adminTienda")?.estado).toBe("lleno");
    // SLT-66 R5: el maestro no tiene fila (antes salía «sin límite»).
    expect(r.plan.filas.map((f) => f.clave)).not.toContain("maestro");
    // SLT-86 (R27): el mensual se reinicia el 1 de noviembre (00:00 de la plataforma = 06:00 UTC); desde el
    // 29 a las 12:00 UTC faltan 2,75 días, que se redondean a 3.
    expect(r.plan.reinicio).toEqual({ dias: 3, fecha: "2026-11-01" });
    expect(r.plan.cambioPendiente).toBeNull();
  });

  it("D9, SLT-86 R12/R27 — «Mi plan» trae el tipo, el período en curso (tramo desde la entrada), su costo y el siguiente cobro", async () => {
    const mensual = await servicio(new RepoEnMemoria(leido())).ver(actor("maestro"));
    if (mensual.estado !== "ok" || mensual.plan === null) throw new Error("se esperaba un plan");
    // Entrada el 15 de octubre: tramo del 15 al 31, 17 de 31 días → 4990 × 17 ÷ 31 = 2736,45 céntimos → 27.36.
    expect(mensual.plan.cobro).toEqual({
      tipo: "mensual",
      periodo: { desde: "2026-10-15", hasta: "2026-10-31", esTramo: true },
      costo: "27.36",
      siguienteCobro: "2026-11-01",
      pendiente: null,
    });

    const anual = await servicio(new RepoEnMemoria({ ...leido(), tipoCobro: "anual" })).ver(actor("admin"));
    if (anual.estado !== "ok" || anual.plan === null) throw new Error("se esperaba un plan");
    // 598.80 al año; tramo del 15 de octubre al 31 de diciembre: 78 de 365 días → 12796,27 céntimos → 127.96.
    expect(anual.plan.cobro).toEqual({
      tipo: "anual",
      periodo: { desde: "2026-10-15", hasta: "2026-12-31", esTramo: true },
      costo: "127.96",
      siguienteCobro: "2027-01-01",
      pendiente: null,
    });
    // R13: el tipo de cobro no cambia el costo por orden; R28: la base del total es el costo del período o tramo.
    if (mensual.plan.costeo.modo !== "fijo" || anual.plan.costeo.modo !== "fijo") throw new Error("se esperaba modo fijo");
    expect(anual.plan.costeo.costoPorOrden).toBe(mensual.plan.costeo.costoPorOrden);
    expect([mensual.plan.costeo.total, anual.plan.costeo.total]).toEqual(["500027.36", "500127.96"]);
  });

  it("R7 — el pendiente trae la fecha en hora de la plataforma y las líneas de lineasDeCambioDelPlan entre vigente y pendiente", async () => {
    const pendiente: VersionPlan = {
      nombre: "Básico plus",
      topes: { porRol: { mensajero: 10 }, apiKeys: 2 },
      modulos: ["monitoreo", "analitica"],
      precio: { tipo: "sin_precio" },
      costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    };
    // Las 00:00 del 1 de diciembre en la hora de la plataforma.
    const cambio = { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: pendiente };
    const r = await servicio(new RepoEnMemoria(leido(cambio))).ver(actor("maestro"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");

    // Cada cosa que cambia tiene su línea, y lo que no cambia no. SLT-86 (R8): sin órdenes por ciclo.
    expect(r.plan.cambioPendiente).toEqual({
      vigenteDesde: "2026-12-01",
      lineas: [
        "Nombre del plan: Básico → Básico plus",
        "Usuarios activos con el rol Admin de tienda: 5 → sin límite",
        "Se incluye el módulo Analítica.",
        "Costo base: 49.90 / mes → sin precio", // SLT-66 R9; SLT-86 §7.1
      ],
    });
  });

  it("R7 — un pendiente igual a la vigente deja la sección con la fecha y sin líneas", async () => {
    const cambio = { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: VIGENTE };
    const r = await servicio(new RepoEnMemoria(leido(cambio))).ver(actor("maestro"));
    if (r.estado !== "ok" || r.plan === null) throw new Error("se esperaba un plan");
    expect(r.plan.cambioPendiente).toEqual({ vigenteDesde: "2026-12-01", lineas: [] });
  });
});
