import { describe, expect, it, vi } from "vitest";

import type {
  IMoraEmpresaRepository,
  MoraLeida,
  MoraParaPlataforma,
} from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MORA_TEXTOS, type FilaMora } from "@/lib/planes/mora";
import { MoraEmpresaService } from "@/lib/services/MoraEmpresaService";

// SLT-121 · T4.1 (design §5.3; R3, R4, R22, R24, R32, R33) — `MoraEmpresaService` con un repositorio doble. Lo que se
// mide: quién pasa (sin permiso, ninguna llamada al repositorio), qué se valida antes de escribir (días, motivo y el
// rango de la fecha hasta de la decisión P4) y la forma de la lectura del superadmin. Las reglas del congelamiento
// las miden los tests de la base y del repositorio.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro", organizacionId: "org-propia" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin", organizacionId: "org-propia" };
const MENSAJERO: Actor = { usuarioId: "u-mensajero", rol: "mensajero", organizacionId: "org-propia" };
const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin", organizacionId: null };

const ORG = "0b7c6a2e-5d1f-4e3a-9c8b-1a2b3c4d5e6f";
const GLOBAL = 7;
/** 24 nov 2026 a las 10:00 de la plataforma (UTC-6): la factura del 16 con gracia 7 venció a las 00:00. */
const AHORA = new Date("2026-11-24T16:00:00.000Z");

const VENCIDA: FilaMora = {
  facturaId: "f-1",
  numero: 1,
  hastaAt: new Date("2026-11-16T06:00:00.000Z"),
  saldo: "1000.00",
  fechaLimite: "2026-11-23",
  venceAt: new Date("2026-11-24T06:00:00.000Z"),
  vencida: true,
};
const EN_PLAZO: FilaMora = {
  facturaId: "f-2",
  numero: 2,
  hastaAt: new Date("2026-11-20T06:00:00.000Z"),
  saldo: "250.50",
  fechaLimite: "2026-11-27",
  venceAt: new Date("2026-11-28T06:00:00.000Z"),
  vencida: false,
};

type Repo = { [K in keyof IMoraEmpresaRepository]: ReturnType<typeof vi.fn> };

/** Un doble que lanza en todo lo que no se le prepara: así «sin llamadas» se ve en el `calls` y en el error. */
function repoDoble(over: Partial<Repo> = {}): Repo & IMoraEmpresaRepository {
  const prohibido = () => vi.fn(async () => Promise.reject(new Error("no debía llamarse")));
  const repo: Repo = {
    moraDeLaEmpresa: prohibido(),
    graciaDeLaEmpresa: prohibido(),
    estaCongelada: prohibido(),
    moraParaPlataforma: prohibido(),
    fijarGracia: prohibido(),
    descongelarAMano: prohibido(),
    existeEmpresa: vi.fn(async () => true),
    empresasConMora: prohibido(),
    congelarSiVencida: prohibido(),
    encolarRecordatorios: prohibido(),
    ...over,
  };
  return repo as Repo & IMoraEmpresaRepository;
}

const servicio = (repo: IMoraEmpresaRepository) => new MoraEmpresaService(repo, () => AHORA, () => GLOBAL);

function sinLlamadas(repo: Repo) {
  for (const [metodo, fn] of Object.entries(repo)) {
    expect(fn, metodo).not.toHaveBeenCalled();
  }
}

describe("MoraEmpresaService — R4: solo el superadmin, y sin leer nada si no lo es", () => {
  const entradas = {
    moraDeEmpresa: { organizacionId: ORG },
    fijarGracia: { organizacionId: ORG, dias: 15 },
    descongelar: { organizacionId: ORG, motivo: "Acuerdo de pago", hasta: "2026-11-30" },
  } as const;

  for (const [nombre, actor] of [
    ["maestro", MAESTRO],
    ["admin", ADMIN],
    ["mensajero", MENSAJERO],
    ["sin sesión", null],
  ] as const) {
    for (const metodo of Object.keys(entradas) as (keyof typeof entradas)[]) {
      it(`${metodo} con ${nombre} → forbidden sin llamar al repositorio`, async () => {
        const repo = repoDoble();
        const r = await servicio(repo)[metodo](actor, entradas[metodo]);
        expect(r).toEqual({ estado: "forbidden" });
        sinLlamadas(repo);
      });
    }
  }

  it("con una entrada inválida y sin permiso, sigue siendo forbidden (quién va antes que qué)", async () => {
    const repo = repoDoble();
    expect(await servicio(repo).fijarGracia(MAESTRO, { organizacionId: ORG, dias: 0 })).toEqual({ estado: "forbidden" });
    expect(await servicio(repo).descongelar(ADMIN, {})).toEqual({ estado: "forbidden" });
    sinLlamadas(repo);
  });
});

describe("MoraEmpresaService.fijarGracia — R3", () => {
  it("guarda un entero de 1 a 60 con el superadmin, el ahora y la gracia global", async () => {
    for (const dias of [1, 15, 60]) {
      const repo = repoDoble({ fijarGracia: vi.fn(async () => "ok") });
      const r = await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: ORG, dias });
      expect(r).toEqual({ estado: "ok" });
      expect(repo.fijarGracia).toHaveBeenCalledWith(ORG, dias, "u-super", AHORA, GLOBAL);
    }
  });

  it("quitarla (dias: null) vuelve a la global", async () => {
    const repo = repoDoble({ fijarGracia: vi.fn(async () => "ok") });
    expect(await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: ORG, dias: null })).toEqual({ estado: "ok" });
    expect(repo.fijarGracia).toHaveBeenCalledWith(ORG, null, "u-super", AHORA, GLOBAL);
  });

  it("un valor igual al actual responde sin_cambio", async () => {
    const repo = repoDoble({ fijarGracia: vi.fn(async () => "sin_cambio") });
    expect(await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: ORG, dias: 15 })).toEqual({ estado: "sin_cambio" });
  });

  it.each([0, 61, 7.5, -3, "15", undefined])("rechaza %s sin tocar el repositorio", async (dias) => {
    const repo = repoDoble({ existeEmpresa: vi.fn(async () => true) });
    const r = await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: ORG, dias });
    expect(r).toEqual({ estado: "validation_error", errores: { dias: MORA_TEXTOS.plataforma.errores.dias } });
    sinLlamadas(repo);
  });

  it("una empresa que no existe responde not_found sin escribir", async () => {
    const repo = repoDoble({ existeEmpresa: vi.fn(async () => false) });
    expect(await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: ORG, dias: 15 })).toEqual({ estado: "not_found" });
    expect(repo.fijarGracia).not.toHaveBeenCalled();
  });

  it("un id que no es uuid responde not_found sin leer", async () => {
    const repo = repoDoble();
    expect(await servicio(repo).fijarGracia(SUPERADMIN, { organizacionId: "x", dias: 15 })).toEqual({ estado: "not_found" });
    sinLlamadas(repo);
  });
});

describe("MoraEmpresaService.descongelar — R22, decisión P4", () => {
  it("descongela con el motivo recortado, la fecha hasta y el mismo ahora", async () => {
    const repo = repoDoble({ descongelarAMano: vi.fn(async () => "ok") });
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "  Acuerdo de pago  ", hasta: "2026-11-30" });
    expect(r).toEqual({ estado: "ok" });
    expect(repo.descongelarAMano).toHaveBeenCalledWith(ORG, "2026-11-30", "Acuerdo de pago", "u-super", AHORA);
  });

  it("acepta los dos extremos: hoy y hoy + 60 de la plataforma", async () => {
    for (const hasta of ["2026-11-24", "2027-01-23"]) {
      const repo = repoDoble({ descongelarAMano: vi.fn(async () => "ok") });
      expect(await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m", hasta })).toEqual({ estado: "ok" });
    }
  });

  it("hoy es el de la plataforma: a las 23:30 de la plataforma (ya el 25 en UTC) ayer no vale y hoy sí", async () => {
    const tarde = new Date("2026-11-25T05:30:00.000Z");
    const repo = repoDoble({ descongelarAMano: vi.fn(async () => "ok") });
    const s = new MoraEmpresaService(repo, () => tarde, () => GLOBAL);
    expect(await s.descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m", hasta: "2026-11-24" })).toEqual({ estado: "ok" });
    expect(await s.descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m", hasta: "2026-11-23" })).toMatchObject({
      estado: "validation_error",
    });
  });

  it.each([
    ["ayer", "2026-11-23"],
    ["hoy + 61", "2027-01-24"],
    ["una fecha que no existe", "2026-02-30"],
    ["otro formato", "30/11/2026"],
  ])("rechaza la fecha hasta %s sin tocar el repositorio", async (_caso, hasta) => {
    const repo = repoDoble();
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "Acuerdo", hasta });
    expect(r).toEqual({ estado: "validation_error", errores: { hasta: MORA_TEXTOS.plataforma.errores.hasta } });
    sinLlamadas(repo);
  });

  it.each([
    ["vacío", ""],
    ["solo espacios", "   "],
    ["de 201 caracteres", "m".repeat(201)],
  ])("rechaza un motivo %s", async (_caso, motivo) => {
    const repo = repoDoble();
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo, hasta: "2026-11-30" });
    expect(r).toEqual({ estado: "validation_error", errores: { motivo: MORA_TEXTOS.plataforma.errores.motivo } });
    sinLlamadas(repo);
  });

  it("acepta un motivo de 200 caracteres", async () => {
    const repo = repoDoble({ descongelarAMano: vi.fn(async () => "ok") });
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m".repeat(200), hasta: "2026-11-30" });
    expect(r).toEqual({ estado: "ok" });
  });

  it("una empresa no congelada responde no_congelada", async () => {
    const repo = repoDoble({ descongelarAMano: vi.fn(async () => "no_congelada") });
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m", hasta: "2026-11-30" });
    expect(r).toEqual({ estado: "no_congelada" });
  });

  it("una empresa que no existe responde not_found, no no_congelada", async () => {
    const repo = repoDoble({ existeEmpresa: vi.fn(async () => false) });
    const r = await servicio(repo).descongelar(SUPERADMIN, { organizacionId: ORG, motivo: "m", hasta: "2026-11-30" });
    expect(r).toEqual({ estado: "not_found" });
    expect(repo.descongelarAMano).not.toHaveBeenCalled();
  });
});

describe("MoraEmpresaService.avisoDeMiEmpresa — R24", () => {
  const mora: MoraLeida = { congeladaAt: null, descongeladaHasta: null, facturas: [VENCIDA] };

  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ] as const)("con %s lee la mora de la empresa de la sesión y devuelve su estado", async (_rol, actor) => {
    const repo = repoDoble({ moraDeLaEmpresa: vi.fn(async () => mora) });
    const r = await servicio(repo).avisoDeMiEmpresa(actor);
    expect(r).toEqual({
      estado: "vencida",
      facturas: [{ facturaId: "f-1", numero: 1, fechaLimite: "2026-11-23", saldo: "1000.00" }],
      saldoVencido: "1000.00",
    });
    expect(repo.moraDeLaEmpresa).toHaveBeenCalledWith(AHORA, GLOBAL);
  });

  it.each([
    ["mensajero", MENSAJERO],
    ["superadmin", SUPERADMIN],
    ["adminTienda", { usuarioId: "u-t", rol: "adminTienda" } as Actor],
    ["sin sesión", null],
  ] as const)("con %s devuelve null sin leer nada", async (_rol, actor) => {
    const repo = repoDoble();
    expect(await servicio(repo).avisoDeMiEmpresa(actor)).toBeNull();
    sinLlamadas(repo);
  });

  it("sin facturas con saldo ni congelamiento, el estado es al_dia (sin banner)", async () => {
    const repo = repoDoble({ moraDeLaEmpresa: vi.fn(async () => ({ congeladaAt: null, descongeladaHasta: null, facturas: [] })) });
    expect(await servicio(repo).avisoDeMiEmpresa(MAESTRO)).toEqual({ estado: "al_dia" });
  });

  it("congelada manda sobre lo demás", async () => {
    const desde = new Date("2026-11-24T06:30:00.000Z");
    const repo = repoDoble({ moraDeLaEmpresa: vi.fn(async () => ({ ...mora, congeladaAt: desde })) });
    expect(await servicio(repo).avisoDeMiEmpresa(ADMIN)).toMatchObject({ estado: "congelada", desde, saldoVencido: "1000.00" });
  });
});

describe("MoraEmpresaService.moraDeEmpresa — R31, R32", () => {
  const historial = [
    {
      id: "h-1",
      accion: "empresa_congelada" as const,
      createdAt: new Date("2026-11-24T06:30:00.000Z"),
      actorNombre: null,
      actorRol: null,
      monto: "1000.00",
      valorAnterior: null,
      valorNuevo: "N.º 1",
    },
  ];

  function leida(over: Partial<MoraParaPlataforma> = {}): MoraParaPlataforma {
    return {
      congeladaAt: null,
      descongeladaHasta: null,
      facturas: [VENCIDA, EN_PLAZO],
      graciaPropia: null,
      historial,
      ...over,
    };
  }

  it("con la gracia global: su valor, el estado, las facturas con saldo, las vencidas, el rango y el historial", async () => {
    const repo = repoDoble({ moraParaPlataforma: vi.fn(async () => leida()) });
    const r = await servicio(repo).moraDeEmpresa(SUPERADMIN, { organizacionId: ORG });
    expect(repo.moraParaPlataforma).toHaveBeenCalledWith(ORG, AHORA, GLOBAL);
    expect(r).toEqual({
      estado: "ok",
      datos: {
        gracia: { dias: 7, origen: "global", propia: null, global: 7 },
        estado: {
          estado: "vencida",
          facturas: [{ facturaId: "f-1", numero: 1, fechaLimite: "2026-11-23", saldo: "1000.00" }],
          saldoVencido: "1000.00",
        },
        facturas: [
          { facturaId: "f-1", numero: 1, fechaLimite: "2026-11-23", saldo: "1000.00", vencida: true },
          { facturaId: "f-2", numero: 2, fechaLimite: "2026-11-27", saldo: "250.50", vencida: false },
        ],
        facturasVencidas: [{ facturaId: "f-1", numero: 1, fechaLimite: "2026-11-23", saldo: "1000.00" }],
        descongelar: { desde: "2026-11-24", hasta: "2027-01-23", porDefecto: "2026-12-01" },
        historial,
      },
    });
  });

  it("con gracia propia la dice como propia", async () => {
    const repo = repoDoble({ moraParaPlataforma: vi.fn(async () => leida({ graciaPropia: 15 })) });
    const r = await servicio(repo).moraDeEmpresa(SUPERADMIN, { organizacionId: ORG });
    expect(r).toMatchObject({ estado: "ok", datos: { gracia: { dias: 15, origen: "propia", propia: 15, global: 7 } } });
  });

  it("descongelada a mano: el estado dice hasta cuándo y las vencidas siguen a la vista", async () => {
    const repo = repoDoble({ moraParaPlataforma: vi.fn(async () => leida({ descongeladaHasta: "2026-11-30" })) });
    const r = await servicio(repo).moraDeEmpresa(SUPERADMIN, { organizacionId: ORG });
    expect(r).toMatchObject({
      estado: "ok",
      datos: {
        estado: { estado: "descongelada_a_mano", hasta: "2026-11-30" },
        facturasVencidas: [{ facturaId: "f-1", saldo: "1000.00" }],
      },
    });
  });

  it("R33: una empresa que no existe responde not_found sin leer su mora", async () => {
    const repo = repoDoble({ existeEmpresa: vi.fn(async () => false) });
    expect(await servicio(repo).moraDeEmpresa(SUPERADMIN, { organizacionId: ORG })).toEqual({ estado: "not_found" });
    expect(repo.moraParaPlataforma).not.toHaveBeenCalled();
  });

  it("un id que no es uuid responde not_found sin leer", async () => {
    const repo = repoDoble();
    expect(await servicio(repo).moraDeEmpresa(SUPERADMIN, { organizacionId: "no-es-uuid" })).toEqual({ estado: "not_found" });
    sinLlamadas(repo);
  });
});
