import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import type { DestinatariosDelAviso } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";
import type { FacturaEmitidaContexto } from "@/lib/notificaciones/emitir";
import type { DepsAvisoFactura } from "@/lib/planes/jobs-factura-aviso";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";
import { money } from "@/lib/config/moneda";

// SLT-136 · T5.5 y T6.2 (design §7.2; R22, R24–R28, R30) — el trabajo `factura_plataforma_aviso`. Con dobles:
// emite el aviso de la campanita una vez y después envía un correo por maestro, en el orden de §7.2; un envío que
// falla no corta los demás y falla el trabajo sin el correo en el motivo; no hace nada con una factura que ya no
// está o no está cerrada; sin maestros termina con el aviso y sin correos; un aviso que lanza falla el trabajo antes
// de enviar; y el tipo está registrado en la cola, de núcleo y no recurrente.

// Las deps del handler cableado: un doble que registra en qué contexto se usan. El resto del módulo es el real.
const registro: { paso: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
let depsCableadas: DepsAvisoFactura | null = null;

vi.mock("@/lib/planes/jobs-factura-aviso", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-factura-aviso")>();
  return {
    ...real,
    buildDepsAvisoFactura: () => depsCableadas ?? real.buildDepsAvisoFactura(),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const { crearFacturaAvisoHandler, facturaDelPayload } = await import("@/lib/planes/jobs-factura-aviso");

const AHORA = new Date("2026-12-01T06:20:00.000Z");
const ORG = "org-a";
const ID = "f0000000-0000-4000-8000-000000000001";

function job(extra: Partial<JobDTO> & { organizacionId?: string | null } = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "factura_plataforma_aviso",
    payload: { facturaId: ID },
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: `factura_plataforma_aviso:${ID}`,
    createdAt: AHORA,
    updatedAt: AHORA,
    organizacionId: ORG,
    ...extra,
  } as JobDTO;
}

function factura(over: Partial<FacturaPlataformaDTO> = {}): FacturaPlataformaDTO {
  return {
    id: ID,
    estado: "cerrada",
    numero: 2,
    desde: new Date("2026-11-16T06:00:00.000Z"),
    hasta: new Date("2026-12-01T06:00:00.000Z"),
    hastaPrevisto: false,
    periodicidad: "quincenal",
    plan: null,
    cargos: "600.00",
    reversos: "300.00",
    movimientos: 3,
    totalOrdenes: "300.00",
    cuota: null,
    primeraCuota: null,
    total: "300.00",
    cerradaAt: new Date("2026-12-01T06:10:00.000Z"),
    ...over,
  };
}

const DOS_MAESTROS: DestinatariosDelAviso = {
  empresaNombre: "Tienda Uno",
  maestros: [
    { email: "a@uno.test", nombre: "Ana" },
    { email: "b@uno.test", nombre: "Beto" },
  ],
};

interface Dobles {
  deps: DepsAvisoFactura;
  pasos: string[];
  avisos: FacturaEmitidaContexto[];
  consultas: [string, string | null][];
  enviados: EmailMessage[];
}

function dobles(o: {
  facturas?: FacturaPlataformaDTO[];
  destino?: DestinatariosDelAviso | null;
  emitir?: (ctx: FacturaEmitidaContexto) => Promise<number>;
  /** Los destinatarios cuyo envío lanza. */
  fallanA?: string[];
  urlApp?: string | null;
  /** SLT-121 R25: la gracia vigente de la empresa. */
  gracia?: number;
} = {}): Dobles {
  const enviados: EmailMessage[] = [];
  const pasos: string[] = [];
  const avisos: FacturaEmitidaContexto[] = [];
  const consultas: [string, string | null][] = [];
  const deps: DepsAvisoFactura = {
    facturas: {
      deLaEmpresa: async () => {
        pasos.push("leer factura");
        registro.push({ paso: "deLaEmpresa", contexto: contextoActual(), args: [] });
        return o.facturas ?? [factura()];
      },
    },
    destinatarios: {
      destinatariosDelAviso: async (org, cambio) => {
        pasos.push("leer maestros");
        consultas.push([org, cambio]);
        return o.destino === undefined ? DOS_MAESTROS : o.destino;
      },
    },
    emitirAviso: async (ctx) => {
      pasos.push("aviso");
      avisos.push(ctx);
      return o.emitir ? o.emitir(ctx) : 1;
    },
    sender: {
      enviar: async (m) => {
        pasos.push(`enviar ${m.to}`);
        if (o.fallanA?.includes(m.to)) throw new Error(`SMTP rechazó ${m.to}`);
        enviados.push(m);
        return { messageId: null };
      },
    },
    contacto: "soporte@plataforma.test",
    urlApp: o.urlApp === undefined ? "https://app.test" : o.urlApp,
    graciaDeLaEmpresa: async () => {
      pasos.push("leer gracia");
      return o.gracia ?? 7;
    },
  };
  return { deps, pasos, avisos, consultas, enviados };
}

describe("SLT-136/R22 — el trabajo avisa una vez, en el orden de §7.2", () => {
  it("⭑ lee la factura, crea el aviso con su número y su período, lee los maestros activos y les envía el correo", async () => {
    const d = dobles();
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros", "leer gracia", "enviar a@uno.test", "enviar b@uno.test"]);
    expect(d.avisos).toEqual([
      {
        facturaId: ID,
        numero: 2,
        desde: new Date("2026-11-16T06:00:00.000Z"),
        hasta: new Date("2026-12-01T06:00:00.000Z"),
      },
    ]);
    // R24: los destinatarios son los maestros de ESA empresa, sin cambio pendiente (null).
    expect(d.consultas).toEqual([[ORG, null]]);
  });

  it("⭑ R22: un aviso que lanza falla el trabajo antes de leer los destinatarios (se reintenta)", async () => {
    const d = dobles({ emitir: async () => Promise.reject(new Error("base caida")) });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).rejects.toThrow("base caida");
    expect(d.pasos).toEqual(["leer factura", "aviso"]);
    expect(d.enviados).toEqual([]);
  });

  it("R22: el reintento vuelve a pedir el aviso; la dedupe por factura del emisor lo absorbe (0 filas) sin fallar", async () => {
    let veces = 0;
    const d = dobles({ emitir: async () => (veces++ === 0 ? 1 : 0) });
    const handler = crearFacturaAvisoHandler(() => d.deps);
    await handler(job());
    await handler(job());
    expect(d.avisos.map((a) => a.facturaId)).toEqual([ID, ID]);
  });
});

describe("SLT-136/R26 — un correo por maestro, con la plantilla de la factura", () => {
  it("⭑ cada maestro recibe el suyo: su nombre, el número, el período, el total y el botón a «Mi plan»", async () => {
    const d = dobles();
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.enviados.map((m) => m.to)).toEqual(["a@uno.test", "b@uno.test"]);
    const [ana, beto] = d.enviados;
    expect(ana!.subject).toBe("Factura N.º 2 de la plataforma — Tienda Uno");
    expect(ana!.text).toContain("Hola, Ana:");
    expect(beto!.text).toContain("Hola, Beto:");
    expect(ana!.text).toContain("16/11/2026 al 30/11/2026");
    expect(ana!.text).toContain(`Total a pagar: ${money("300.00")}`);
    expect(ana!.text).toContain("https://app.test/mi-plan");
    expect(ana!.text).toContain("soporte@plataforma.test");
  });

  it("R29: sin la URL de la app, el correo sale sin botón y dice dónde está la factura", async () => {
    const d = dobles({ urlApp: null });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.enviados).toHaveLength(2);
    expect(d.enviados[0]!.text).not.toContain("/mi-plan");
    expect(d.enviados[0]!.text).toContain("Encuéntrala en Mi plan, dentro de la app.");
  });
});

describe("SLT-136/R27 — un envío que falla", () => {
  it("⭑ sigue con los demás maestros y después falla el trabajo, sin el correo en el motivo", async () => {
    const d = dobles({ fallanA: ["a@uno.test"] });
    const error = await crearFacturaAvisoHandler(() => d.deps)(job()).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toBe("factura_plataforma_aviso: fallaron 1 de 2 envío(s) a la empresa org-a");
    expect(error?.message).not.toContain("@");
    expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros", "leer gracia", "enviar a@uno.test", "enviar b@uno.test"]);
    expect(d.enviados.map((m) => m.to)).toEqual(["b@uno.test"]);
  });

  it("⭑ el reintento vuelve a pedir el aviso, que la dedupe absorbe (0 filas): no hay segunda campanita", async () => {
    let filas = 0;
    let veces = 0;
    const d = dobles({
      fallanA: ["a@uno.test"],
      emitir: async () => {
        const n = veces++ === 0 ? 1 : 0;
        filas += n;
        return n;
      },
    });
    const handler = crearFacturaAvisoHandler(() => d.deps);
    await expect(handler(job())).rejects.toThrow("fallaron 1 de 2");
    await expect(handler(job())).rejects.toThrow("fallaron 1 de 2");
    expect(veces).toBe(2);
    expect(filas).toBe(1);
  });
});

describe("SLT-136/R25 — una factura de ₡0 avisa igual", () => {
  it("⭑ con total 0 y sin movimientos, el aviso sale por el mismo camino", async () => {
    const d = dobles({
      facturas: [factura({ cargos: "0.00", reversos: "0.00", movimientos: 0, totalOrdenes: "0.00", total: "0.00" })],
    });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros", "leer gracia", "enviar a@uno.test", "enviar b@uno.test"]);
    expect(d.avisos).toHaveLength(1);
    // R25 + R26: el correo también sale, con sus importes en cero.
    expect(d.enviados).toHaveLength(2);
    expect(d.enviados[0]!.text).toContain(`Total a pagar: ${money("0.00")}`);
  });
});

describe("SLT-136/R28 — sin maestros o sin factura", () => {
  it("⭑ sin maestros activos: crea el aviso y termina sin fallar ni enviar correos", async () => {
    const d = dobles({ destino: { empresaNombre: "Tienda Uno", maestros: [] } });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).resolves.toBeUndefined();
    expect(d.avisos).toHaveLength(1);
    expect(d.enviados).toEqual([]);
  });

  it("sin destinatarios (la empresa ya no se lee): crea el aviso y termina", async () => {
    const d = dobles({ destino: null });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).resolves.toBeUndefined();
    expect(d.avisos).toHaveLength(1);
  });

  it("⭑ la factura ya no existe: termina sin avisar ni leer maestros", async () => {
    const d = dobles({ facturas: [factura({ id: "otra" })] });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura"]);
    expect(d.avisos).toEqual([]);
    expect(d.enviados).toEqual([]);
  });

  it("una factura que no está cerrada (en curso o por cerrar) no avisa", async () => {
    for (const estado of ["en_curso", "por_cerrar"] as const) {
      const d = dobles({ facturas: [factura({ estado, numero: null })] });
      await crearFacturaAvisoHandler(() => d.deps)(job());
      expect(d.avisos, estado).toEqual([]);
    }
  });
});

describe("SLT-136 — bordes del trabajo", () => {
  it("un payload sin el id de la factura falla con su motivo", async () => {
    const d = dobles();
    await expect(crearFacturaAvisoHandler(() => d.deps)(job({ payload: {} }))).rejects.toThrow(
      "factura_plataforma_aviso: el payload no trae el id de la factura",
    );
    expect(() => facturaDelPayload({ payload: { facturaId: "" } })).toThrow();
    expect(d.pasos).toEqual([]);
  });

  it("un trabajo sin empresa falla sin leer nada", async () => {
    const d = dobles();
    await expect(crearFacturaAvisoHandler(() => d.deps)(job({ organizacionId: null }))).rejects.toThrow(
      "factura_plataforma_aviso: el trabajo no tiene empresa",
    );
    expect(d.pasos).toEqual([]);
  });

  it("R24: el manejador no envía nada a otro rol: solo usa el emisor del maestro y los maestros", () => {
    const fuente = readFileSync(path.join(__dirname, "..", "..", "..", "lib", "planes", "jobs-factura-aviso.ts"), "utf8");
    expect(fuente).not.toMatch(/"admin"|"superadmin"|destinatariosAlerta/);
  });
});

describe("SLT-136/R30 — en la cola: con manejador, de núcleo y no recurrente", () => {
  it("⭑ `buildHandlers` lo registra y no es recurrente ni de plataforma", () => {
    expect(buildHandlers(() => AHORA).has("factura_plataforma_aviso")).toBe(true);
    expect(buildRecurrencias().has("factura_plataforma_aviso")).toBe(false);
    expect(RECURRENTES_DE_PLATAFORMA.has("factura_plataforma_aviso")).toBe(false);
  });

  it("⭑ es de núcleo: ningún módulo apagado lo descarta", () => {
    expect(MODULO_POR_JOB.factura_plataforma_aviso).toBe("nucleo");
  });

  it("⭑ el handler cableado corre en la empresa del trabajo (`conSuEmpresa`)", async () => {
    const d = dobles();
    depsCableadas = d.deps;
    registro.length = 0;
    try {
      await buildHandlers(() => AHORA).get("factura_plataforma_aviso")!(job());
      expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros", "leer gracia", "enviar a@uno.test", "enviar b@uno.test"]);
      expect(registro[0]?.contexto).toMatchObject({ organizacionId: ORG });
    } finally {
      depsCableadas = null;
    }
  });
});

describe("SLT-121/R25 — el correo de cierre lleva la fecha límite con la gracia de la empresa", () => {
  it("⭑ lee la gracia vigente de la empresa y se la pasa a la plantilla: 15 días desde el 1 dic", async () => {
    const d = dobles({ gracia: 15 });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.enviados).toHaveLength(2);
    expect(d.enviados[0]!.text).toContain("Paga hasta el 16/12/2026.");
    expect(d.enviados[1]!.text).toContain("Paga hasta el 16/12/2026.");
  });

  it("con la global (7) dice el 8 dic; con total 0 no hay fecha", async () => {
    const d = dobles();
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.enviados[0]!.text).toContain("Paga hasta el 08/12/2026.");
    const cero = dobles({ facturas: [factura({ total: "0.00" })] });
    await crearFacturaAvisoHandler(() => cero.deps)(job());
    expect(cero.enviados[0]!.text).not.toContain("Paga hasta");
  });

  it("sin maestros no lee la gracia", async () => {
    const d = dobles({ destino: { empresaNombre: "Tienda Uno", maestros: [] } });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).not.toContain("leer gracia");
  });
});
