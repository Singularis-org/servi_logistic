// SL-36 (T5.1; R6, R7) — quién puede configurar las integraciones y de qué empresa.
//
// R6 recorre las SEIS operaciones con cada rol que no es maestro, con el superadmin, con un maestro
// sin empresa y sin sesión: todas responden `forbidden` sin una sola llamada a repositorio,
// contador, probador, cifrador ni fuente aleatoria. La lista de operaciones se cierra contra el
// prototipo del service: una operación nueva sin su caso deja este archivo en rojo.
import { RolValue } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor, IIntegracionesService } from "@/lib/interfaces/services/IIntegracionesService";
import { IntegracionesService } from "@/lib/services/IntegracionesService";

import {
  ID_NUEVO,
  ID_WHATSAPP,
  MAESTRO_A,
  ORG_A,
  ORG_B,
  SECRETOS_CLARO,
  filaWhatsappA,
  llamadasTotales,
  montar,
} from "./integraciones-dobles";

afterEach(() => {
  vi.restoreAllMocks();
});

type Operacion = keyof IIntegracionesService;

/** Cada operación con una entrada que, con un maestro, SÍ tocaría el repositorio. */
const OPERACIONES: Record<Operacion, (s: IIntegracionesService, actor: Actor | null) => Promise<{ status: string }>> = {
  listar: (s, a) => s.listar(a),
  alta: (s, a) => s.alta(a, "google_maps", { clave_api: SECRETOS_CLARO.claveMaps }),
  editar: (s, a) => s.editar(a, ID_WHATSAPP, { nombreVisible: "Otro nombre" }),
  probar: (s, a) => s.probar(a, ID_WHATSAPP),
  regenerarToken: (s, a) => s.regenerarToken(a, ID_WHATSAPP),
  desconectar: (s, a) => s.desconectar(a, ID_WHATSAPP),
};

const ROLES_NO_MAESTRO = (Object.values(RolValue) as RolValue[]).filter((r) => r !== "maestro");

const RECHAZADOS: Array<[string, Actor | null]> = [
  ...ROLES_NO_MAESTRO.map((rol): [string, Actor] => [
    rol,
    // El superadmin no tiene empresa; los demás sí, la misma del maestro: el rechazo es por el rol.
    { usuarioId: `usuario-${rol}`, rol, organizacionId: rol === "superadmin" ? null : ORG_A },
  ]),
  ["maestro sin empresa", { usuarioId: "usuario-maestro-huerfano", rol: "maestro", organizacionId: null }],
  ["maestro sin organizacionId", { usuarioId: "usuario-maestro-sin-campo", rol: "maestro" }],
  ["sin sesión", null],
];

describe("SL-36/R6 — solo el maestro de una empresa configura integraciones", () => {
  it("la tabla de operaciones cubre exactamente las del service", () => {
    const delService = Object.getOwnPropertyNames(IntegracionesService.prototype)
      .filter((n) => n !== "constructor" && !n.startsWith("_"))
      .filter((n) => typeof (IntegracionesService.prototype as unknown as Record<string, unknown>)[n] === "function");
    // Los privados de TypeScript existen en el prototipo; se comparan solo los del contrato.
    const publicos = delService.filter((n) => n in OPERACIONES);
    expect(publicos.sort()).toEqual(Object.keys(OPERACIONES).sort());
    expect(Object.keys(OPERACIONES)).toHaveLength(6);
    // Y los roles salen del enum: incluyen admin, mensajero y superadmin.
    expect(ROLES_NO_MAESTRO).toEqual(expect.arrayContaining(["admin", "mensajero", "superadmin"]));
  });

  for (const [nombre, actor] of RECHAZADOS) {
    for (const operacion of Object.keys(OPERACIONES) as Operacion[]) {
      it(`${nombre}: ${operacion} responde forbidden sin tocar repo ni probador`, async () => {
        const m = montar((sembrar) => [filaWhatsappA(sembrar)]);
        const service = new IntegracionesService(m.deps);

        const r = await OPERACIONES[operacion](service, actor);

        expect(r).toEqual({ status: "forbidden" });
        expect(llamadasTotales(m)).toBe(0);
      });
    }
  }

  it("el mismo caso con el maestro sí llega al repositorio (el test de arriba no es ciego)", async () => {
    for (const operacion of Object.keys(OPERACIONES) as Operacion[]) {
      const m = montar((sembrar) => [filaWhatsappA(sembrar)]);
      const r = await OPERACIONES[operacion](new IntegracionesService(m.deps), MAESTRO_A);
      expect(r.status, operacion).not.toBe("forbidden");
      expect(llamadasTotales(m), operacion).toBeGreaterThan(0);
    }
  });
});

describe("SL-36/R7 — la empresa sale del actor aunque la entrada traiga otra", () => {
  it("alta: con un organizacionId en la entrada y otro contexto abierto, repo y cifrado usan la empresa del actor", async () => {
    const m = montar();
    const service = new IntegracionesService(m.deps);

    // Quien llama está (por error) en el contexto de B y la entrada dice B: nada de eso cuenta.
    const r = await conEmpresa(ORG_B, () =>
      service.alta(MAESTRO_A, "google_maps", { clave_api: SECRETOS_CLARO.claveMaps, organizacionId: ORG_B }),
    );

    expect(r.status).toBe("creada");
    expect(m.empresasVistas.length).toBeGreaterThan(0);
    expect(new Set(m.empresasVistas)).toEqual(new Set([ORG_A]));
    expect(m.cifrar).toHaveBeenCalledWith(SECRETOS_CLARO.claveMaps, {
      organizacionId: ORG_A,
      integracionId: ID_NUEVO,
      campo: "clave_api",
    });
    // La fila nueva quedó en A.
    expect(m.filas.get(ID_NUEVO)?.organizacionId).toBe(ORG_A);
  });

  it("editar, probar, regenerar y desconectar: cada consulta corre en la empresa del actor", async () => {
    const m = montar((sembrar) => [filaWhatsappA(sembrar)]);
    const service = new IntegracionesService(m.deps);

    await conEmpresa(ORG_B, async () => {
      expect(
        (await service.editar(MAESTRO_A, ID_WHATSAPP, { token_acceso: SECRETOS_CLARO.tokenNuevo, organizacionId: ORG_B }))
          .status,
      ).toBe("guardada");
      expect((await service.probar(MAESTRO_A, ID_WHATSAPP)).status).toBe("probada");
      expect((await service.regenerarToken(MAESTRO_A, ID_WHATSAPP)).status).toBe("regenerado");
      expect((await service.listar(MAESTRO_A)).status).toBe("ok");
      expect((await service.desconectar(MAESTRO_A, ID_WHATSAPP)).status).toBe("desconectada");
    });

    expect(new Set(m.empresasVistas)).toEqual(new Set([ORG_A]));
    for (const [, ctx] of [...m.cifrar.mock.calls, ...m.descifrar.mock.calls]) {
      expect(ctx.organizacionId).toBe(ORG_A);
    }
  });

  it("un maestro de B no alcanza la integración de A: no_encontrada, sin probar", async () => {
    const m = montar((sembrar) => [filaWhatsappA(sembrar)]);
    const service = new IntegracionesService(m.deps);
    const maestroB: Actor = { usuarioId: "usuario-maestro-b", rol: "maestro", organizacionId: ORG_B };

    expect(await service.probar(maestroB, ID_WHATSAPP)).toEqual({ status: "no_encontrada" });
    expect(await service.editar(maestroB, ID_WHATSAPP, { token_acceso: "x" })).toEqual({ status: "no_encontrada" });
    expect(await service.desconectar(maestroB, ID_WHATSAPP)).toEqual({ status: "no_encontrada" });
    expect(m.espias.whatsapp).not.toHaveBeenCalled();
    expect(m.filas.has(ID_WHATSAPP)).toBe(true);
    expect(new Set(m.empresasVistas)).toEqual(new Set([ORG_B]));
  });
});
