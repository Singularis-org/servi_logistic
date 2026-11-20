import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-60 (design §4.6; R16, R20, R24) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa
// (molde `planes.composition-root.test.ts`). Se mockea solo `getPrismaClient`, con un cliente falso que
// responde a `$queryRaw` lo que la base respondería, y se llaman las actions reales sin servicio inyectado.
// Si el root montara el servicio con otro repositorio, o con ninguno, el cliente falso no vería las llamadas
// y el mapeo del DTO no saldría.
//
// El comprobante (design §4.8; R33, R34): el cliente falso responde también `walletMovimiento.findFirst` (el
// pago, por el repositorio real) y `walletComprobante.findFirst` (el lateral, por `WalletComprobanteRepository`
// real), y se mockea el adaptador de Storage para ver con qué bucket se construye y con qué TTL firma.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PAGO = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";
const F1 = "11111111-2222-4333-8444-555555555555";

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: RolValue.superadmin, organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: RolValue.maestro, organizacionId: ORG };

const queryRaw = vi.fn<(sql: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown[]>>();
const findFirstPago = vi.fn<(args: unknown) => Promise<unknown>>();
const findFirstComprobante = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    $queryRaw: queryRaw,
    walletMovimiento: { findFirst: findFirstPago },
    walletComprobante: { findFirst: findFirstComprobante },
  }),
  PRISMA_OMIT: {},
}));

const BUCKET = "bucket-de-la-wallet";
const TTL = 777;
// SLT-143: el resto del módulo (tipos admitidos, tope de bytes) es el real; el comprobante del registro lo valida.
vi.mock("@/lib/config/wallet-comprobante", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/config/wallet-comprobante")>();
  return { ...real, walletComprobanteConfig: { ...real.walletComprobanteConfig, BUCKET, SIGNED_URL_TTL_SECONDS: TTL } };
});

// SLT-143 (design §4.4; R8, R9): el almacenamiento real del comprobante, con un cliente que anota el bucket, la
// empresa del contexto y lo que se sube o se borra.
const almacen: { op: "subir" | "borrar"; bucket: string; ruta: string; empresa: string | null }[] = [];
vi.mock("@/lib/storage/SupabaseFileStorage", async () => {
  const { contextoActual } = await import("@/lib/db/contexto-empresa");
  const empresa = () => {
    const c = contextoActual();
    return c?.tipo === "empresa" ? c.organizacionId : null;
  };
  return {
    SupabaseFileStorage: class {
      constructor(
        _storage: unknown,
        private readonly bucket: string,
      ) {}
      async upload(input: { path: string }): Promise<string> {
        almacen.push({ op: "subir", bucket: this.bucket, ruta: input.path, empresa: empresa() });
        return input.path;
      }
      async remove(rutas: string[]): Promise<void> {
        for (const ruta of rutas) almacen.push({ op: "borrar", bucket: this.bucket, ruta, empresa: empresa() });
      }
    },
  };
});

// SLT-143 (R7): las reglas del país que construye el composition root, con el cliente que recibe y la empresa del
// contexto en la que leen la zona.
const reglasConstruidas: unknown[] = [];
const zonasLeidas: (string | null)[] = [];
vi.mock("@/lib/services/ReglasPaisEmpresaService", async () => {
  const { contextoActual } = await import("@/lib/db/contexto-empresa");
  return {
    construirReglasPaisEmpresa: (prisma: unknown) => {
      reglasConstruidas.push(prisma);
      return {
        zonaHoraria: async () => {
          const c = contextoActual();
          zonasLeidas.push(c?.tipo === "empresa" ? c.organizacionId : null);
          return "America/Costa_Rica";
        },
      };
    },
  };
});

const firmas: { bucket: string; ruta: string; segundos: number; empresa: string | null }[] = [];
vi.mock("@/lib/storage/SupabaseSignedUrlProvider", async () => {
  const { contextoActual } = await import("@/lib/db/contexto-empresa");
  return {
    SupabaseSignedUrlProvider: class {
      constructor(
        _storage: unknown,
        private readonly bucket: string,
      ) {}
      async createSignedUrl(ruta: string, segundos: number): Promise<string> {
        const c = contextoActual();
        firmas.push({ bucket: this.bucket, ruta, segundos, empresa: c?.tipo === "empresa" ? c.organizacionId : null });
        return "https://storage.test/firmada";
      }
    },
  };
});

const acciones = await import("@/lib/actions/pagos-plataforma");

/** El texto del SQL de la llamada `n` (los trozos de la plantilla, unidos). */
const sqlDe = (n: number) => queryRaw.mock.calls[n][0].join("?");

beforeEach(() => {
  queryRaw.mockReset();
  findFirstPago.mockReset();
  findFirstComprobante.mockReset();
  firmas.length = 0;
  almacen.length = 0;
  reglasConstruidas.length = 0;
  zonasLeidas.length = 0;
});

describe("SLT-60 — verPagosDeEmpresaAction usa PagoPlataformaConfirmacionRepository (R12, R14, R32)", () => {
  it("sin deps.service, lee por el repositorio real y mapea su jsonb al DTO", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        pagos: [
          {
            id: PAGO,
            monto: "300000",
            fecha: "2026-11-18T12:00:00",
            referencia: "Transferencia 123",
            registrado_por: "Ana Pérez",
            tiene_comprobante: true,
          },
        ],
        // Según el driver, el jsonb puede llegar como texto.
        facturas: JSON.stringify([
          { id: F1, numero: 1, desde: "2026-11-01T06:00:00", hasta: "2026-11-16T06:00:00", total: "200000.00", saldo: "200000" },
        ]),
        confirmados: [],
      },
    ]);
    const r = await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, { getActor: async () => SUPERADMIN });
    expect(r).toEqual({
      estado: "ok",
      datos: {
        pagos: [
          {
            id: PAGO,
            monto: "300000.00",
            fecha: new Date("2026-11-18T12:00:00Z"),
            referencia: "Transferencia 123",
            registradoPor: "Ana Pérez",
            tieneComprobante: true,
          },
        ],
        facturas: [
          {
            id: F1,
            numero: 1,
            desde: new Date("2026-11-01T06:00:00Z"),
            hasta: new Date("2026-11-16T06:00:00Z"),
            total: "200000.00",
            saldo: "200000.00",
          },
        ],
        confirmados: [],
      },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlDe(0);
    expect(sql).toContain("pago_plataforma_por_confirmar(");
    expect(sql).toContain("factura_plataforma_saldos(");
    // Solo las facturas con saldo (R15, R18, R31).
    expect(sql).toContain('s."saldo" > 0');
    // Todos los valores de texto interpolados son la empresa pedida: nada más llega de fuera. (El otro valor
    // es el fragmento del nombre completo, `Prisma.raw` de un literal del código.)
    const textos = queryRaw.mock.calls[0].slice(1).filter((v) => typeof v === "string");
    expect(textos.length).toBeGreaterThan(0);
    expect(new Set(textos)).toEqual(new Set([ORG]));
  });

  it("si la base devuelve otra forma, lanza (la página lo pinta como «No se pudieron cargar», R13)", async () => {
    queryRaw.mockResolvedValueOnce([{ pagos: [{ id: PAGO }], facturas: [], confirmados: [] }]);
    await expect(
      acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, { getActor: async () => SUPERADMIN }),
    ).rejects.toThrow(/forma inesperada/);
  });
});

describe("SLT-60 — confirmarPagoPlataformaAction usa PagoPlataformaConfirmacionRepository (R16, R20)", () => {
  const entrada = { organizacionId: ORG, pagoId: PAGO, aplicaciones: [{ facturaId: F1, monto: "300000.00" }] };

  it("R16: sin deps.service, confirma por la función de la base con el superadmin de la sesión", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({ estado: "ok" });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlDe(0)).toContain("pago_plataforma_confirmar(");
    const [, org, pago, aplicaciones, por] = queryRaw.mock.calls[0];
    expect([org, pago, por]).toEqual([ORG, PAGO, "u-sa"]);
    expect(JSON.parse(aplicaciones as string)).toEqual([{ factura_id: F1, monto: "300000.00" }]);
  });

  it("R19: ya_confirmado de la base llega tal cual", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ya_confirmado" }]);
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "ya_confirmado",
    });
  });

  it("R20: el rechazo SL060 pago_no_encontrado (P2010 del SQL a mano) es not_found", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error('Raw query failed. Code: `SL060`. Message: `{"codigo": "pago_no_encontrado"}`'), { code: "P2010" }),
    );
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "not_found",
    });
  });

  it("R17: el rechazo SL060 supera_saldo (error del driver) es validation_error bajo su factura", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error("driver"), {
        name: "DriverAdapterError",
        cause: { kind: "postgres", code: "SL060", originalCode: "SL060", message: `{"codigo": "supera_saldo", "factura_id": "${F1}"}` },
      }),
    );
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${F1}`]: "El monto supera el saldo de la factura." },
    });
  });

  it("otro error de la base no se traga", async () => {
    const otro = Object.assign(new Error("driver"), { cause: { kind: "postgres", code: "40P01", message: "deadlock" } });
    queryRaw.mockRejectedValueOnce(otro);
    await expect(acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).rejects.toBe(otro);
  });
});

describe("SLT-60 — solo el superadmin (R24)", () => {
  it("R24: un maestro recibe forbidden en las dos actions sin tocar el cliente", async () => {
    const deps = { getActor: async () => MAESTRO };
    expect(await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, deps)).toEqual({ estado: "forbidden" });
    expect(
      await acciones.confirmarPagoPlataformaAction({ organizacionId: ORG, pagoId: PAGO, aplicaciones: [] }, deps),
    ).toEqual({ estado: "forbidden" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("R24: sin sesión, forbidden sin tocar el cliente", async () => {
    const deps = { getActor: async () => null };
    expect(await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, deps)).toEqual({ estado: "forbidden" });
    expect(await acciones.confirmarPagoPlataformaAction({}, deps)).toEqual({ estado: "forbidden" });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("SLT-60 — verComprobantePagoPlataformaAction cablea el comprobante real (R33, R34)", () => {
  const RUTA = "caja/0a1b2c3d.png";

  it("R33: sin deps.service, lee el pago y el lateral por los repositorios reales y firma con el bucket y el TTL de la wallet", async () => {
    findFirstPago.mockResolvedValueOnce({ id: PAGO });
    findFirstComprobante.mockResolvedValueOnce({ storagePath: RUTA, contentType: "application/pdf" });
    const r = await acciones.verComprobantePagoPlataformaAction(ORG, PAGO, { getActor: async () => SUPERADMIN });
    expect(r).toEqual({ estado: "ok", url: "https://storage.test/firmada", contentType: "application/pdf" });
    expect(findFirstPago).toHaveBeenCalledWith({
      where: { id: PAGO, organizacionId: ORG, tipo: "egreso", categoria: "egreso_pago_plataforma" },
      select: { id: true },
    });
    expect(findFirstComprobante).toHaveBeenCalledWith({
      where: { cajaMovimientoId: PAGO },
      select: { storagePath: true, contentType: true },
    });
    expect(firmas).toEqual([{ bucket: BUCKET, ruta: RUTA, segundos: TTL, empresa: ORG }]);
    expect(JSON.stringify(r)).not.toContain(RUTA);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("R34: un movimiento que no es un pago a la plataforma de la empresa → not_found, sin buscar el archivo", async () => {
    findFirstPago.mockResolvedValueOnce(null);
    expect(await acciones.verComprobantePagoPlataformaAction(ORG, PAGO, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "not_found",
    });
    expect(findFirstComprobante).not.toHaveBeenCalled();
    expect(firmas).toEqual([]);
  });

  it("R34: un pago sin comprobante → sin_comprobante, sin firmar", async () => {
    findFirstPago.mockResolvedValueOnce({ id: PAGO });
    findFirstComprobante.mockResolvedValueOnce(null);
    expect(await acciones.verComprobantePagoPlataformaAction(ORG, PAGO, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "sin_comprobante",
    });
    expect(firmas).toEqual([]);
  });

  it.each([
    ["un maestro", MAESTRO],
    ["sin sesión", null],
  ] as const)("R34: %s recibe forbidden sin tocar el cliente ni firmar", async (_quien, actor) => {
    expect(await acciones.verComprobantePagoPlataformaAction(ORG, PAGO, { getActor: async () => actor })).toEqual({
      estado: "forbidden",
    });
    expect(findFirstPago).not.toHaveBeenCalled();
    expect(findFirstComprobante).not.toHaveBeenCalled();
    expect(firmas).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* SLT-143 — los pagos confirmados, el registro por fuera y la anulación       */
/* -------------------------------------------------------------------------- */

const CLAVE = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";

describe("SLT-143 — verPagosDeEmpresaAction trae los pagos confirmados vigentes (R16)", () => {
  it("R16: mapea los confirmados del jsonb al DTO, con la marca, las facturas aplicadas y sin anulados en el SQL", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        pagos: [],
        facturas: [],
        confirmados: [
          {
            id: PAGO,
            monto: "100000",
            fecha: "2026-11-18T12:00:00",
            referencia: "Transferencia del día",
            registrado_por: null,
            por_fuera: true,
            confirmado_por: "Sara Superadmin",
            confirmado_el: "2026-11-19T15:00:00",
            aplicaciones: [{ factura_id: F1, numero: 3, monto: "100000" }],
            tiene_comprobante: false,
          },
        ],
      },
    ]);
    const r = await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, { getActor: async () => SUPERADMIN });
    expect(r).toEqual({
      estado: "ok",
      datos: {
        pagos: [],
        facturas: [],
        confirmados: [
          {
            id: PAGO,
            monto: "100000.00",
            fecha: new Date("2026-11-18T12:00:00Z"),
            referencia: "Transferencia del día",
            registradoPor: null,
            porFuera: true,
            confirmadoPor: "Sara Superadmin",
            confirmadoEl: new Date("2026-11-19T15:00:00Z"),
            aplicaciones: [{ facturaId: F1, numero: 3, monto: "100000.00" }],
            tieneComprobante: false,
          },
        ],
      },
    });
    const sql = sqlDe(0);
    expect(sql).toContain('"pago_plataforma_anulacion"');
    expect(sql).toContain('ORDER BY c."confirmado_at" DESC');
  });
});

/** Un `FormData` del diálogo del registro por fuera. */
function formulario(campos: Record<string, string | File> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string | File> = {
    claveIdempotencia: CLAVE,
    monto: "100000",
    referencia: "Transferencia del día",
    aplicaciones: JSON.stringify([{ facturaId: F1, monto: "100000" }]),
    ...campos,
  };
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  return fd;
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "comprobante.png", { type: "image/png" });

describe("SLT-143 — registrarPagoPorFueraAction cablea el registro real (R1, R7, R8, R9, R31)", () => {
  it("R1, R8: sin deps.service, sube el comprobante en la carpeta de la empresa y llama a la función con su ruta", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    const r = await acciones.registrarPagoPorFueraAction(ORG, formulario({ comprobante: png() }), {
      getActor: async () => SUPERADMIN,
    });
    expect(r).toEqual({ estado: "ok" });
    expect(almacen).toEqual([{ op: "subir", bucket: BUCKET, ruta: expect.stringMatching(/\.png$/), empresa: ORG }]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlDe(0)).toContain("pago_plataforma_registrar_por_fuera(");
    const [, org, , monto, fecha, referencia, clave, aplicaciones, por, , ruta, tipo] = queryRaw.mock.calls[0];
    expect([org, monto, fecha, referencia, clave, por]).toEqual([ORG, "100000", null, "Transferencia del día", CLAVE, "u-sa"]);
    expect(JSON.parse(aplicaciones as string)).toEqual([{ factura_id: F1, monto: "100000.00" }]);
    expect([ruta, tipo]).toEqual([almacen[0].ruta, "image/png"]);
    // El composition root construye las reglas del país (las suyas y las del puerto del comprobante) con el
    // mismo cliente.
    expect(reglasConstruidas.length).toBeGreaterThan(0);
    expect(new Set(reglasConstruidas).size).toBe(1);
  });

  it("R7: con fecha, la zona se lee con las reglas reales del país, dentro de la empresa del detalle", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
    await acciones.registrarPagoPorFueraAction(ORG, formulario({ fecha: hoy }), { getActor: async () => SUPERADMIN });
    expect(zonasLeidas).toEqual([ORG]);
  });

  it("R8: un campo de archivo vacío y una fecha vacía son «sin comprobante» y «hoy»", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    const vacio = new File([], "", { type: "application/octet-stream" });
    await acciones.registrarPagoPorFueraAction(ORG, formulario({ comprobante: vacio, fecha: "" }), {
      getActor: async () => SUPERADMIN,
    });
    const llamada = queryRaw.mock.calls[0];
    expect([llamada[4], llamada[10], llamada[11]]).toEqual([null, null, null]);
    expect(almacen).toEqual([]);
    expect(zonasLeidas).toEqual([]);
  });

  it("R9: si la base rechaza por el tope, el archivo subido se borra y el monto lleva el error", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error("driver"), {
        name: "DriverAdapterError",
        cause: {
          kind: "postgres",
          code: "23514",
          originalCode: "23514",
          message: "el pago a la plataforma (100000.00) supera la deuda vigente de la empresa (50000.00)",
        },
      }),
    );
    const r = await acciones.registrarPagoPorFueraAction(ORG, formulario({ comprobante: png() }), {
      getActor: async () => SUPERADMIN,
    });
    expect(r).toEqual({ estado: "validation_error", errores: { monto: expect.stringContaining("pagos por confirmar") } });
    expect(almacen.map((a) => [a.op, a.empresa])).toEqual([
      ["subir", ORG],
      ["borrar", ORG],
    ]);
  });

  it("R8: un archivo de un tipo no admitido es validation_error en comprobante, sin subir ni escribir", async () => {
    const txt = new File(["hola"], "nota.txt", { type: "text/plain" });
    const r = await acciones.registrarPagoPorFueraAction(ORG, formulario({ comprobante: txt }), {
      getActor: async () => SUPERADMIN,
    });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores)).toEqual(["comprobante"]);
    expect(almacen).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("R5: un reparto que no es JSON es validation_error en aplicaciones, sin escribir", async () => {
    const r = await acciones.registrarPagoPorFueraAction(ORG, formulario({ aplicaciones: "no-json" }), {
      getActor: async () => SUPERADMIN,
    });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores)).toEqual(["aplicaciones"]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["un maestro", MAESTRO],
    ["sin sesión", null],
  ] as const)("R31: %s recibe forbidden sin subir ni escribir, aunque el archivo no sea válido", async (_quien, actor) => {
    const txt = new File(["hola"], "nota.txt", { type: "text/plain" });
    for (const fd of [formulario({ comprobante: png() }), formulario({ comprobante: txt })]) {
      expect(await acciones.registrarPagoPorFueraAction(ORG, fd, { getActor: async () => actor })).toEqual({ estado: "forbidden" });
    }
    expect(almacen).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("SLT-143 — anularPagoConfirmadoAction cablea la anulación real (R21, R25, R31)", () => {
  it("R21: sin deps.service, llama a la función de la base con la empresa del detalle y el superadmin de la sesión", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    expect(
      await acciones.anularPagoConfirmadoAction(ORG, { pagoId: PAGO, motivo: "Pago duplicado" }, { getActor: async () => SUPERADMIN }),
    ).toEqual({ estado: "ok" });
    expect(sqlDe(0)).toContain("pago_plataforma_anular_confirmado(");
    const [, org, pago, motivo, por] = queryRaw.mock.calls[0];
    expect([org, pago, motivo, por]).toEqual([ORG, PAGO, "Pago duplicado", "u-sa"]);
  });

  it("R25: el rechazo SL060 pago_no_confirmado es no_confirmado", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error('Raw query failed. Code: `SL060`. Message: `{"codigo": "pago_no_confirmado"}`'), { code: "P2010" }),
    );
    expect(
      await acciones.anularPagoConfirmadoAction(ORG, { pagoId: PAGO, motivo: "x" }, { getActor: async () => SUPERADMIN }),
    ).toEqual({ estado: "no_confirmado" });
  });

  it("la empresa la pone el servidor: una organizacionId en la entrada del cliente no cuenta", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    const otra = "11111111-2222-4333-8444-999999999999";
    await acciones.anularPagoConfirmadoAction(ORG, { organizacionId: otra, pagoId: PAGO, motivo: "x" }, {
      getActor: async () => SUPERADMIN,
    });
    expect(queryRaw.mock.calls[0][1]).toBe(ORG);
  });

  it.each([
    ["un maestro", MAESTRO],
    ["sin sesión", null],
  ] as const)("R31: %s recibe forbidden sin tocar el cliente", async (_quien, actor) => {
    expect(await acciones.anularPagoConfirmadoAction(ORG, { pagoId: PAGO, motivo: "x" }, { getActor: async () => actor })).toEqual({
      estado: "forbidden",
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
