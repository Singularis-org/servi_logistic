import { inspect } from "node:util";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { arrancarRebillFalso, firmar } from "@/e2e/_rebill-falso/servidor.mjs";
import type { TransporteDeps } from "@/lib/clients/cobro/http-proveedor";
import {
  cuerpoJsonConMontos,
  MontoJson,
  RebillProveedorCobro,
} from "@/lib/clients/cobro/rebill-proveedor";
import { RegistroProveedoresCobro } from "@/lib/clients/cobro/registro-proveedores";
import { ESPERAS_REINTENTO_CONSULTA_MS } from "@/lib/config/cobro";
import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import type {
  CrearEnlaceEntrada,
  IProveedorCobro,
  LeerCredencialesCobro,
  TrioCredencialCobro,
} from "@/lib/interfaces/external/IProveedorCobro";
import { ProveedorCobroError, type CodigoErrorProveedor, type EntornoCobro } from "@/lib/types/cobro";

// SLT-227 (design §6, §12) — el adaptador de Rebill real contra su doble (`e2e/_rebill-falso/servidor.mjs`), en el
// puerto 0 y sin base: `leerCredenciales` es un doble. Ninguna prueba llama a Rebill real (R26). La consulta reintenta
// con un `esperar` doble que anota y no espera.

type RebillFalso = Awaited<ReturnType<typeof arrancarRebillFalso>>;

interface Peticion {
  metodo: string;
  ruta: string;
  cuerpo: string;
  tipoContenido: string | null;
  keyCorrecta: boolean;
}

interface Fallo {
  estado?: number;
  demoraMs?: number;
  cuerpo?: unknown;
  cortar?: boolean;
}

const API_KEY = "sk_prueba_doble_1";
const SECRETO_WEBHOOK = `whsec_${"ab".repeat(32)}`;
const CREDENCIALES = { apiKey: API_KEY, secretoWebhook: SECRETO_WEBHOOK };

async function control(doble: RebillFalso, ruta: string, cuerpo?: unknown): Promise<unknown> {
  const respuesta = await fetch(`${doble.url}/__control/${ruta}`, {
    method: cuerpo === undefined && ruta === "peticiones" ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  expect(respuesta.ok).toBe(true);
  return respuesta.json();
}

const peticiones = async (doble: RebillFalso) => (await control(doble, "peticiones")) as Peticion[];
const sembrarPago = (doble: RebillFalso, pago: Record<string, unknown>) => control(doble, "pagos", pago);
const encolarFallos = (doble: RebillFalso, ...fallos: Fallo[]) => control(doble, "fallos", fallos);

interface Armado {
  proveedor: RebillProveedorCobro;
  lecturas: TrioCredencialCobro[];
  esperas: number[];
}

function armar(
  doble: RebillFalso,
  opciones: {
    credenciales?: Readonly<Record<string, string>> | null;
    leer?: LeerCredencialesCobro;
    entorno?: EntornoCobro;
    tiempoMaximoMs?: number;
  } = {},
): Armado {
  const lecturas: TrioCredencialCobro[] = [];
  const esperas: number[] = [];
  const credenciales = opciones.credenciales === undefined ? CREDENCIALES : opciones.credenciales;
  const leerCredenciales: LeerCredencialesCobro =
    opciones.leer ??
    (async (trio) => {
      lecturas.push(trio);
      return credenciales;
    });
  const transporte: TransporteDeps = {
    fetchImpl: (entrada, init) => fetch(entrada, init),
    esperar: async (ms) => {
      esperas.push(ms);
    },
    tiempoMaximoMs: opciones.tiempoMaximoMs ?? 2_000,
    esperasReintentoMs: ESPERAS_REINTENTO_CONSULTA_MS,
  };
  const proveedor = new RebillProveedorCobro({
    paisId: "CR",
    entorno: opciones.entorno ?? "sandbox",
    urlBase: doble.url,
    leerCredenciales,
    transporte,
  });
  return { proveedor, lecturas, esperas };
}

const ENLACE: CrearEnlaceEntrada = {
  intentoId: "int_1",
  facturaId: "fac_1",
  monto: "20000.00",
  moneda: "CRC",
  metodo: "tarjeta",
  descripcion: "Factura N.º 12 · Empresa A",
};

const PAGO_TARJETA = {
  id: "pay_tarjeta_1",
  amount: 20000,
  currency: "CRC",
  status: "approved",
  paymentMethodType: "card",
  metadata: { paymentLinkId: "pl_origen_1" },
};

async function fallaDe(promesa: Promise<unknown>): Promise<ProveedorCobroError> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProveedorCobroError);
  return error as ProveedorCobroError;
}

async function esperarCodigo(promesa: Promise<unknown>, codigo: CodigoErrorProveedor): Promise<ProveedorCobroError> {
  const error = await fallaDe(promesa);
  expect(error.codigo).toBe(codigo);
  return error;
}

describe("SLT-227 · adaptador de Rebill contra el doble", () => {
  let doble: RebillFalso;

  beforeAll(async () => {
    doble = await arrancarRebillFalso({ puerto: 0, apiKey: API_KEY, secretoWebhook: SECRETO_WEBHOOK });
  });
  afterAll(async () => {
    await doble.cerrar();
  });
  beforeEach(async () => {
    await control(doble, "reiniciar", {});
  });

  describe("el doble (T4.1)", () => {
    it("arranca en el puerto 0, responde /salud y rechaza con 401 una key incorrecta", async () => {
      expect(doble.puerto).toBeGreaterThan(0);
      expect(await (await fetch(`${doble.url}/salud`)).json()).toEqual({ ok: true });
      const respuesta = await fetch(`${doble.url}/v3/payments/pay_x`, { headers: { "x-api-key": "sk_otra" } });
      expect(respuesta.status).toBe(401);
      // A propósito: el 401 repite la key recibida, para que R25 pruebe que el adaptador descarta el cuerpo.
      expect(await respuesta.text()).toContain("sk_otra");
      expect((await peticiones(doble))[0]).toMatchObject({ ruta: "/v3/payments/pay_x", keyCorrecta: false });
    });

    it("valida el largo y la moneda de prices y paymentMethods", async () => {
      const base = {
        title: [{ text: "x", language: "es" }],
        prices: [{ amount: 1.5, currency: "CRC", isDefault: true }],
        paymentMethods: [{ methods: ["card"], currency: "CRC" }],
      };
      const enviar = async (cuerpo: unknown) =>
        fetch(`${doble.url}/v3/payment-links`, {
          method: "POST",
          headers: { "x-api-key": API_KEY, "content-type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      expect((await enviar(base)).status).toBe(201);
      const largoDistinto = await enviar({ ...base, paymentMethods: [...base.paymentMethods, ...base.paymentMethods] });
      expect(largoDistinto.status).toBe(400);
      expect(await largoDistinto.text()).toContain("length must match");
      const otraMoneda = await enviar({ ...base, paymentMethods: [{ methods: ["card"], currency: "USD" }] });
      expect(otraMoneda.status).toBe(400);
      expect(await otraMoneda.text()).toContain("Missing payment method for price currency");
      expect((await enviar({ ...base, title: undefined })).status).toBe(400);
    });
  });

  it("R1: el adaptador ofrece las cuatro operaciones, consultar recibe solo el id y devuelve null si no lo conoce", async () => {
    const { proveedor } = armar(doble);
    const puerto: IProveedorCobro = proveedor;
    expect(puerto.proveedor).toBe("rebill");
    for (const op of ["crearEnlace", "consultarPago", "verificarFirma", "devolver"] as const) {
      expect(typeof puerto[op]).toBe("function");
    }
    expect(puerto.consultarPago.length).toBe(1);
    expect(await puerto.consultarPago("pay_desconocido")).toBeNull();
    await encolarFallos(doble, { estado: 401 });
    await esperarCodigo(puerto.consultarPago("pay_desconocido"), "credencial_rechazada");
  });

  describe("R14: sin credenciales para el trío, todo da sin_configuracion sin llamar", () => {
    it("con la fila ausente (null), las cuatro operaciones fallan y el doble recibe 0 peticiones", async () => {
      const { proveedor, lecturas } = armar(doble, { credenciales: null });
      await esperarCodigo(proveedor.crearEnlace(ENLACE), "sin_configuracion");
      await esperarCodigo(proveedor.consultarPago("pay_1"), "sin_configuracion");
      await esperarCodigo(proveedor.verificarFirma({ cuerpoCrudo: "{}", cabeceras: {} }), "sin_configuracion");
      const devolver = await esperarCodigo(
        proveedor.devolver({ pagoProveedorId: "pay_1", monto: "1.00", moneda: "CRC" }),
        "sin_configuracion",
      );
      expect(devolver).toMatchObject({ operacion: "devolver", proveedor: "rebill", reintentable: false });
      expect(await peticiones(doble)).toHaveLength(0);
      expect(lecturas).toHaveLength(4);
      expect(lecturas.every((t) => t.proveedor === "rebill" && t.paisId === "CR" && t.entorno === "sandbox")).toBe(true);
    });

    it("con la fila sin el campo que hace falta, también sin_configuracion", async () => {
      const { proveedor } = armar(doble, { credenciales: { secretoWebhook: SECRETO_WEBHOOK } });
      await esperarCodigo(proveedor.crearEnlace(ENLACE), "sin_configuracion");
      const soloKey = armar(doble, { credenciales: { apiKey: API_KEY } }).proveedor;
      await esperarCodigo(soloKey.verificarFirma({ cuerpoCrudo: "{}", cabeceras: {} }), "sin_configuracion");
      expect(await peticiones(doble)).toHaveLength(0);
    });

    it("una credencial ilegible da credencial_ilegible con la operación, sin llamar", async () => {
      const ilegibleDeBoveda = armar(doble, {
        leer: async () => {
          throw new CredencialIlegibleError("no_autentica");
        },
      }).proveedor;
      expect(await esperarCodigo(ilegibleDeBoveda.crearEnlace(ENLACE), "credencial_ilegible")).toMatchObject({
        operacion: "crearEnlace",
      });
      const ilegibleDelLector = armar(doble, {
        leer: async () => {
          throw new ProveedorCobroError("credencial_ilegible", "rebill");
        },
      }).proveedor;
      expect(await esperarCodigo(ilegibleDelLector.consultarPago("pay_1"), "credencial_ilegible")).toMatchObject({
        operacion: "consultarPago",
      });
      expect(await peticiones(doble)).toHaveLength(0);
    });
  });

  it("R15: la petición va por la API v3 con la API key del trío en x-api-key y cuerpo JSON", async () => {
    const { proveedor } = armar(doble);
    await proveedor.crearEnlace(ENLACE);
    await sembrarPago(doble, PAGO_TARJETA);
    await proveedor.consultarPago(PAGO_TARJETA.id);
    await proveedor.devolver({ pagoProveedorId: PAGO_TARJETA.id, monto: "1.00", moneda: "CRC" });
    const recibidas = await peticiones(doble);
    expect(recibidas.map((p) => `${p.metodo} ${p.ruta}`)).toEqual([
      "POST /v3/payment-links",
      `GET /v3/payments/${PAGO_TARJETA.id}`,
      `POST /v3/refunds/${PAGO_TARJETA.id}`,
    ]);
    expect(recibidas.every((p) => p.keyCorrecta && p.tipoContenido === "application/json")).toBe(true);
  });

  describe("R16: crear un enlace", () => {
    it("₡20 000,00 por tarjeta: idExterno pl_…, la URL del checkout y el cuerpo crudo con el monto literal", async () => {
      const { proveedor } = armar(doble);
      const enlace = await proveedor.crearEnlace(ENLACE);
      expect(enlace.idExterno).toMatch(/^pl_/);
      expect(enlace.url).toMatch(/^https:\/\/pay\.rebill\.com\//);
      expect(enlace.venceAt).toBeNull();
      const [peticion] = await peticiones(doble);
      expect(peticion.cuerpo).toContain('"amount":20000.00');
      expect(peticion.cuerpo).toContain('"methods":["card"]');
      expect(peticion.cuerpo).toContain('"metadata":{"facturaId":"fac_1","intentoId":"int_1"}');
      expect(JSON.parse(peticion.cuerpo)).toEqual({
        title: [{ text: ENLACE.descripcion, language: "es" }],
        prices: [{ amount: 20000, currency: "CRC", isDefault: true }],
        paymentMethods: [{ methods: ["card"], currency: "CRC" }],
        metadata: { facturaId: "fac_1", intentoId: "int_1" },
        isSingleUse: true,
      });
    });

    it("los bordes del monto se escriben con los mismos dígitos: 0.10 y 9999999999.99; transferencia es bank_transfer", async () => {
      const { proveedor } = armar(doble);
      await proveedor.crearEnlace({ ...ENLACE, monto: "0.10", metodo: "transferencia" });
      await proveedor.crearEnlace({ ...ENLACE, monto: "9999999999.99" });
      const [chico, grande] = await peticiones(doble);
      expect(chico.cuerpo).toContain('"amount":0.10');
      expect(chico.cuerpo).toContain('"methods":["bank_transfer"]');
      expect(grande.cuerpo).toContain('"amount":9999999999.99');
    });

    it("una descripción que imita la ficha del monto queda como texto", async () => {
      const { proveedor } = armar(doble);
      const descripcion = 'Factura "__monto_0_0__" y __monto_x_0__';
      await proveedor.crearEnlace({ ...ENLACE, descripcion });
      const [peticion] = await peticiones(doble);
      expect(JSON.parse(peticion.cuerpo).title[0].text).toBe(descripcion);
      expect(peticion.cuerpo).toContain('"amount":20000.00');
    });

    it("cuerpoJsonConMontos escribe cada monto una vez y rechaza uno sin la forma", () => {
      expect(cuerpoJsonConMontos({ a: new MontoJson("1.50"), b: [new MontoJson("0.01")] })).toBe('{"a":1.50,"b":[0.01]}');
      expect(() => cuerpoJsonConMontos({ a: new MontoJson("1e5") })).toThrow(/forma/);
      expect(() => cuerpoJsonConMontos({ a: new MontoJson("20000") })).toThrow(/forma/);
    });

    it("con expirationDate en la respuesta, venceAt es esa fecha; con una forma distinta, respuesta_invalida", async () => {
      const { proveedor } = armar(doble);
      await encolarFallos(doble, {
        estado: 201,
        cuerpo: { id: "pl_1", url: "https://pay.rebill.com/x/pl_1", expirationDate: "2026-12-01T00:00:00.000Z" },
      });
      expect((await proveedor.crearEnlace(ENLACE)).venceAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
      await encolarFallos(doble, { estado: 201, cuerpo: { id: "otro_1", url: "https://pay.rebill.com/x" } });
      expect(await esperarCodigo(proveedor.crearEnlace(ENLACE), "respuesta_invalida")).toMatchObject({ estadoHttp: 201 });
      await encolarFallos(doble, { estado: 201, cuerpo: { id: "pl_1", url: "http://inseguro" } });
      await esperarCodigo(proveedor.crearEnlace(ENLACE), "respuesta_invalida");
    });

    it("recurrente da metodo_no_soportado; un monto no positivo o mal formado, solicitud_invalida; sin leer ni llamar", async () => {
      const { proveedor, lecturas } = armar(doble);
      await esperarCodigo(proveedor.crearEnlace({ ...ENLACE, metodo: "recurrente" }), "metodo_no_soportado");
      for (const monto of ["0.00", "-1.00", "20000", "20000.001", "1e5", "", " 1.00", "12345678901.00"]) {
        await esperarCodigo(proveedor.crearEnlace({ ...ENLACE, monto }), "solicitud_invalida");
      }
      await esperarCodigo(proveedor.crearEnlace({ ...ENLACE, moneda: "crc" }), "solicitud_invalida");
      await esperarCodigo(proveedor.crearEnlace({ ...ENLACE, descripcion: "  " }), "solicitud_invalida");
      expect(lecturas).toHaveLength(0);
      expect(await peticiones(doble)).toHaveLength(0);
    });
  });

  describe("R17: consultar un pago", () => {
    const TRADUCCION = [
      ["pending", "pendiente"],
      ["approved", "aprobado"],
      ["rejected", "rechazado"],
      ["refunded", "devuelto"],
      ["chargeback", "contracargo"],
      ["partially_refunded", "aprobado"],
      ["cancelled", "rechazado"],
    ] as const;

    it.each(TRADUCCION)("%s ⇒ %s, con el monto en texto, la moneda y el id del enlace", async (status, estado) => {
      const { proveedor } = armar(doble);
      await sembrarPago(doble, { ...PAGO_TARJETA, status });
      expect(await proveedor.consultarPago(PAGO_TARJETA.id)).toEqual({
        pagoProveedorId: PAGO_TARJETA.id,
        idExterno: "pl_origen_1",
        estado,
        monto: "20000.00",
        moneda: "CRC",
      });
    });

    it("los bordes del monto leído: 0.1, 20000 y 9999999999.99 exactos; 0.005 da respuesta_invalida", async () => {
      const { proveedor } = armar(doble);
      for (const [amount, monto] of [
        [0.1, "0.10"],
        [20000, "20000.00"],
        [9999999999.99, "9999999999.99"],
      ] as const) {
        await sembrarPago(doble, { ...PAGO_TARJETA, amount });
        expect((await proveedor.consultarPago(PAGO_TARJETA.id))?.monto).toBe(monto);
      }
      for (const amount of [0.005, -1, 1e10, "20000.00"]) {
        await sembrarPago(doble, { ...PAGO_TARJETA, amount });
        await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "respuesta_invalida");
      }
    });

    it("un estado fuera de la tabla o una respuesta sin la forma esperada dan respuesta_invalida, sin reintentar", async () => {
      const { proveedor, esperas } = armar(doble);
      const raros: Record<string, unknown>[] = [
        { ...PAGO_TARJETA, status: "expired" },
        { ...PAGO_TARJETA, status: "constructor" },
        { ...PAGO_TARJETA, metadata: {} },
        { ...PAGO_TARJETA, currency: "crc" },
        { id: PAGO_TARJETA.id },
      ];
      for (const pago of raros) {
        await control(doble, "reiniciar", {});
        await sembrarPago(doble, pago);
        const error = await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "respuesta_invalida");
        expect(error).toMatchObject({ operacion: "consultarPago", reintentable: false, incierto: false });
        expect(await peticiones(doble)).toHaveLength(1);
      }
      await encolarFallos(doble, { estado: 200, cuerpo: { ...PAGO_TARJETA, id: "pay_otro" } });
      await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "respuesta_invalida");
      expect(esperas).toEqual([]);
    });

    it("un 404 es null (no lo conoce), y un 503 pasajero se reintenta hasta el pago", async () => {
      const { proveedor, esperas } = armar(doble);
      expect(await proveedor.consultarPago("pay_inexistente")).toBeNull();
      await control(doble, "reiniciar", {});
      await sembrarPago(doble, PAGO_TARJETA);
      await encolarFallos(doble, { estado: 503 }, { estado: 503 });
      expect((await proveedor.consultarPago(PAGO_TARJETA.id))?.estado).toBe("aprobado");
      expect(await peticiones(doble)).toHaveLength(3);
      expect(esperas).toEqual([...ESPERAS_REINTENTO_CONSULTA_MS]);
    });
  });

  describe("R18: verificar la firma de un aviso", () => {
    const cuerpo = JSON.stringify({ data: { id: "pay_1", status: "approved" }, webhook: { logId: "we_log_1" } });

    it("el cuerpo firmado por el doble con el secreto del trío ⇒ true; sin red", async () => {
      const { proveedor } = armar(doble);
      const firma = doble.firmarAviso(cuerpo);
      expect(firma).toBe(firmar(cuerpo, SECRETO_WEBHOOK));
      expect(await proveedor.verificarFirma({ cuerpoCrudo: cuerpo, cabeceras: { "x-rebill-signature": firma } })).toBe(
        true,
      );
      expect(
        await proveedor.verificarFirma({ cuerpoCrudo: cuerpo, cabeceras: { "x-rebill-signature": firma.toUpperCase() } }),
      ).toBe(true);
      expect(await peticiones(doble)).toHaveLength(0);
    });

    it("con un byte cambiado, la cabecera ausente o mal formada, u otro secreto ⇒ false", async () => {
      const { proveedor } = armar(doble);
      const firma = doble.firmarAviso(cuerpo);
      const verificar = (cuerpoCrudo: string, cabecera: string | undefined) =>
        proveedor.verificarFirma({ cuerpoCrudo, cabeceras: { "x-rebill-signature": cabecera } });
      expect(await verificar(cuerpo.replace("approved", "approvee"), firma)).toBe(false);
      expect(await verificar(cuerpo, undefined)).toBe(false);
      expect(await verificar(cuerpo, "")).toBe(false);
      expect(await verificar(cuerpo, firma.slice(0, 63))).toBe(false);
      expect(await verificar(cuerpo, `${firma}00`)).toBe(false);
      expect(await verificar(cuerpo, `sha256=${firma}`)).toBe(false);
      expect(await verificar(cuerpo, Buffer.from(firma, "hex").toString("base64"))).toBe(false);
      expect(await verificar(cuerpo, firmar(cuerpo, `whsec_${"cd".repeat(32)}`))).toBe(false);
      // La clave es el signingSecret COMPLETO: sin el prefijo whsec_ la firma no vale.
      expect(await verificar(cuerpo, firmar(cuerpo, SECRETO_WEBHOOK.slice("whsec_".length)))).toBe(false);
      expect(await peticiones(doble)).toHaveLength(0);
    });
  });

  describe("R19: devolver un pago", () => {
    it("₡5 000,00 de un pago de tarjeta de ₡20 000,00 ⇒ aprobada; el resto ⇒ aprobada (refunded)", async () => {
      const { proveedor } = armar(doble);
      await sembrarPago(doble, PAGO_TARJETA);
      const entrada = { pagoProveedorId: PAGO_TARJETA.id, monto: "5000.00", moneda: "CRC" };
      expect(await proveedor.devolver(entrada)).toEqual({ estado: "aprobada" });
      expect((await proveedor.consultarPago(PAGO_TARJETA.id))?.estado).toBe("aprobado");
      expect(await proveedor.devolver({ ...entrada, monto: "15000.00" })).toEqual({ estado: "aprobada" });
      expect((await proveedor.consultarPago(PAGO_TARJETA.id))?.estado).toBe("devuelto");
      const cuerpos = (await peticiones(doble)).filter((p) => p.metodo === "POST").map((p) => p.cuerpo);
      expect(cuerpos).toEqual(['{"amount":5000.00}', '{"amount":15000.00}']);
    });

    it("un pago por transferencia, uno no aprobado o un monto mayor que lo que queda ⇒ 400 ⇒ solicitud_rechazada, 1 petición", async () => {
      const { proveedor } = armar(doble);
      const casos: [Record<string, unknown>, string][] = [
        [{ ...PAGO_TARJETA, paymentMethodType: "bank_transfer" }, "1.00"],
        [{ ...PAGO_TARJETA, status: "pending" }, "1.00"],
        [PAGO_TARJETA, "20000.01"],
      ];
      for (const [pago, monto] of casos) {
        await control(doble, "reiniciar", {});
        await sembrarPago(doble, pago);
        const error = await esperarCodigo(
          proveedor.devolver({ pagoProveedorId: PAGO_TARJETA.id, monto, moneda: "CRC" }),
          "solicitud_rechazada",
        );
        expect(error).toMatchObject({ estadoHttp: 400, incierto: false, reintentable: false });
        expect(await peticiones(doble)).toHaveLength(1);
      }
      await esperarCodigo(
        proveedor.devolver({ pagoProveedorId: "pay_inexistente", monto: "1.00", moneda: "CRC" }),
        "no_encontrado",
      );
    });

    it("traduce cada status de la devolución; uno fuera del mapa es respuesta_invalida", async () => {
      const { proveedor } = armar(doble);
      const entrada = { pagoProveedorId: PAGO_TARJETA.id, monto: "1.00", moneda: "CRC" };
      const casos = [
        ["approved", "pendiente"],
        ["cancelled", "denegada"],
      ] as const;
      for (const [status, estado] of casos) {
        await encolarFallos(doble, { estado: 201, cuerpo: { status } });
        expect(await proveedor.devolver(entrada)).toEqual({ estado });
      }
      for (const cuerpo of [{ status: "pending" }, { status: "constructor" }, {}, ["refunded"]]) {
        await encolarFallos(doble, { estado: 201, cuerpo });
        await esperarCodigo(proveedor.devolver(entrada), "respuesta_invalida");
      }
    });

    it("un monto no positivo o mal formado da solicitud_invalida sin leer ni llamar", async () => {
      const { proveedor, lecturas } = armar(doble);
      for (const monto of ["0.00", "-5.00", "5000", "5000.0"]) {
        await esperarCodigo(
          proveedor.devolver({ pagoProveedorId: PAGO_TARJETA.id, monto, moneda: "CRC" }),
          "solicitud_invalida",
        );
      }
      await esperarCodigo(proveedor.devolver({ pagoProveedorId: " ", monto: "1.00", moneda: "CRC" }), "solicitud_invalida");
      expect(lecturas).toHaveLength(0);
      expect(await peticiones(doble)).toHaveLength(0);
    });
  });

  describe("R22: crear un enlace y devolver hacen una sola petición, y la falla con efecto posible es incierta", () => {
    const FALLAS: [string, Fallo, CodigoErrorProveedor][] = [
      ["503", { estado: 503 }, "proveedor_caido"],
      ["tiempo agotado", { estado: 200, demoraMs: 1_500 }, "tiempo_agotado"],
      ["fallo de red", { cortar: true }, "sin_conexion"],
    ];
    const operaciones = {
      crearEnlace: (p: RebillProveedorCobro) => p.crearEnlace(ENLACE),
      devolver: (p: RebillProveedorCobro) =>
        p.devolver({ pagoProveedorId: PAGO_TARJETA.id, monto: "5000.00", moneda: "CRC" }),
    };

    for (const [nombre, ejecutar] of Object.entries(operaciones)) {
      it.each(FALLAS)(`${nombre} con %s ⇒ 1 petición, incierto`, async (_n, fallo, codigo) => {
        const { proveedor, esperas } = armar(doble, { tiempoMaximoMs: 150 });
        await sembrarPago(doble, PAGO_TARJETA);
        await encolarFallos(doble, fallo, fallo, fallo);
        const error = await esperarCodigo(ejecutar(proveedor), codigo);
        expect(error).toMatchObject({ operacion: nombre, incierto: true, reintentable: true });
        expect(await peticiones(doble)).toHaveLength(1);
        expect(esperas).toEqual([]);
      });
    }

    it("contraste: la consulta con el mismo 503 sí reintenta (3 peticiones) y nunca es incierta", async () => {
      const { proveedor } = armar(doble);
      await encolarFallos(doble, { estado: 503 }, { estado: 503 }, { estado: 503 });
      const error = await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "proveedor_caido");
      expect(error.incierto).toBe(false);
      expect(await peticiones(doble)).toHaveLength(3);
    });
  });

  describe("R4: el registro real lee solo las credenciales del entorno de la app", () => {
    function lectorSoloProduccion() {
      const lecturas: TrioCredencialCobro[] = [];
      const leer: LeerCredencialesCobro = async (trio) => {
        lecturas.push(trio);
        return trio.proveedor === "rebill" && trio.paisId === "CR" && trio.entorno === "produccion" ? CREDENCIALES : null;
      };
      return { leer, lecturas };
    }
    function registro(entorno: EntornoCobro, leer: LeerCredencialesCobro) {
      return new RegistroProveedoresCobro({
        entorno,
        leerCredenciales: leer,
        transporte: {
          fetchImpl: (entrada, init) => fetch(entrada, init),
          esperar: async () => undefined,
          tiempoMaximoMs: 2_000,
          esperasReintentoMs: ESPERAS_REINTENTO_CONSULTA_MS,
        },
        urlsBase: { rebill: doble.url },
      });
    }

    it("en sandbox, con credenciales de CR solo en produccion ⇒ sin_configuracion y 0 peticiones", async () => {
      const { leer, lecturas } = lectorSoloProduccion();
      const proveedor = registro("sandbox", leer).obtener("rebill", "CR");
      await esperarCodigo(proveedor.crearEnlace(ENLACE), "sin_configuracion");
      await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "sin_configuracion");
      expect(lecturas).toEqual([
        { proveedor: "rebill", paisId: "CR", entorno: "sandbox" },
        { proveedor: "rebill", paisId: "CR", entorno: "sandbox" },
      ]);
      expect(await peticiones(doble)).toHaveLength(0);
    });

    it("control: en produccion, el mismo lector da la key y sale la petición con ella", async () => {
      const { leer, lecturas } = lectorSoloProduccion();
      const proveedor = registro("produccion", leer).obtener("rebill", "CR");
      expect((await proveedor.crearEnlace(ENLACE)).idExterno).toMatch(/^pl_/);
      expect(lecturas).toEqual([{ proveedor: "rebill", paisId: "CR", entorno: "produccion" }]);
      const recibidas = await peticiones(doble);
      expect(recibidas).toHaveLength(1);
      expect(recibidas[0].keyCorrecta).toBe(true);
    });
  });
});

describe("SLT-227 · R25: el secreto no sale", () => {
  const CENTINELA = "sk_CENTINELA_9f3";
  const SECRETO_CENTINELA = `whsec_${"c0ffee".repeat(11).slice(0, 64)}`;
  let doble: RebillFalso;
  let otro: RebillFalso;
  const espias: ReturnType<typeof vi.spyOn>[] = [];

  beforeAll(async () => {
    doble = await arrancarRebillFalso({ puerto: 0, apiKey: CENTINELA, secretoWebhook: SECRETO_CENTINELA });
    otro = await arrancarRebillFalso({ puerto: 0, apiKey: "sk_otra_cuenta", secretoWebhook: SECRETO_WEBHOOK });
  });
  afterAll(async () => {
    await doble.cerrar();
    await otro.cerrar();
  });
  beforeEach(async () => {
    await control(doble, "reiniciar", {});
    await control(otro, "reiniciar", {});
    for (const metodo of ["log", "warn", "error", "info", "debug"] as const) {
      espias.push(vi.spyOn(console, metodo).mockImplementation(() => undefined));
    }
  });
  afterEach(() => {
    const llamadas = espias.flatMap((e) => e.mock.calls);
    for (const e of espias) e.mockRestore();
    espias.length = 0;
    const volcado = inspect(llamadas, { depth: 10 });
    expect(volcado).not.toContain(CENTINELA);
    expect(volcado).not.toContain(SECRETO_CENTINELA);
  });

  function armarCentinela(destino: RebillFalso, tiempoMaximoMs = 150) {
    return armar(destino, { credenciales: { apiKey: CENTINELA, secretoWebhook: SECRETO_CENTINELA }, tiempoMaximoMs });
  }

  function sinSecretos(error: ProveedorCobroError) {
    const vistas = [
      error.message,
      error.stack ?? "",
      String(error),
      JSON.stringify(error),
      inspect(error, { depth: 10, showHidden: true }),
      inspect((error as { cause?: unknown }).cause, { depth: 10 }),
    ];
    for (const vista of vistas) {
      expect(vista).not.toContain(CENTINELA);
      expect(vista).not.toContain(SECRETO_CENTINELA);
    }
  }

  const operaciones = {
    crearEnlace: (p: RebillProveedorCobro) => p.crearEnlace(ENLACE),
    consultarPago: (p: RebillProveedorCobro) => p.consultarPago(PAGO_TARJETA.id),
    devolver: (p: RebillProveedorCobro) => p.devolver({ pagoProveedorId: PAGO_TARJETA.id, monto: "1.00", moneda: "CRC" }),
  };
  // Sin `cuerpo`, el doble repite en el cuerpo de cada respuesta la key que recibió.
  const CAMINOS: [string, Fallo, CodigoErrorProveedor][] = [
    ["401", { estado: 401 }, "credencial_rechazada"],
    ["403", { estado: 403 }, "credencial_rechazada"],
    ["404", { estado: 404 }, "no_encontrado"],
    ["422", { estado: 422 }, "solicitud_rechazada"],
    ["429", { estado: 429 }, "limite_de_peticiones"],
    ["503", { estado: 503 }, "proveedor_caido"],
    ["tiempo agotado", { estado: 503, demoraMs: 1_500 }, "tiempo_agotado"],
    ["sin conexión", { cortar: true }, "sin_conexion"],
    ["respuesta inválida (2xx con la key en el cuerpo)", { estado: 201 }, "respuesta_invalida"],
  ];

  it("control de no vacuidad: el doble recibió el centinela en x-api-key y lo repite en el cuerpo de su error", async () => {
    await encolarFallos(doble, { estado: 401 });
    const respuesta = await fetch(`${doble.url}/v3/payments/pay_x`, { headers: { "x-api-key": CENTINELA } });
    expect(await respuesta.text()).toContain(CENTINELA);
    const { proveedor } = armarCentinela(doble);
    await encolarFallos(doble, { estado: 401 });
    await esperarCodigo(proveedor.consultarPago(PAGO_TARJETA.id), "credencial_rechazada");
    const recibidas = await peticiones(doble);
    expect(recibidas).toHaveLength(2);
    expect(recibidas.every((p) => p.keyCorrecta)).toBe(true);
  });

  for (const [nombre, ejecutar] of Object.entries(operaciones)) {
    it.each(CAMINOS)(`${nombre} con %s: el error no lleva el centinela`, async (_n, fallo, codigo) => {
      const { proveedor } = armarCentinela(doble);
      await sembrarPago(doble, PAGO_TARJETA);
      await encolarFallos(doble, fallo, fallo, fallo);
      const resultado = ejecutar(proveedor);
      if (nombre === "consultarPago" && codigo === "no_encontrado") {
        expect(await resultado).toBeNull();
      } else {
        const error = await esperarCodigo(resultado, codigo);
        sinSecretos(error);
      }
      const recibidas = await peticiones(doble);
      expect(recibidas.length).toBeGreaterThan(0);
      expect(recibidas.every((p) => p.keyCorrecta)).toBe(true);
    });
  }

  it("el 401 real de otra cuenta, que repite la key en su cuerpo, no la deja salir", async () => {
    const { proveedor } = armarCentinela(otro);
    for (const ejecutar of Object.values(operaciones)) {
      sinSecretos(await esperarCodigo(ejecutar(proveedor), "credencial_rechazada"));
    }
    expect(await peticiones(otro)).toHaveLength(3);
  });

  it("credencial_ilegible y sin_configuracion no llevan el centinela", async () => {
    const ilegible = armar(doble, {
      leer: async () => {
        throw new CredencialIlegibleError("no_autentica");
      },
    }).proveedor;
    for (const ejecutar of Object.values(operaciones)) {
      sinSecretos(await esperarCodigo(ejecutar(ilegible), "credencial_ilegible"));
    }
    sinSecretos(
      await esperarCodigo(ilegible.verificarFirma({ cuerpoCrudo: "{}", cabeceras: {} }), "credencial_ilegible"),
    );
    const sinSecreto = armar(doble, { credenciales: { apiKey: CENTINELA } }).proveedor;
    sinSecretos(await esperarCodigo(sinSecreto.verificarFirma({ cuerpoCrudo: "{}", cabeceras: {} }), "sin_configuracion"));
  });

  it("verificarFirma con una firma mala responde false sin registrar nada", async () => {
    const { proveedor } = armarCentinela(doble);
    const cuerpo = '{"data":{"id":"pay_1"}}';
    expect(
      await proveedor.verificarFirma({ cuerpoCrudo: cuerpo, cabeceras: { "x-rebill-signature": firmar(cuerpo, "otro") } }),
    ).toBe(false);
    expect(await peticiones(doble)).toHaveLength(0);
  });
});
