import { randomUUID } from "node:crypto";

import { type ModuloApagable, RolValue } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { esPlataforma } from "@/lib/auth/plataforma";
import type {
  EmpresaDeModulos,
  IModulosEmpresaRepository,
} from "@/lib/interfaces/repositories/IModulosEmpresaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ModulosEmpresaService } from "@/lib/services/ModulosEmpresaService";

// SL-23 · T6 (design §5.2; R2, R9–R13) — el servicio con un repositorio en memoria que anota cada
// llamada. Lo que se mide es el ORDEN: quién, luego qué, luego si la empresa existe, y solo entonces
// la escritura. Un rechazo tiene que llegar con el registro de llamadas vacío.

const EMPRESA = randomUUID();
const OTRA = randomUUID();

class RepoEnMemoria implements IModulosEmpresaRepository {
  llamadas: string[] = [];
  empresas = new Map<string, EmpresaDeModulos>([[EMPRESA, { id: EMPRESA, nombre: "Mensajería Uno" }]]);
  encendidos = new Map<string, Set<ModuloApagable>>([[EMPRESA, new Set<ModuloApagable>(["wallet"])]]);

  async empresa(id: string) {
    this.llamadas.push(`empresa:${id}`);
    return this.empresas.get(id) ?? null;
  }
  async activos(id: string) {
    this.llamadas.push(`activos:${id}`);
    return [...(this.encendidos.get(id) ?? [])];
  }
  async encender(id: string, modulo: ModuloApagable, actor: string) {
    this.llamadas.push(`encender:${id}:${modulo}:${actor}`);
    const set = this.encendidos.get(id) ?? new Set<ModuloApagable>();
    this.encendidos.set(id, set);
    if (set.has(modulo)) return false;
    set.add(modulo);
    return true;
  }
  async apagar(id: string, modulo: ModuloApagable, actor: string) {
    this.llamadas.push(`apagar:${id}:${modulo}:${actor}`);
    return this.encendidos.get(id)?.delete(modulo) ?? false;
  }
}

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
const ROLES_DE_EMPRESA = Object.values(RolValue).filter((r) => !esPlataforma(r));

let repo: RepoEnMemoria;
let servicio: ModulosEmpresaService;

beforeEach(() => {
  repo = new RepoEnMemoria();
  servicio = new ModulosEmpresaService(repo);
});

describe("SL-23 · ModulosEmpresaService — autorización (R10)", () => {
  it("control: hay roles de empresa que probar, y el maestro es uno de ellos", () => {
    expect(ROLES_DE_EMPRESA.length).toBeGreaterThanOrEqual(6);
    expect(ROLES_DE_EMPRESA).toContain("maestro");
  });

  it.each(ROLES_DE_EMPRESA)("%s → forbidden al fijar y al ver, sin tocar el repositorio", async (rol) => {
    const actor: Actor = { usuarioId: `u-${rol}`, rol, organizacionId: EMPRESA };
    expect(await servicio.fijar(actor, { organizacionId: EMPRESA, modulo: "ranking", activo: true })).toEqual({
      estado: "forbidden",
    });
    expect(await servicio.ver(actor, { organizacionId: EMPRESA })).toEqual({ estado: "forbidden" });
    expect(repo.llamadas).toEqual([]);
  });

  it("el maestro de ESA misma empresa tampoco puede", async () => {
    const maestro: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: EMPRESA };
    expect(await servicio.fijar(maestro, { organizacionId: EMPRESA, modulo: "wallet", activo: false })).toEqual({
      estado: "forbidden",
    });
    expect(repo.encendidos.get(EMPRESA)?.has("wallet")).toBe(true);
  });

  it("sin sesión → forbidden", async () => {
    expect(await servicio.fijar(null, { organizacionId: EMPRESA, modulo: "ranking", activo: true })).toEqual({
      estado: "forbidden",
    });
    expect(repo.llamadas).toEqual([]);
  });

  it("orden: quién antes que qué — un rol de empresa con la entrada rota recibe forbidden, no validation_error", async () => {
    const maestro: Actor = { usuarioId: "u-m", rol: "maestro", organizacionId: EMPRESA };
    expect(await servicio.fijar(maestro, { modulo: "nada" })).toEqual({ estado: "forbidden" });
    expect(repo.llamadas).toEqual([]);
  });
});

describe("SL-23 · ModulosEmpresaService — validación y empresa (R2, R11)", () => {
  it.each(["incidentes_novedades", "cierres", "Cierres", "Inicio", "nucleo", "wallet_cierres", ""])(
    "módulo fuera del catálogo («%s») → validation_error sin tocar el repositorio",
    async (modulo) => {
      expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo, activo: false })).toEqual({
        estado: "validation_error",
      });
      expect(repo.llamadas).toEqual([]);
    },
  );

  it("organizacionId que no es un uuid, o activo que no es booleano → validation_error", async () => {
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: "org-1", modulo: "ranking", activo: true })).toEqual({
      estado: "validation_error",
    });
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "ranking", activo: "si" })).toEqual({
      estado: "validation_error",
    });
    expect(await servicio.ver(SUPERADMIN, { organizacionId: 7 })).toEqual({ estado: "validation_error" });
    expect(repo.llamadas).toEqual([]);
  });

  it("empresa inexistente → not_found, sin escribir", async () => {
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: OTRA, modulo: "ranking", activo: true })).toEqual({
      estado: "not_found",
    });
    expect(await servicio.ver(SUPERADMIN, { organizacionId: OTRA })).toEqual({ estado: "not_found" });
    expect(repo.llamadas).toEqual([`empresa:${OTRA}`, `empresa:${OTRA}`]);
  });
});

describe("SL-23 · ModulosEmpresaService — escritura (R9, R13)", () => {
  it("encender: comprueba la empresa y enciende con el superadmin como actor", async () => {
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "ranking", activo: true })).toEqual({
      estado: "ok",
      cambio: true,
    });
    expect(repo.llamadas).toEqual([`empresa:${EMPRESA}`, `encender:${EMPRESA}:ranking:u-sa`]);
  });

  it("apagar: apaga con el superadmin como actor", async () => {
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "wallet", activo: false })).toEqual({
      estado: "ok",
      cambio: true,
    });
    expect(repo.llamadas).toEqual([`empresa:${EMPRESA}`, `apagar:${EMPRESA}:wallet:u-sa`]);
  });

  it("R13 — encender lo encendido o apagar lo apagado responde ok sin cambio", async () => {
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "wallet", activo: true })).toEqual({
      estado: "ok",
      cambio: false,
    });
    expect(await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "ranking", activo: false })).toEqual({
      estado: "ok",
      cambio: false,
    });
  });

  it("R9 — el cambio se ve en la siguiente lectura, sin caché en el servicio", async () => {
    await servicio.fijar(SUPERADMIN, { organizacionId: EMPRESA, modulo: "ranking", activo: true });
    const r = await servicio.ver(SUPERADMIN, { organizacionId: EMPRESA });
    if (r.estado !== "ok") throw new Error(`se esperaba ok: ${r.estado}`);
    expect(r.empresa.modulos.filter((m) => m.activo).map((m) => m.clave)).toEqual(["wallet", "ranking"]);
  });
});

describe("SL-23 · ModulosEmpresaService — ver (R8)", () => {
  it("los 8 módulos en el orden de pantalla, con su nombre y su estado; ninguno del núcleo", async () => {
    const r = await servicio.ver(SUPERADMIN, { organizacionId: EMPRESA });
    expect(r).toEqual({
      estado: "ok",
      empresa: {
        organizacionId: EMPRESA,
        nombre: "Mensajería Uno",
        modulos: [
          { clave: "analitica", nombre: "Analítica", activo: false },
          { clave: "monitoreo", nombre: "Monitoreo", activo: false },
          { clave: "recoleccion", nombre: "Recolección", activo: false },
          { clave: "bodegas_satelite", nombre: "Bodegas satélite", activo: false },
          { clave: "wallet", nombre: "Wallet", activo: true },
          { clave: "ranking", nombre: "Ranking", activo: false },
          { clave: "whatsapp", nombre: "WhatsApp", activo: false },
          { clave: "api_integraciones", nombre: "API e integraciones", activo: false },
        ],
      },
    });
  });
});
