import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { contextoActual } from "@/lib/db/contexto-empresa";
import { hashDireccion } from "@/lib/geo/direccion-query";
import { dedupeKeyGeocodificacion } from "@/lib/services/jobs/geocodificacion-encolado";
import { describe, expect, it } from "vitest";

import { DISTRITOS_DEMO, PAIS_DEMO, claveDeDistritoDemo, puntoDeOrden } from "@/scripts/demo-qa/geografia";
import {
  cerrarJobsSinEjecutar,
  jobsAbiertosPorTipo,
  MOTIVO_CIERRE_SIN_EJECUTAR,
  TIPOS_DE_JOB_ESPERADOS,
  ubicarOrdenes,
  type DepsJobsDemo,
  type JobAbierto,
  type OrdenAUbicar,
} from "@/scripts/demo-qa/ubicar-y-cerrar-jobs";

// SL-43 (design §6; R20, R22, R23) — ubicar las órdenes de la demo y cerrar sus jobs, con dobles. El
// SQL de `jobsAbiertos` (su `WHERE` de empresa y de estado) lo prueba contra Postgres real el test de
// integración de la demo (T10).

const DEMO = "00000000-0000-4000-8000-0000000000d1";
const AHORA = new Date("2026-10-25T15:00:00.000Z");

type Llamada = { op: string; args: unknown[]; empresa: string | undefined };

/** Doble de las dependencias que registra cada llamada y la empresa del contexto en ese momento. */
function dobles(opts: { abiertos?: JobAbierto[]; jobsPorClave?: JobDTO[] } = {}) {
  const llamadas: Llamada[] = [];
  const empresa = () => {
    const c = contextoActual();
    return c?.tipo === "empresa" ? c.organizacionId : undefined;
  };
  const deps: DepsJobsDemo = {
    geocode: {
      guardarResultado: async (...args) => void llamadas.push({ op: "guardarResultado", args, empresa: empresa() }),
    },
    jobs: {
      findByDedupeKeys: async (keys) => {
        llamadas.push({ op: "findByDedupeKeys", args: [keys], empresa: empresa() });
        return (opts.jobsPorClave ?? []).filter((j) => keys.includes(j.dedupeKey ?? ""));
      },
      complete: async (...args) => void llamadas.push({ op: "complete", args, empresa: empresa() }),
      fail: async (...args) => void llamadas.push({ op: "fail", args, empresa: empresa() }),
    },
    jobsAbiertos: async (organizacionId) => {
      llamadas.push({ op: "jobsAbiertos", args: [organizacionId], empresa: empresa() });
      return opts.abiertos ?? [];
    },
  };
  return { deps, llamadas };
}

function job(id: string, dedupeKey: string, estado: JobDTO["estado"] = "pending"): JobDTO {
  return {
    id,
    tipo: "geocodificacion",
    payload: {},
    estado,
    intentos: 0,
    maxIntentos: 8,
    runAfter: AHORA,
    lockedAt: null,
    lastError: null,
    dedupeKey,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

const clave = (id: string, direccion: string) => dedupeKeyGeocodificacion(id, hashDireccion(direccion));

describe("TIPOS_DE_JOB_ESPERADOS", () => {
  it("son exactamente los tres que encola la receta (design §6.2)", () => {
    // Literal a propósito: es el contrato. Añadir un tipo es una decisión, no un efecto colateral.
    expect([...TIPOS_DE_JOB_ESPERADOS].sort()).toEqual(["geocodificacion", "optimizacion_ruta", "push_web"]);
  });
});

describe("ubicarOrdenes (R20)", () => {
  const ordenes: OrdenAUbicar[] = [
    { id: "o1", direccion: "100 m norte de la iglesia", distrito: DISTRITOS_DEMO.central, indice: 0 },
    { id: "o2", direccion: "Frente al parque", distrito: DISTRITOS_DEMO.satelite, indice: 1 },
    { id: "o3", direccion: "   ", distrito: DISTRITOS_DEMO.especial, indice: 0 },
  ];

  it("escribe el punto de su distrito en cada orden y cierra como hecho el job de su clave exacta, en la empresa demo", async () => {
    const { deps, llamadas } = dobles({
      jobsPorClave: [job("j1", clave("o1", ordenes[0].direccion!)), job("j2", clave("o2", ordenes[1].direccion!))],
    });

    expect(await ubicarOrdenes(deps, DEMO, ordenes, AHORA)).toEqual({ ubicadas: 3, jobsGeocodificacionCerrados: 2 });

    const guardadas = llamadas.filter((l) => l.op === "guardarResultado");
    expect(guardadas.map((l) => l.args)).toEqual(
      ordenes.map((o) => [
        o.id,
        { ...puntoDeOrden(o.distrito, o.indice), precision: "APPROXIMATE", status: "OK", geocodedAt: AHORA },
      ]),
    );
    // La dirección vacía no tiene job: no se busca su clave.
    expect(llamadas.find((l) => l.op === "findByDedupeKeys")?.args).toEqual([
      [clave("o1", ordenes[0].direccion!), clave("o2", ordenes[1].direccion!)],
    ]);
    expect(llamadas.filter((l) => l.op === "complete").map((l) => l.args)).toEqual([["j1"], ["j2"]]);
    expect(llamadas.filter((l) => l.op === "fail")).toEqual([]);
    expect(llamadas.every((l) => l.empresa === DEMO)).toBe(true);
  });

  it("no vuelve a cerrar un job que ya no está abierto", async () => {
    const { deps, llamadas } = dobles({ jobsPorClave: [job("j1", clave("o1", ordenes[0].direccion!), "done")] });
    await ubicarOrdenes(deps, DEMO, [ordenes[0]], AHORA);
    expect(llamadas.filter((l) => l.op === "complete")).toEqual([]);
  });

  it("una orden con dirección sin su job de geocodificación lanza (los servicios dejaron de encolarlo)", async () => {
    const { deps } = dobles({ jobsPorClave: [] });
    await expect(ubicarOrdenes(deps, DEMO, [ordenes[0]], AHORA)).rejects.toThrow(/sin su job de geocodificación/);
  });
});

describe("cerrarJobsSinEjecutar (R22, R23)", () => {
  it("cierra todos los abiertos con fail(id, motivo, null), los cuenta por tipo y no reporta tipos nuevos", async () => {
    const abiertos: JobAbierto[] = [
      { id: "a", tipo: "optimizacion_ruta" },
      { id: "b", tipo: "push_web" },
      { id: "c", tipo: "optimizacion_ruta" },
      { id: "d", tipo: "geocodificacion" },
    ];
    const { deps, llamadas } = dobles({ abiertos });

    const r = await cerrarJobsSinEjecutar(deps, DEMO);

    expect(r).toEqual({
      cerradosPorTipo: { optimizacion_ruta: 2, push_web: 1, geocodificacion: 1 },
      tiposNoEsperados: [],
    });
    // runAfter = null: dead-letter `failed`, sin reintento. Con una fecha, el job volvería a `pending`.
    expect(llamadas.filter((l) => l.op === "fail").map((l) => l.args)).toEqual(
      abiertos.map((j) => [j.id, MOTIVO_CIERRE_SIN_EJECUTAR, null]),
    );
    expect(llamadas.find((l) => l.op === "jobsAbiertos")?.args).toEqual([DEMO]);
    expect(llamadas.every((l) => l.empresa === DEMO)).toBe(true);
  });

  it("un tipo no esperado se cierra igual y se devuelve para que la demo salga con 1 nombrándolo", async () => {
    const { deps, llamadas } = dobles({
      abiertos: [
        { id: "a", tipo: "push_web" },
        { id: "w", tipo: "webhook_evento" },
        { id: "x", tipo: "whatsapp_bienvenida" },
      ],
    });

    const r = await cerrarJobsSinEjecutar(deps, DEMO);

    expect(r.tiposNoEsperados).toEqual(["webhook_evento", "whatsapp_bienvenida"]);
    expect(r.cerradosPorTipo).toEqual({ push_web: 1, webhook_evento: 1, whatsapp_bienvenida: 1 });
    expect(llamadas.filter((l) => l.op === "fail").map((l) => l.args[0])).toEqual(["a", "w", "x"]);
  });

  it("sin jobs abiertos no cierra nada", async () => {
    const { deps, llamadas } = dobles();
    expect(await cerrarJobsSinEjecutar(deps, DEMO)).toEqual({ cerradosPorTipo: {}, tiposNoEsperados: [] });
    expect(llamadas.filter((l) => l.op === "fail")).toEqual([]);
  });
});

describe("jobsAbiertosPorTipo (D6.3)", () => {
  it("cuenta por tipo lo que sigue abierto en la empresa demo; vacío si la cola está cerrada", async () => {
    const { deps, llamadas } = dobles({
      abiertos: [
        { id: "a", tipo: "optimizacion_ruta" },
        { id: "b", tipo: "optimizacion_ruta" },
      ],
    });
    expect(await jobsAbiertosPorTipo(deps, DEMO)).toEqual({ optimizacion_ruta: 2 });
    expect(llamadas.every((l) => l.empresa === DEMO)).toBe(true);
    expect(await jobsAbiertosPorTipo(dobles().deps, DEMO)).toEqual({});
  });
});

describe("puntoDeOrden (D22)", () => {
  it("es determinista y queda entre 100 y 200 m del punto del distrito", () => {
    const d = DISTRITOS_DEMO.central;
    for (let i = 0; i < 60; i++) {
      const p = puntoDeOrden(d, i);
      expect(puntoDeOrden(d, i)).toEqual(p);
      const dy = (p.latitud - d.latitud) * 111_320;
      const dx = (p.longitud - d.longitud) * 111_320 * Math.cos((d.latitud * Math.PI) / 180);
      const metros = Math.hypot(dx, dy);
      expect(metros).toBeGreaterThanOrEqual(99);
      expect(metros).toBeLessThanOrEqual(201);
    }
  });

  it("dos órdenes del mismo distrito no caen en el mismo punto", () => {
    const puntos = Array.from({ length: 60 }, (_, i) => JSON.stringify(puntoDeOrden(DISTRITOS_DEMO.satelite, i)));
    expect(new Set(puntos).size).toBe(60);
  });

  it("los tres papeles tienen distritos distintos", () => {
    const codigos = Object.values(DISTRITOS_DEMO).map((d) => d.codigoDta);
    expect(new Set(codigos).size).toBe(3);
  });
});

describe("país de la demo (SL-20, decisión 3; T6.4)", () => {
  it("la demo vive en Costa Rica", () => {
    expect(PAIS_DEMO).toBe("CR");
  });

  it("cada distrito se busca por país CR y código, la clave única del catálogo", () => {
    for (const d of Object.values(DISTRITOS_DEMO)) {
      expect(claveDeDistritoDemo(d)).toEqual({ paisId_codigoDta: { paisId: "CR", codigoDta: d.codigoDta } });
    }
  });
});
