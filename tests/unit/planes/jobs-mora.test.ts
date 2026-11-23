import { afterEach, describe, expect, it, vi } from "vitest";

import { money } from "@/lib/config/moneda";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import type { EnqueueOpts, IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { IMoraEmpresaRepository, MoraLeida } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { DestinatariosDelAviso } from "@/lib/interfaces/repositories/IPlanesRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";
import type { FilaMora } from "@/lib/planes/mora";
import type { DepsAvisoMora } from "@/lib/planes/jobs-mora";

// SLT-121 · T3.2 (design §4; R7, R9, R26, R27, R28, R29) — la corrida de madrugada de la mora y sus correos, con
// dobles. El SQL (la franja, el congelamiento, la dedupe de los recordatorios) lo prueban
// `tests/integration/repositories/mora-empresa-repository.test.ts` y `tests/integration/db/mora-congelar.test.ts`;
// aquí, que el handler recorre cada empresa con un solo «ahora» y sigue si una falla, que el aviso relee el estado
// antes de enviar, y el registro en la cola.

// Las deps de los handlers cableados: dobles que registran en qué contexto se usan. El resto del módulo es el real.
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const repoCableado: IMoraEmpresaRepository = {
  empresasConMora: async (...args) => {
    llamadas.push({ metodo: "empresasConMora", contexto: contextoActual(), args });
    return ["org-a", "org-b"];
  },
  congelarSiVencida: async (...args) => {
    llamadas.push({ metodo: "congelarSiVencida", contexto: contextoActual(), args });
    return { resultado: "al_dia" };
  },
  encolarRecordatorios: async (...args) => {
    llamadas.push({ metodo: "encolarRecordatorios", contexto: contextoActual(), args });
    return 0;
  },
  moraDeLaEmpresa: async () => Promise.reject(new Error("no se usa")),
  graciaDeLaEmpresa: async () => Promise.reject(new Error("no se usa")),
  estaCongelada: async () => Promise.reject(new Error("no se usa")),
  moraParaPlataforma: async () => Promise.reject(new Error("no se usa")),
  fijarGracia: async () => Promise.reject(new Error("no se usa")),
  darPlazo: async () => Promise.reject(new Error("no se usa")),
  quitarPlazo: async () => Promise.reject(new Error("no se usa")),
  existeEmpresa: async () => Promise.reject(new Error("no se usa")),
};
let usarRepoDoble = false;
let depsAvisoCableadas: DepsAvisoMora | null = null;

vi.mock("@/lib/planes/jobs-mora", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-mora")>();
  return {
    ...real,
    buildMoraEmpresaRepositoryDeJobs: () => (usarRepoDoble ? repoCableado : real.buildMoraEmpresaRepositoryDeJobs()),
    buildDepsAvisoMora: () => depsAvisoCableadas ?? real.buildDepsAvisoMora(),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const { SIEMBRAS_RECURRENTES } = await import("@/scripts/siembra-jobs-recurrentes");
const {
  DEDUPE_PREFIX_MORA_DIARIA,
  avisoDelPayload,
  crearMoraAvisoHandler,
  crearMoraDiariaHandler,
  dedupeKeyMoraDiaria,
  proximaCorridaMoraDiaria,
  recurrenciaMoraDiaria,
  sembrarMoraDiaria,
} = await import("@/lib/planes/jobs-mora");

afterEach(() => {
  vi.unstubAllEnvs();
});

/** 00:30 del 24 nov de la plataforma (−06:00): la madrugada de la corrida. */
const MADRUGADA = new Date("2026-11-24T06:30:00.000Z");
/** 08:00 del 22 nov de la plataforma: cuando sale el recordatorio de una factura que vence el 23. */
const OCHO_DEL_22 = new Date("2026-11-22T14:00:00.000Z");
const ORG = "org-a";
const FACTURA = "f0000000-0000-4000-8000-000000000001";

function job(extra: Partial<JobDTO> & { organizacionId?: string | null } = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "mora_aviso_correo",
    payload: { tipo: "recordatorio", facturaId: FACTURA },
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: OCHO_DEL_22,
    lockedAt: OCHO_DEL_22,
    lastError: null,
    dedupeKey: null,
    createdAt: OCHO_DEL_22,
    updatedAt: OCHO_DEL_22,
    organizacionId: ORG,
    ...extra,
  } as JobDTO;
}

/* -------------------------------------------------------------------------- */
/* mora_diaria                                                                 */
/* -------------------------------------------------------------------------- */

type RepoCorrida = Pick<IMoraEmpresaRepository, "empresasConMora" | "congelarSiVencida" | "encolarRecordatorios">;

function repoCorrida(empresas: string[], over: Partial<RepoCorrida> = {}) {
  return {
    empresasConMora: vi.fn(over.empresasConMora ?? (async () => empresas)),
    congelarSiVencida: vi.fn(over.congelarSiVencida ?? (async () => ({ resultado: "congelada" as const, facturas: [], saldoVencido: "0.00" }))),
    encolarRecordatorios: vi.fn(over.encolarRecordatorios ?? (async () => 1)),
  };
}

describe("SLT-121/R7 — la corrida de madrugada recorre las empresas con mora", () => {
  it("⭑ congela y encola los recordatorios de CADA empresa, con el mismo «ahora» y la misma gracia global", async () => {
    const r = repoCorrida(["org-a", "org-b"]);
    let relojes = 0;
    await crearMoraDiariaHandler(
      r,
      () => {
        relojes += 1;
        return MADRUGADA;
      },
      () => 9,
    )(job({ tipo: "mora_diaria", payload: {}, organizacionId: null }));
    expect(r.congelarSiVencida.mock.calls).toEqual([
      ["org-a", MADRUGADA, 9],
      ["org-b", MADRUGADA, 9],
    ]);
    expect(r.encolarRecordatorios.mock.calls).toEqual([
      ["org-a", MADRUGADA, 9],
      ["org-b", MADRUGADA, 9],
    ]);
    expect(relojes).toBe(1);
  });

  it("R2: sin gracia inyectada usa `FACTURA_DIAS_GRACIA`", async () => {
    vi.stubEnv("FACTURA_DIAS_GRACIA", "15");
    const r = repoCorrida(["org-a"]);
    await crearMoraDiariaHandler(r, () => MADRUGADA)(job());
    expect(r.congelarSiVencida.mock.calls).toEqual([["org-a", MADRUGADA, 15]]);
  });

  it("sin empresas con mora termina bien sin congelar nada", async () => {
    const r = repoCorrida([]);
    await expect(crearMoraDiariaHandler(r, () => MADRUGADA, () => 7)(job())).resolves.toBeUndefined();
    expect(r.congelarSiVencida).not.toHaveBeenCalled();
    expect(r.encolarRecordatorios).not.toHaveBeenCalled();
  });

  it("⭑ R9: repetir la corrida no hace nada más que preguntar a la base, que responde `ya_congelada`", async () => {
    const r = repoCorrida(["org-a"], {
      congelarSiVencida: async () => ({ resultado: "ya_congelada" }),
      encolarRecordatorios: async () => 0,
    });
    const handler = crearMoraDiariaHandler(r, () => MADRUGADA, () => 7);
    await handler(job());
    await handler(job());
    expect(r.congelarSiVencida).toHaveBeenCalledTimes(2);
    expect(await r.congelarSiVencida.mock.results[1]!.value).toEqual({ resultado: "ya_congelada" });
  });
});

describe("SLT-121/R29 — una empresa que falla no frena a las demás", () => {
  it("⭑ sigue con las demás, encola igual los recordatorios de la que falló y DESPUÉS falla con sus ids y causas", async () => {
    const r = repoCorrida(["org-a", "org-b", "org-c"], {
      congelarSiVencida: async (org) => {
        if (org === "org-b") throw new Error("deadlock detectado");
        return { resultado: "al_dia" };
      },
      encolarRecordatorios: async (org) => {
        if (org === "org-c") throw "sin Error";
        return 0;
      },
    });
    const error = await crearMoraDiariaHandler(r, () => MADRUGADA, () => 7)(job()).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/^mora_diaria: fallo en 2 empresa\(s\): org-b, org-c/);
    expect(error?.message).toContain("org-b: congelar: deadlock detectado");
    expect(error?.message).toContain("org-c: recordatorios: sin Error");
    expect(error?.message).not.toContain("org-a");
    expect(r.congelarSiVencida.mock.calls.map((c) => c[0])).toEqual(["org-a", "org-b", "org-c"]);
    expect(r.encolarRecordatorios.mock.calls.map((c) => c[0])).toEqual(["org-a", "org-b", "org-c"]);
  });

  it("un fallo al listar las empresas falla la corrida sin congelar ninguna", async () => {
    const r = repoCorrida([], { empresasConMora: async () => Promise.reject(new Error("base caída")) });
    await expect(crearMoraDiariaHandler(r, () => MADRUGADA, () => 7)(job())).rejects.toThrow(/base caída/);
    expect(r.congelarSiVencida).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* mora_aviso_correo                                                           */
/* -------------------------------------------------------------------------- */

function fila(over: Partial<FilaMora> = {}): FilaMora {
  return {
    facturaId: FACTURA,
    numero: 3,
    hastaAt: new Date("2026-11-16T06:00:00.000Z"),
    saldo: "1234.50",
    fechaLimite: "2026-11-23",
    venceAt: new Date("2026-11-24T06:00:00.000Z"),
    vencida: false,
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

function dobles(o: { mora?: Partial<MoraLeida>; fallanA?: string[]; destino?: DestinatariosDelAviso | null } = {}) {
  const pasos: string[] = [];
  const lecturas: [Date, number][] = [];
  const enviados: EmailMessage[] = [];
  const deps: DepsAvisoMora = {
    mora: {
      moraDeLaEmpresa: async (ahora, gracia) => {
        pasos.push("leer mora");
        lecturas.push([ahora, gracia]);
        return { congeladaAt: null, descongeladaHasta: null, facturas: [fila()], ...o.mora };
      },
    },
    destinatarios: {
      destinatariosDelAviso: async () => {
        pasos.push("leer maestros");
        return o.destino === undefined ? DOS_MAESTROS : o.destino;
      },
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
    urlApp: "https://app.test",
    graciaGlobal: 7,
  };
  return { deps, pasos, lecturas, enviados };
}

const ENVIA_A_LOS_DOS = ["leer mora", "leer maestros", "enviar a@uno.test", "enviar b@uno.test"];

describe("SLT-121/R26 — el recordatorio relee la factura antes de salir", () => {
  it("⭑ la factura sigue con saldo y vence mañana: un correo por maestro, con el saldo y la fecha límite", async () => {
    const d = dobles();
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job());
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.lecturas).toEqual([[OCHO_DEL_22, 7]]);
    expect(d.enviados.map((m) => m.subject)).toEqual(["Tu factura N.º 3 vence mañana", "Tu factura N.º 3 vence mañana"]);
    expect(d.enviados[0]!.text).toContain("Hola, Ana:");
    expect(d.enviados[0]!.text).toContain("vence mañana, 23/11/2026.");
    expect(d.enviados[0]!.text).toContain(`Saldo por pagar: ${money("1234.50")}`);
    expect(d.enviados[0]!.text).toContain("https://app.test/mi-plan");
  });

  it("⭑ una factura ya pagada (sin saldo, fuera de la lista) no sale ni lee los maestros", async () => {
    const d = dobles({ mora: { facturas: [] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job());
    expect(d.pasos).toEqual(["leer mora"]);
    expect(d.enviados).toEqual([]);
  });

  it("si la gracia cambió y la fecha límite ya no es mañana, no sale (la fecha nueva trae su recordatorio)", async () => {
    const d = dobles({ mora: { facturas: [fila({ fechaLimite: "2026-11-30" })] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job());
    expect(d.enviados).toEqual([]);
  });

  it("un recordatorio que llega cuando la factura ya venció no sale", async () => {
    const d = dobles({ mora: { facturas: [fila({ vencida: true })] } });
    await crearMoraAvisoHandler(() => d.deps, () => new Date("2026-11-24T14:00:00.000Z"))(job());
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-121/R27 — el correo de la empresa congelada", () => {
  const congelada = (congeladaAt: Date | null, facturas: FilaMora[]) =>
    dobles({ mora: { congeladaAt, facturas } });
  const jobCongelada = job({ payload: { tipo: "congelada", congeladaAt: MADRUGADA.toISOString() } });

  it("⭑ sigue congelada desde ese instante: lleva las facturas vencidas y su saldo, no las que están en plazo", async () => {
    const d = congelada(MADRUGADA, [
      fila({ numero: 3, saldo: "1000.00", vencida: true }),
      fila({ facturaId: "f2", numero: 5, saldo: "234.50", vencida: true }),
      fila({ facturaId: "f3", numero: 6, saldo: "50.00", vencida: false }),
    ]);
    await crearMoraAvisoHandler(() => d.deps, () => MADRUGADA)(jobCongelada);
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    const m = d.enviados[0]!;
    expect(m.subject).toBe("La operación de Tienda Uno está congelada por falta de pago");
    expect(m.text).toContain(`Factura N.º 3: ${money("1000.00")}`);
    expect(m.text).toContain(`Factura N.º 5: ${money("234.50")}`);
    expect(m.text).not.toContain("Factura N.º 6");
    expect(m.text).toContain(`Saldo vencido: ${money("1234.50")}`);
  });

  it("⭑ ya se descongeló: no sale", async () => {
    const d = congelada(null, [fila({ vencida: true })]);
    await crearMoraAvisoHandler(() => d.deps, () => MADRUGADA)(jobCongelada);
    expect(d.pasos).toEqual(["leer mora"]);
  });

  it("se descongeló y se volvió a congelar otro día: este correo ya no toca (el nuevo trae el suyo)", async () => {
    const d = congelada(new Date("2026-11-27T06:30:00.000Z"), [fila({ vencida: true })]);
    await crearMoraAvisoHandler(() => d.deps, () => MADRUGADA)(jobCongelada);
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-121/R28 — el correo de la operación activa de nuevo", () => {
  it.each([
    { motivo: "pago", frase: "Se registró el pago de las facturas vencidas." },
    { motivo: "gracia", frase: "El plazo de pago cambió y ya no hay facturas vencidas." },
    { motivo: "a_mano", hasta: "2026-12-05", frase: "La plataforma habilitó la operación hasta el 05/12/2026." },
  ])("⭑ por $motivo: sigue sin congelar y sale a cada maestro", async ({ motivo, hasta, frase }) => {
    const d = dobles();
    await crearMoraAvisoHandler(() => d.deps, () => MADRUGADA)(
      job({ payload: { tipo: "descongelada", motivo, ...(hasta ? { hasta } : {}) } }),
    );
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados[0]!.subject).toBe("La operación de Tienda Uno está activa de nuevo");
    expect(d.enviados[0]!.text).toContain(frase);
  });

  it("si la empresa se volvió a congelar antes de enviar, no sale", async () => {
    const d = dobles({ mora: { congeladaAt: MADRUGADA } });
    await crearMoraAvisoHandler(() => d.deps, () => MADRUGADA)(job({ payload: { tipo: "descongelada", motivo: "pago" } }));
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-121/R29 — un envío que falla", () => {
  it("⭑ sigue con los demás maestros y después falla el trabajo, sin el correo en el motivo, para que se reintente", async () => {
    const d = dobles({ fallanA: ["a@uno.test"] });
    const error = await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job()).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toBe("mora_aviso_correo: fallaron 1 de 2 envío(s) a la empresa org-a");
    expect(error?.message).not.toContain("@");
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados.map((m) => m.to)).toEqual(["b@uno.test"]);
  });

  it("el manejador solo LEE la mora: un correo que falla no puede deshacer el congelamiento", () => {
    const d = dobles();
    expect(Object.keys(d.deps.mora)).toEqual(["moraDeLaEmpresa"]);
  });

  it("sin maestros activos termina sin fallar", async () => {
    const d = dobles({ destino: { empresaNombre: "Tienda Uno", maestros: [] } });
    await expect(crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job())).resolves.toBeUndefined();
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-121 — bordes del aviso", () => {
  it("un trabajo sin empresa falla sin leer nada", async () => {
    const d = dobles();
    await expect(crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job({ organizacionId: null }))).rejects.toThrow(
      "mora_aviso_correo: el trabajo no tiene empresa",
    );
    expect(d.pasos).toEqual([]);
  });

  it.each([
    {},
    { tipo: "recordatorio" },
    { tipo: "congelada", congeladaAt: "ayer" },
    { tipo: "descongelada", motivo: "otro" },
    { tipo: "descongelada", motivo: "a_mano", hasta: "05/12/2026" },
    { tipo: "otro" },
  ])("un payload malformado falla con su motivo: %o", async (payload) => {
    const d = dobles();
    await expect(crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job({ payload }))).rejects.toThrow(
      "mora_aviso_correo: el payload no es un aviso de mora válido",
    );
    expect(d.pasos).toEqual([]);
  });

  it("las tres formas del payload de §4.2 se aceptan tal cual", () => {
    expect(avisoDelPayload({ payload: { tipo: "recordatorio", facturaId: FACTURA } })).toEqual({
      tipo: "recordatorio",
      facturaId: FACTURA,
    });
    expect(avisoDelPayload({ payload: { tipo: "congelada", congeladaAt: MADRUGADA.toISOString() } }).tipo).toBe("congelada");
    expect(avisoDelPayload({ payload: { tipo: "descongelada", motivo: "a_mano", hasta: "2026-12-05" } })).toEqual({
      tipo: "descongelada",
      motivo: "a_mano",
      hasta: "2026-12-05",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Registro, recurrencia y siembra                                             */
/* -------------------------------------------------------------------------- */

describe("SLT-121 — registro en la cola (design §4)", () => {
  it("⭑ `mora_diaria`: con handler, RECURRENTE, UNA vez en plataforma, de núcleo y con siembra", () => {
    expect(buildHandlers(() => MADRUGADA).has("mora_diaria")).toBe(true);
    expect(buildRecurrencias().get("mora_diaria")).toBe(recurrenciaMoraDiaria);
    expect(RECURRENTES_DE_PLATAFORMA.has("mora_diaria")).toBe(true);
    expect(MODULO_POR_JOB.mora_diaria).toBe("nucleo");
    const siembra = SIEMBRAS_RECURRENTES.find((s) => s.tipo === "mora_diaria");
    expect(siembra?.sembrar).toBe(sembrarMoraDiaria);
    expect(siembra?.script).toBe("lib/planes/jobs-mora.ts");
  });

  it("⭑ `mora_aviso_correo`: con handler, por evento (no recurrente ni de plataforma) y de núcleo", () => {
    expect(buildHandlers(() => MADRUGADA).has("mora_aviso_correo")).toBe(true);
    expect(buildRecurrencias().has("mora_aviso_correo")).toBe(false);
    expect(RECURRENTES_DE_PLATAFORMA.has("mora_aviso_correo")).toBe(false);
    expect(MODULO_POR_JOB.mora_aviso_correo).toBe("nucleo");
    expect(SIEMBRAS_RECURRENTES.some((s) => s.tipo === "mora_aviso_correo")).toBe(false);
  });

  it("⭑ la corrida cableada recorre las empresas en plataforma con el reloj del drenador", async () => {
    usarRepoDoble = true;
    llamadas.length = 0;
    try {
      await buildHandlers(() => MADRUGADA).get("mora_diaria")!(
        job({ tipo: "mora_diaria", payload: {}, organizacionId: null }),
      );
      expect(llamadas.map((l) => [l.metodo, l.args.slice(0, 2)])).toEqual([
        ["empresasConMora", []],
        ["congelarSiVencida", ["org-a", MADRUGADA]],
        ["encolarRecordatorios", ["org-a", MADRUGADA]],
        ["congelarSiVencida", ["org-b", MADRUGADA]],
        ["encolarRecordatorios", ["org-b", MADRUGADA]],
      ]);
      for (const l of llamadas) expect(l.contexto).toMatchObject({ tipo: "plataforma" });
    } finally {
      usarRepoDoble = false;
    }
  });

  it("⭑ el aviso cableado corre en la empresa del trabajo (`conSuEmpresa`)", async () => {
    const d = dobles();
    const contextos: (ContextoDatos | undefined)[] = [];
    const leer = d.deps.mora.moraDeLaEmpresa;
    d.deps.mora = {
      moraDeLaEmpresa: async (...args) => {
        contextos.push(contextoActual());
        return leer(...args);
      },
    };
    depsAvisoCableadas = d.deps;
    try {
      await buildHandlers(() => OCHO_DEL_22).get("mora_aviso_correo")!(job());
      expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
      expect(contextos[0]).toMatchObject({ organizacionId: ORG });
    } finally {
      depsAvisoCableadas = null;
    }
  });
});

describe("SLT-121 — recurrencia y siembra de `mora_diaria`", () => {
  it.each([
    { caso: "antes de las 06:30 → las 06:30 de ese día", ahora: "2026-11-24T06:29:00.000Z", corrida: "2026-11-24T06:30:00.000Z" },
    { caso: "justo a las 06:30 → el día siguiente", ahora: "2026-11-24T06:30:00.000Z", corrida: "2026-11-25T06:30:00.000Z" },
    { caso: "a las 06:30 y 1 ms → el día siguiente", ahora: "2026-11-24T06:30:00.001Z", corrida: "2026-11-25T06:30:00.000Z" },
    { caso: "el 31 a las 23:59 UTC → el 1 del mes siguiente", ahora: "2026-12-31T23:59:00.000Z", corrida: "2027-01-01T06:30:00.000Z" },
  ])("una vez al día a las 06:30 UTC (00:30 de la plataforma) — $caso", ({ ahora, corrida }) => {
    expect(proximaCorridaMoraDiaria(new Date(ahora)).toISOString()).toBe(corrida);
    const { runAfter, dedupeKey } = recurrenciaMoraDiaria.siguiente(new Date(ahora), []);
    expect(runAfter.toISOString()).toBe(corrida);
    expect(dedupeKey).toBe(`mora_diaria:${corrida.slice(0, 10)}`);
    expect(dedupeKeyMoraDiaria(runAfter)).toBe(dedupeKey);
  });

  it("la recurrencia ignora las zonas de la cola (es de plataforma)", () => {
    const sin = recurrenciaMoraDiaria.siguiente(MADRUGADA, []);
    expect(recurrenciaMoraDiaria.siguiente(MADRUGADA, ["zona-a", "zona-b"])).toEqual(sin);
  });

  it("el despliegue siembra la primera corrida con la MISMA dedupe_key que la recurrencia", async () => {
    const encolados: { tipo: string; payload: Record<string, unknown>; opts?: EnqueueOpts }[] = [];
    const jobs = {
      enqueue: async (tipo: string, payload: Record<string, unknown>, opts?: EnqueueOpts) => {
        encolados.push({ tipo, payload, opts });
        return null;
      },
    } as unknown as IJobRepository;
    await sembrarMoraDiaria(jobs, new Date("2026-11-19T15:47:00.000Z"));
    expect(encolados).toEqual([
      {
        tipo: "mora_diaria",
        payload: {},
        opts: { runAfter: new Date("2026-11-20T06:30:00.000Z"), dedupeKey: "mora_diaria:2026-11-20" },
      },
    ]);
    expect(DEDUPE_PREFIX_MORA_DIARIA).toBe("mora_diaria");
  });
});

/* -------------------------------------------------------------------------- */
/* SLT-255 — los avisos de la prórroga (design §4.1, §4.2)                      */
/* -------------------------------------------------------------------------- */

// Hoy es el 22/11 de la plataforma (`OCHO_DEL_22`): mañana es el 23.
const VENCIDA = fila({ facturaId: "f-vieja", numero: 1, saldo: "500.00", fechaLimite: "2026-11-10", vencida: true });
const prorroga = (cambio: "dada" | "alargada" | "acortada", hasta: string) =>
  job({ payload: { tipo: "prorroga", cambio, hasta } });

describe("SLT-255/R16, R19, R20 — el correo de la prórroga relee el plazo", () => {
  it.each([
    { cambio: "dada", asunto: "Tienes prórroga de pago hasta el 27/11/2026" },
    { cambio: "alargada", asunto: "Tu prórroga de pago cambió: ahora vence el 27/11/2026" },
    { cambio: "acortada", asunto: "Tu prórroga de pago cambió: ahora vence el 27/11/2026" },
  ] as const)("⭑ $cambio: el plazo vigente sigue siendo `hasta` y sale a cada maestro", async ({ cambio, asunto }) => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-27", facturas: [VENCIDA] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(prorroga(cambio, "2026-11-27"));
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados[0]!.subject).toBe(asunto);
    expect(d.enviados[0]!.text).toContain("La plataforma dio a Tienda Uno plazo para pagar");
    expect(d.enviados[0]!.text).toContain("la operación se congela la madrugada siguiente.");
  });

  it("⭑ R19: si la fecha hasta cambió antes de enviar, no sale (el cambio trae su correo)", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-30" } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(prorroga("dada", "2026-11-27"));
    expect(d.pasos).toEqual(["leer mora"]);
  });

  it("⭑ R19: si se quitó (o ya pasó), no sale", async () => {
    for (const descongeladaHasta of [null, "2026-11-21"]) {
      const d = dobles({ mora: { descongeladaHasta } });
      await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(prorroga("dada", "2026-11-21"));
      expect(d.enviados, String(descongeladaHasta)).toEqual([]);
    }
  });

  it("⭑ R19: si la empresa se congeló, no sale aunque la columna conserve la fecha", async () => {
    const d = dobles({ mora: { congeladaAt: MADRUGADA, descongeladaHasta: "2026-11-27" } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(prorroga("dada", "2026-11-27"));
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-255/R17, R19 — el correo de la prórroga quitada", () => {
  const quitada = job({ payload: { tipo: "prorroga_quitada", hasta: "2026-11-27" } });

  it("⭑ con vencidas en el momento del envío: dice que se congela la madrugada siguiente", async () => {
    const d = dobles({ mora: { facturas: [VENCIDA, fila()] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(quitada);
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados[0]!.subject).toBe("Tu prórroga de pago se quitó");
    expect(d.enviados[0]!.text).toContain("La plataforma quitó la prórroga de pago de Tienda Uno.");
    expect(d.enviados[0]!.text).toContain("Como hay facturas vencidas sin pagar, la operación se congela");
  });

  it("⭑ sin vencidas: sale sin decir que se congela", async () => {
    const d = dobles({ mora: { facturas: [fila()] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(quitada);
    expect(d.enviados).toHaveLength(2);
    expect(d.enviados[0]!.text).not.toContain("se congela");
  });

  it("⭑ R19: si se volvió a dar un plazo antes de enviar, no sale", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-29" } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(quitada);
    expect(d.pasos).toEqual(["leer mora"]);
  });

  it("R19: si la empresa se congeló, no sale", async () => {
    const d = dobles({ mora: { congeladaAt: MADRUGADA, facturas: [VENCIDA] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(quitada);
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-255/R18, R19 — la víspera del plazo", () => {
  const vence = (hasta: string) => job({ payload: { tipo: "prorroga_vence", hasta } });

  it("⭑ el plazo vence mañana, sin congelar y con vencidas: sale a cada maestro", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-23", facturas: [VENCIDA] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(vence("2026-11-23"));
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados[0]!.subject).toBe("Tu prórroga de pago vence mañana");
    expect(d.enviados[0]!.text).toContain("La prórroga de pago de Tienda Uno vence mañana, 23/11/2026.");
  });

  it("⭑ R19: si ya no hay vencidas, no sale", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-23", facturas: [fila()] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(vence("2026-11-23"));
    expect(d.pasos).toEqual(["leer mora"]);
  });

  it("⭑ R19: si la fecha hasta cambió o se quitó, no sale", async () => {
    for (const descongeladaHasta of ["2026-11-25", null]) {
      const d = dobles({ mora: { descongeladaHasta, facturas: [VENCIDA] } });
      await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(vence("2026-11-23"));
      expect(d.enviados, String(descongeladaHasta)).toEqual([]);
    }
  });

  it("R19: si la empresa se congeló, no sale", async () => {
    const d = dobles({ mora: { congeladaAt: MADRUGADA, descongeladaHasta: "2026-11-23", facturas: [VENCIDA] } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(vence("2026-11-23"));
    expect(d.enviados).toEqual([]);
  });

  it("un trabajo que llega otro día (`hasta` ya no es mañana) no sale", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-23", facturas: [VENCIDA] } });
    await crearMoraAvisoHandler(() => d.deps, () => new Date("2026-11-23T14:00:00.000Z"))(vence("2026-11-23"));
    expect(d.enviados).toEqual([]);
  });
});

describe("SLT-255/R22 — el recordatorio de la víspera durante el plazo", () => {
  it.each([
    { descongeladaHasta: "2026-11-23", legible: "23/11/2026" },
    { descongeladaHasta: "2026-11-27", legible: "27/11/2026" },
  ])("⭑ plazo hasta $descongeladaHasta cubre la fecha límite: sale sin «se congela»", async ({ descongeladaHasta, legible }) => {
    const d = dobles({ mora: { descongeladaHasta } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job());
    expect(d.pasos).toEqual(ENVIA_A_LOS_DOS);
    expect(d.enviados[0]!.subject).toBe("Tu factura N.º 3 vence mañana");
    expect(d.enviados[0]!.text).toContain(`Tienes prórroga de pago hasta el ${legible}.`);
    expect(d.enviados[0]!.text).not.toContain("se congela");
  });

  it("⭑ plazo vigente anterior a la fecha límite: sale el recordatorio de siempre", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-22" } });
    await crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job());
    expect(d.enviados[0]!.text).not.toContain("prórroga");
    expect(d.enviados[0]!.text).toContain("se congela la madrugada siguiente a la fecha límite.");
  });
});

describe("SLT-255/R20 — un envío de la prórroga que falla", () => {
  it("⭑ sigue con los demás maestros y después falla el trabajo para que la cola lo reintente", async () => {
    const d = dobles({ mora: { descongeladaHasta: "2026-11-27" }, fallanA: ["a@uno.test"] });
    await expect(crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(prorroga("dada", "2026-11-27"))).rejects.toThrow(
      "mora_aviso_correo: fallaron 1 de 2 envío(s) a la empresa org-a",
    );
    expect(d.enviados.map((m) => m.to)).toEqual(["b@uno.test"]);
  });
});

describe("SLT-255 §4.1 — las tres formas nuevas del payload", () => {
  it("⭑ se aceptan tal cual", () => {
    for (const payload of [
      { tipo: "prorroga", cambio: "dada", hasta: "2026-11-27" },
      { tipo: "prorroga", cambio: "alargada", hasta: "2026-11-27" },
      { tipo: "prorroga", cambio: "acortada", hasta: "2026-11-27" },
      { tipo: "prorroga_quitada", hasta: "2026-11-27" },
      { tipo: "prorroga_vence", hasta: "2026-11-27" },
    ]) {
      expect(avisoDelPayload({ payload })).toEqual(payload);
    }
  });

  it.each([
    { tipo: "prorroga", cambio: "dada" },
    { tipo: "prorroga", cambio: "otro", hasta: "2026-11-27" },
    { tipo: "prorroga", cambio: "dada", hasta: "27/11/2026" },
    { tipo: "prorroga_quitada" },
    { tipo: "prorroga_vence", hasta: 20261127 },
  ])("un payload malformado falla sin leer nada: %o", async (payload) => {
    const d = dobles();
    await expect(crearMoraAvisoHandler(() => d.deps, () => OCHO_DEL_22)(job({ payload }))).rejects.toThrow(
      "mora_aviso_correo: el payload no es un aviso de mora válido",
    );
    expect(d.pasos).toEqual([]);
  });
});
