import { describe, expect, it, vi } from "vitest";

import {
  armarPayloads,
  configuracionDelPool,
  copiaCoincide,
  ejecutar,
  exigirSoloLectura,
  leerArgumentos,
  TransaccionNoEsDeSoloLectura,
  type Argumentos,
  type ConsultaSql,
  type LectorDeOrdenes,
  type OrdenLeida,
} from "@/scripts/geo-payloads-contrato-v1";

// SLT-45 T8.2 (design §7.1; R6, R7, R8) — el script de payloads reales, sin base: el lector de
// ordenes y el disco son dobles. Las filas llevan PII inventada pero reconocible, y los ids son
// UUID con forma real: la salida no debe contener ninguno.

const URL_COPIA = "postgresql://servi:<CLAVE>@copia-ensayo.interna:5432/logistic";

function orden(n: number, extra: Partial<OrdenLeida> = {}): OrdenLeida {
  return {
    ordenId: `0000000${n}-aaaa-4aaa-8aaa-00000000000${n}`,
    organizacionId: "11111111-bbbb-4bbb-8bbb-111111111111",
    tiendaId: `2222222${n}-cccc-4ccc-8ccc-22222222222${n}`,
    numRemision: `PEDIDO-SECRETO-${n}`,
    destinatario: `Maria Fernanda Quesada ${n}`,
    telefono: `8877665${n}`,
    direccion: `Del Palo de Mango 300 al sur, casa ${n}`,
    notas: `Llamar a Jorge al 7012345${n}`,
    producto: `Zapatillas Nike Talla ${n}`,
    peso: "1.250",
    montoCobrar: "25900",
    provincia: "Cartago",
    canton: "Paraíso",
    distrito: "Orosi",
    zona: { id: "33333333-dddd-4ddd-8ddd-333333333333", nombre: "Ruta Valle de Orosi", esCentral: false },
    distritoEspecial: true,
    ...extra,
  };
}

const PII_E_IDS = (o: OrdenLeida): string[] => [
  o.ordenId,
  o.organizacionId,
  o.tiendaId,
  o.numRemision,
  o.destinatario,
  o.telefono,
  o.direccion ?? "",
  o.notas ?? "",
  o.producto,
  o.zona?.id ?? "",
  o.zona?.nombre ?? "",
];

function argumentos(extra: Partial<Argumentos> = {}): Argumentos {
  return { copia: "copia-ensayo.interna", muestra: 200, salida: "salida.json", ...extra };
}

function lectorDe(ordenesPorEmpresa: Record<string, OrdenLeida[]>) {
  const lector = {
    empresas: vi.fn(async () => Object.keys(ordenesPorEmpresa)),
    ordenes: vi.fn(async (id: string, maximo: number) => (ordenesPorEmpresa[id] ?? []).slice(0, maximo)),
  } satisfies LectorDeOrdenes;
  return lector;
}

describe("SLT-45 R7 — la salida no lleva datos personales ni ids de origen", () => {
  it("ninguno de los valores personales, ids ni nombres de zona de las filas aparece en el archivo ni en la consola", async () => {
    const ordenes = [
      orden(1),
      orden(2, { organizacionId: "44444444-eeee-4eee-8eee-444444444444", zona: { id: "55555555-ffff-4fff-8fff-555555555555", nombre: "Zona Central Bodega Norte", esCentral: true } }),
    ];
    const lector = lectorDe({ [ordenes[0].organizacionId]: [ordenes[0]], [ordenes[1].organizacionId]: [ordenes[1]] });
    const escrito: string[] = [];
    const r = await ejecutar(argumentos(), { urlDeConexion: URL_COPIA, lector, escribir: (_, c) => escrito.push(c) });

    expect(r.codigoDeSalida).toBe(0);
    expect(escrito).toHaveLength(1);
    const todo = `${escrito[0]}\n${r.lineas.join("\n")}`;
    for (const o of ordenes) {
      for (const valor of PII_E_IDS(o)) expect(todo, `se filtro «${valor}»`).not.toContain(valor);
    }
    // Ni un UUID: los unicos que hay en las filas son ids de la base.
    expect(todo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("sustituye cada campo por el valor sintetico de design §7.1", () => {
    const { payloads } = armarPayloads([orden(1), orden(2, { notas: null })]);
    const fila1 = payloads[0].pasos[0].cuerpo.ordenes[0];
    expect(fila1).toEqual({
      num_remision: "R-1",
      destinatario: "Destinatario 1",
      telefono: "80000001",
      provincia: "Cartago",
      canton: "Paraíso",
      distrito: "Orosi",
      direccion: "Direccion 1",
      producto: "Producto 1",
      peso: "1.250",
      monto_cobrar: "25900",
      notas: "Nota 1",
    });
    // Sin notas en el origen, sin notas en la fila.
    expect(payloads[1].pasos[0].cuerpo.ordenes[0]).not.toHaveProperty("notas");
    expect(payloads[1].pasos[0].cuerpo.ordenes[0].telefono).toBe("80000002");
  });

  it("las zonas salen como zona_{j} con su esCentral, una por zona distinta y por empresa", () => {
    const z = (id: string, esCentral: boolean) => ({ id, nombre: `Nombre ${id}`, esCentral });
    const { payloads, cifras } = armarPayloads([
      orden(1, { zona: z("z-a", true) }),
      orden(2, { zona: z("z-b", false) }),
      orden(3, { zona: z("z-a", true) }),
      // Mismo id de zona en otra empresa: es otra zona.
      orden(4, { organizacionId: "otra", zona: z("z-a", false) }),
      orden(5, { zona: null, distritoEspecial: false }),
    ]);
    expect(payloads.map((p) => p.escenario.zonas.map((zz) => [zz.nombre, zz.esCentral]))).toEqual([
      [["zona_1", true]],
      [["zona_2", false]],
      [["zona_1", true]],
      [["zona_3", false]],
      [],
    ]);
    expect(cifras.zonasDistintas).toBe(3);
  });
});

describe("SLT-45 R6 — un payload de cotizacion y otro de carga por orden, en el formato de la suite", () => {
  it("conserva importes, peso y nombres de la geografia, y cita el distrito en su zona y su marca", () => {
    const o = orden(1, { peso: "0.500", montoCobrar: "12500.5", provincia: "San José", canton: "San José", distrito: "Carmen" });
    const { payloads, cifras } = armarPayloads([o]);
    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(p.pasos.map((s) => s.ruta)).toEqual(["cotizacion", "carga"]);
    expect(p.pasos[0].cuerpo).toEqual(p.pasos[1].cuerpo);
    const fila = p.pasos[1].cuerpo.ordenes[0];
    expect([fila.provincia, fila.canton, fila.distrito, fila.peso, fila.monto_cobrar]).toEqual([
      "San José",
      "San José",
      "Carmen",
      "0.500",
      "12500.5",
    ]);
    expect(p.escenario).toEqual({
      zonas: [{ nombre: "zona_1", esCentral: false, distritos: [["San José", "San José", "Carmen"]] }],
      especiales: [["San José", "San José", "Carmen"]],
    });
    expect(cifras).toEqual({ ordenesLeidas: 1, payloadsEscritos: 1, distritosDistintos: 1, zonasDistintas: 1 });
  });

  it("sin peso ni monto en el origen, la fila no los inventa", () => {
    const fila = armarPayloads([orden(1, { peso: null, montoCobrar: null })]).payloads[0].pasos[0].cuerpo.ordenes[0];
    expect(fila).not.toHaveProperty("peso");
    expect(fila).not.toHaveProperty("monto_cobrar");
  });

  it("los ids de los payloads son unicos y el archivo es una lista JSON", async () => {
    const lector = lectorDe({ e1: [orden(1), orden(2), orden(3)] });
    const escrito: { ruta: string; contenido: string }[] = [];
    await ejecutar(argumentos({ salida: "x/payloads.json" }), {
      urlDeConexion: URL_COPIA,
      lector,
      escribir: (ruta, contenido) => escrito.push({ ruta, contenido }),
    });
    expect(escrito[0].ruta).toBe("x/payloads.json");
    const lista = JSON.parse(escrito[0].contenido) as { id: string }[];
    expect(Array.isArray(lista)).toBe(true);
    expect(new Set(lista.map((p) => p.id)).size).toBe(3);
  });

  it("la muestra es configurable y se reparte entre las empresas", async () => {
    const lector = lectorDe({
      e1: [orden(1), orden(2), orden(3), orden(4)],
      e2: [orden(5), orden(6), orden(7), orden(8)],
    });
    const escrito: string[] = [];
    const r = await ejecutar(argumentos({ muestra: 4 }), { urlDeConexion: URL_COPIA, lector, escribir: (_, c) => escrito.push(c) });
    expect(lector.ordenes.mock.calls).toEqual([
      ["e1", 2],
      ["e2", 2],
    ]);
    expect(JSON.parse(escrito[0])).toHaveLength(4);
    expect(r.lineas).toContain("ordenes leidas=4");
    // Por consola, solo cifras.
    for (const linea of r.lineas) expect(linea).toMatch(/^[a-z ]+=\d+$/);
  });

  it("--muestra se lee, con 200 por defecto, y un valor malo es error de uso", () => {
    expect(leerArgumentos(["--copia", "h"])).toEqual({ copia: "h", muestra: 200, salida: "tests/fixtures/contrato-v1/payloads-reales.json" });
    expect(leerArgumentos(["--copia", "h", "--muestra", "50", "--salida", "o.json"])).toEqual({ copia: "h", muestra: 50, salida: "o.json" });
    expect(leerArgumentos(["--muestra", "0"])).toBeNull();
    expect(leerArgumentos(["--muestra", "10000"])).toBeNull();
    expect(leerArgumentos(["--copia"])).toBeNull();
    expect(leerArgumentos(["--otra", "x"])).toBeNull();
  });
});

describe("SLT-45 R8 — sin --copia, o con otro host, se niega antes de leer ninguna orden", () => {
  const casos: [string, Argumentos, string | undefined][] = [
    ["sin --copia", argumentos({ copia: undefined }), URL_COPIA],
    ["con un host distinto", argumentos({ copia: "otra-copia.interna" }), URL_COPIA],
    ["sin DATABASE_URL", argumentos(), undefined],
    ["con el host del pooler de Supabase en vez del project-ref", argumentos({ copia: "aws-0-us-east-1.pooler.supabase.com" }), "postgresql://postgres.abcdefghij:<CLAVE>@aws-0-us-east-1.pooler.supabase.com:6543/postgres"],
  ];

  for (const [nombre, a, url] of casos) {
    it(`${nombre}: codigo 1, sin llamar al lector ni escribir`, async () => {
      const lector = lectorDe({ e1: [orden(1)] });
      const escribir = vi.fn();
      const r = await ejecutar(a, { urlDeConexion: url, lector, escribir });
      expect(r.codigoDeSalida).toBe(1);
      expect(r.lineas.join("\n")).toMatch(/^Rechazado: --copia/);
      expect(lector.empresas).not.toHaveBeenCalled();
      expect(lector.ordenes).not.toHaveBeenCalled();
      expect(escribir).not.toHaveBeenCalled();
    });
  }

  it("el rechazo no imprime el host real de la conexion", async () => {
    const r = await ejecutar(argumentos({ copia: "otra" }), { urlDeConexion: URL_COPIA, lector: lectorDe({}), escribir: vi.fn() });
    expect(r.lineas.join("\n")).not.toContain("copia-ensayo.interna");
  });

  it("acepta el host de la URL (sin distinguir mayusculas) y, en Supabase, el project-ref", () => {
    expect(copiaCoincide("Copia-Ensayo.Interna", URL_COPIA)).toBe(true);
    expect(copiaCoincide("abcdefghij", "postgresql://postgres.abcdefghij:<CLAVE>@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(copiaCoincide("abcdefghij", "postgresql://postgres:<CLAVE>@db.abcdefghij.supabase.co:5432/postgres")).toBe(true);
  });
});

describe("SLT-45 R6 — las lecturas van en transacciones de solo lectura", () => {
  it("el pool del script abre cada conexion con default_transaction_read_only = on", () => {
    expect(configuracionDelPool(URL_COPIA).options).toContain("default_transaction_read_only=on");
    expect(configuracionDelPool(URL_COPIA).connectionString).toBe(URL_COPIA);
  });

  function tx(soloLectura: string | undefined): ConsultaSql & { sql: string[] } {
    const sql: string[] = [];
    return {
      sql,
      $queryRawUnsafe: <T,>(consulta: string) => {
        sql.push(consulta);
        return Promise.resolve((soloLectura === undefined ? [] : [{ solo_lectura: soloLectura }]) as T);
      },
    };
  }

  it("cada transaccion comprueba transaction_read_only antes de leer, y pasa si es on", async () => {
    const t = tx("on");
    await expect(exigirSoloLectura(t)).resolves.toBeUndefined();
    expect(t.sql).toEqual(["SELECT current_setting('transaction_read_only') AS solo_lectura"]);
  });

  it("si la transaccion admite escrituras, se niega a leer", async () => {
    await expect(exigirSoloLectura(tx("off"))).rejects.toBeInstanceOf(TransaccionNoEsDeSoloLectura);
    await expect(exigirSoloLectura(tx(undefined))).rejects.toBeInstanceOf(TransaccionNoEsDeSoloLectura);
  });
});
