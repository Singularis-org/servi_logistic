// SLT-227 (design §11, R26) — doble HTTP de la API REST v3 de Rebill para los tests del adaptador.
//
// Por que existe: ninguna prueba llama a Rebill real (decision del 2026-11-21). El adaptador
// (`lib/clients/cobro/rebill-proveedor.ts`) recibe la URL base por constructor, y los tests le dan
// la de este doble. Vive en `e2e/` para que lo reutilice el E2E de SLT-231.
//
// Node puro (`node:http`), sin dependencias, todo en memoria: cada instancia empieza vacia.
//
// Las formas NO salen de un SDK (no lo hay): salen de la doc v3 que leyo el leader el 2026-11-21
// (design §6.1). Esa doc no da el nombre ni el tipo de los parametros del request; salen de sus
// `curl`, de sus tablas de errores y del objeto de respuesta. Cada ruta cita su pagina. Su fidelidad
// la contrasta una vez T4.5, a mano, en el sandbox de Rebill.
//
// Control de la prueba, solo aqui y con el prefijo `/__control`:
//   - `POST /__control/pagos`: siembra un pago tal cual (`id`, `amount`, `currency`, `status`,
//     `paymentMethodType`, `metadata`). Se guarda sin validar, para sembrar tambien respuestas raras;
//   - `POST /__control/fallos`: encola respuestas para las siguientes peticiones a `/v3`, una por
//     peticion: `{ estado, demoraMs?, cuerpo?, cortar? }`. Sin `cuerpo`, el cuerpo repite la API key
//     recibida, a proposito, para que R25 pruebe que el adaptador lo descarta. `cortar` cierra el
//     socket sin responder (un fallo de red);
//   - `GET /__control/peticiones`: lo recibido en `/v3` (metodo, ruta, cuerpo crudo, tipo de contenido
//     y si la key era la configurada). La key no se guarda;
//   - `POST /__control/reiniciar`: vacia pagos, fallos y peticiones.

import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const PUERTO_POR_DEFECTO = 54339;
const HOST = "127.0.0.1";
// La forma del enlace que devuelve Rebill: `https://pay.rebill.com/{organizationAlias}/{paymentLinkId}`.
// Nadie llama a esa URL: es la del checkout, que abre el navegador del pagador.
const URL_CHECKOUT = "https://pay.rebill.com/servi-falso";
const METODOS_DE_ENLACE = new Set(["card", "bank_transfer", "cash"]);
const DEVOLVIBLES = new Set(["approved", "partially_refunded"]);

/**
 * @typedef {{ estado: number, demoraMs?: number, cuerpo?: unknown, cortar?: boolean }} Fallo
 * @typedef {{ metodo: string, ruta: string, cuerpo: string, tipoContenido: string | null, keyCorrecta: boolean }} Peticion
 * @typedef {{ id: string, amount?: unknown, currency?: unknown, status?: unknown, paymentMethodType?: unknown, metadata?: unknown, [clave: string]: unknown }} Pago
 * @typedef {{ url: string, puerto: number, firmarAviso: (cuerpo: string) => string, cerrar: () => Promise<void> }} RebillFalso
 */

/**
 * La firma de un aviso como la calcula Rebill (design §6.5): HMAC-SHA256 del cuerpo crudo, en hex, con el
 * `signingSecret` completo, `whsec_` incluido, como clave. Sin marca de tiempo ni prefijo.
 * Doc: https://docs.rebill.com/api/reference/webhooks
 * @param {string} cuerpo
 * @param {string} secreto
 * @returns {string}
 */
export function firmar(cuerpo, secreto) {
  return createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
}

function crearEstado() {
  return {
    /** @type {Map<string, Pago>} */
    pagos: new Map(),
    /** @type {Map<string, number>} id del pago -> centimos ya devueltos */
    devuelto: new Map(),
    /** @type {Fallo[]} */
    fallos: [],
    /** @type {Peticion[]} */
    peticiones: [],
    /** @type {Set<NodeJS.Timeout>} */
    demoras: new Set(),
  };
}

/** @param {http.ServerResponse} res @param {number} estado @param {unknown} cuerpo */
function responderJson(res, estado, cuerpo) {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(estado, { "content-type": "application/json" });
  res.end(JSON.stringify(cuerpo));
}

/** @param {http.IncomingMessage} req @returns {Promise<string>} */
function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

/** @param {string} texto @returns {{ ok: true, valor: any } | { ok: false }} */
function parsear(texto) {
  try {
    return { ok: true, valor: JSON.parse(texto) };
  } catch {
    return { ok: false };
  }
}

/** @param {string} mensaje */
const invalido = (mensaje) => ({ code: "validation_error", message: mensaje });

/** @param {unknown} v @returns {v is number} */
const montoPositivo = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * `POST /v3/payment-links` con `prices` (`instant`). Doc: https://docs.rebill.com/api/reference/payment-links
 * @param {any} cuerpo
 * @returns {string | null} el motivo del `400`, o `null` si el cuerpo vale
 */
function motivoEnlaceInvalido(cuerpo) {
  if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) return "body must be an object";
  const tipos = ["prices", "product", "plan"].filter((k) => cuerpo[k] !== undefined);
  if (tipos.length !== 1) return "exactly one of prices, product or plan is required";
  if (!Array.isArray(cuerpo.prices)) return "only instant payment links are supported by this double";
  const titulos = cuerpo.title;
  if (!Array.isArray(titulos) || titulos.length === 0) return "title is required";
  for (const t of titulos) {
    if (typeof t?.text !== "string" || t.text === "" || typeof t?.language !== "string") return "title is invalid";
  }
  const { prices, paymentMethods } = cuerpo;
  if (prices.length === 0) return "prices must not be empty";
  if (!Array.isArray(paymentMethods)) return "paymentMethods is required";
  if (paymentMethods.length !== prices.length) return "`paymentMethods` length must match `prices` length";
  for (const p of prices) {
    if (!montoPositivo(p?.amount) || typeof p?.currency !== "string") return "price is invalid";
  }
  for (const m of paymentMethods) {
    if (!Array.isArray(m?.methods) || m.methods.length === 0 || typeof m?.currency !== "string") {
      return "paymentMethods is invalid";
    }
    if (!m.methods.every((x) => METODOS_DE_ENLACE.has(x))) return "payment method is not supported";
  }
  for (const p of prices) {
    if (!paymentMethods.some((m) => m.currency === p.currency)) return "Missing payment method for price currency";
  }
  if (cuerpo.metadata !== undefined && (typeof cuerpo.metadata !== "object" || cuerpo.metadata === null)) {
    return "metadata must be an object";
  }
  return null;
}

/** @param {ReturnType<typeof crearEstado>} estado @param {any} cuerpo @param {http.ServerResponse} res */
function crearEnlace(estado, cuerpo, res) {
  const motivo = motivoEnlaceInvalido(cuerpo);
  if (motivo) return responderJson(res, 400, invalido(motivo));
  const id = `pl_${randomBytes(8).toString("hex")}`;
  return responderJson(res, 201, {
    id,
    url: `${URL_CHECKOUT}/${id}`,
    status: "active",
    title: cuerpo.title,
    prices: cuerpo.prices.map((/** @type {any} */ p) => ({ ...p, id: `plp_${randomBytes(6).toString("hex")}` })),
    paymentMethods: cuerpo.paymentMethods,
    metadata: cuerpo.metadata ?? {},
    isSingleUse: cuerpo.isSingleUse ?? true,
    ...(cuerpo.expirationDate ? { expirationDate: cuerpo.expirationDate } : {}),
  });
}

/**
 * `POST /v3/refunds/:paymentId`: solo un pago `card` en `approved` o `partially_refunded`, hasta lo que queda.
 * Sin `amount`, devuelve todo lo que queda. Responde `201` con `{ status }`.
 * Doc: https://docs.rebill.com/api/reference/refunds
 * @param {ReturnType<typeof crearEstado>} estado @param {string} pagoId @param {any} cuerpo @param {http.ServerResponse} res
 */
function devolver(estado, pagoId, cuerpo, res) {
  const pago = estado.pagos.get(pagoId);
  if (!pago) return responderJson(res, 404, { code: "not_found", message: "Payment not found" });
  if (pago.paymentMethodType !== "card") {
    return responderJson(res, 400, invalido("Only card payments can be refunded"));
  }
  if (!DEVOLVIBLES.has(String(pago.status))) {
    return responderJson(res, 400, invalido("Payment status does not allow refunds"));
  }
  const totalCentimos = Math.round(Number(pago.amount) * 100);
  const yaDevuelto = estado.devuelto.get(pagoId) ?? 0;
  const queda = totalCentimos - yaDevuelto;
  const pedido = cuerpo?.amount;
  if (pedido !== undefined && !montoPositivo(pedido)) return responderJson(res, 400, invalido("amount is invalid"));
  const centimos = pedido === undefined ? queda : Math.round(pedido * 100);
  if (centimos > queda) return responderJson(res, 400, invalido("amount exceeds the refundable amount"));
  estado.devuelto.set(pagoId, yaDevuelto + centimos);
  pago.status = yaDevuelto + centimos === totalCentimos ? "refunded" : "partially_refunded";
  return responderJson(res, 201, { status: pago.status });
}

/**
 * La API de prueba, despues de los fallos encolados y de la key.
 * @param {ReturnType<typeof crearEstado>} estado @param {string} metodo @param {string} ruta @param {string} crudo
 * @param {http.ServerResponse} res
 */
function atenderApi(estado, metodo, ruta, crudo, res) {
  const json = crudo === "" ? { ok: true, valor: undefined } : parsear(crudo);
  if (!json.ok) return responderJson(res, 400, invalido("body is not valid JSON"));
  if (metodo === "POST" && ruta === "/v3/payment-links") return crearEnlace(estado, json.valor, res);
  // `GET /v3/payments/:id`. Doc: https://docs.rebill.com/api/reference/payments
  const pago = /^\/v3\/payments\/([^/]+)$/.exec(ruta);
  if (metodo === "GET" && pago) {
    const sembrado = estado.pagos.get(decodeURIComponent(pago[1]));
    if (!sembrado) return responderJson(res, 404, { code: "not_found", message: "Payment not found" });
    return responderJson(res, 200, sembrado);
  }
  const reembolso = /^\/v3\/refunds\/([^/]+)$/.exec(ruta);
  if (metodo === "POST" && reembolso) return devolver(estado, decodeURIComponent(reembolso[1]), json.valor, res);
  return responderJson(res, 404, { code: "not_found", message: `el doble de Rebill no atiende ${metodo} ${ruta}` });
}

/**
 * @param {ReturnType<typeof crearEstado>} estado @param {Fallo} fallo @param {string} keyRecibida
 * @param {http.IncomingMessage} req @param {http.ServerResponse} res
 */
function aplicarFallo(estado, fallo, keyRecibida, req, res) {
  const responder = () => {
    if (fallo.cortar) {
      req.socket.destroy();
      return;
    }
    const cuerpo = fallo.cuerpo !== undefined ? fallo.cuerpo : { code: "fallo_del_doble", apiKey: keyRecibida };
    responderJson(res, fallo.estado, cuerpo);
  };
  if (!fallo.demoraMs) return responder();
  const t = setTimeout(() => {
    estado.demoras.delete(t);
    responder();
  }, fallo.demoraMs);
  estado.demoras.add(t);
}

/** @param {ReturnType<typeof crearEstado>} estado @param {string} apiKey */
function crearManejador(estado, apiKey) {
  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
  return async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const metodo = req.method ?? "GET";
    const ruta = url.pathname;
    const crudo = await leerCuerpo(req);

    if (ruta === "/salud") return responderJson(res, 200, { ok: true });
    if (ruta.startsWith("/__control/")) return atenderControl(estado, metodo, ruta, crudo, res);

    const keyRecibida = String(req.headers["x-api-key"] ?? "");
    estado.peticiones.push({
      metodo,
      ruta,
      cuerpo: crudo,
      tipoContenido: req.headers["content-type"] ?? null,
      keyCorrecta: keyRecibida === apiKey,
    });
    const fallo = estado.fallos.shift();
    if (fallo) return aplicarFallo(estado, fallo, keyRecibida, req, res);
    // `x-api-key` con la clave secreta. El `401` repite la key recibida A PROPOSITO (R25).
    // Doc: https://docs.rebill.com/api/reference/authentication
    if (keyRecibida !== apiKey) {
      return responderJson(res, 401, { code: "unauthorized", message: `invalid api key ${keyRecibida}` });
    }
    return atenderApi(estado, metodo, ruta, crudo, res);
  };
}

/**
 * @param {ReturnType<typeof crearEstado>} estado @param {string} metodo @param {string} ruta @param {string} crudo
 * @param {http.ServerResponse} res
 */
function atenderControl(estado, metodo, ruta, crudo, res) {
  const json = crudo === "" ? { ok: true, valor: undefined } : parsear(crudo);
  if (!json.ok) return responderJson(res, 400, { error: "control: cuerpo no es JSON" });
  if (metodo === "POST" && ruta === "/__control/pagos") {
    const pago = json.valor;
    if (typeof pago?.id !== "string" || pago.id === "") return responderJson(res, 400, { error: "control: pago sin id" });
    estado.pagos.set(pago.id, pago);
    estado.devuelto.delete(pago.id);
    return responderJson(res, 201, { ok: true });
  }
  if (metodo === "POST" && ruta === "/__control/fallos") {
    const fallos = Array.isArray(json.valor) ? json.valor : [json.valor];
    for (const f of fallos) {
      if (!Number.isInteger(f?.estado) && !f?.cortar) return responderJson(res, 400, { error: "control: fallo sin estado" });
    }
    estado.fallos.push(...fallos);
    return responderJson(res, 201, { ok: true, encolados: estado.fallos.length });
  }
  if (metodo === "GET" && ruta === "/__control/peticiones") return responderJson(res, 200, estado.peticiones);
  if (metodo === "POST" && ruta === "/__control/reiniciar") {
    estado.pagos.clear();
    estado.devuelto.clear();
    estado.fallos.length = 0;
    estado.peticiones.length = 0;
    return responderJson(res, 200, { ok: true });
  }
  return responderJson(res, 404, { error: `control: no atiende ${metodo} ${ruta}` });
}

/**
 * Arranca el doble en `127.0.0.1:<puerto>`. Con puerto 0 el sistema elige uno libre (tests).
 * @param {{ puerto?: number, apiKey: string, secretoWebhook: string }} opciones
 * @returns {Promise<RebillFalso>}
 */
export function arrancarRebillFalso({ puerto = PUERTO_POR_DEFECTO, apiKey, secretoWebhook }) {
  if (!apiKey || !secretoWebhook) throw new Error("arrancarRebillFalso: faltan apiKey o secretoWebhook");
  const estado = crearEstado();
  const manejar = crearManejador(estado, apiKey);
  const servidor = http.createServer((req, res) => {
    manejar(req, res).catch((e) => {
      // Un fallo del propio doble se ve en el log y llega al adaptador como 500. Sin la peticion: puede llevar la key.
      console.error(`[rebill-falso] error atendiendo ${req.method} ${req.url}: ${e instanceof Error ? e.name : "?"}`);
      responderJson(res, 500, { code: "interno" });
    });
  });
  return new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(puerto, HOST, () => {
      const direccion = servidor.address();
      const real = typeof direccion === "object" && direccion ? direccion.port : puerto;
      resolve({
        url: `http://${HOST}:${real}`,
        puerto: real,
        // Firma con el secreto del webhook configurado, como lo haria Rebill al mandar un aviso.
        firmarAviso: (cuerpo) => firmar(cuerpo, secretoWebhook),
        cerrar: () =>
          new Promise((ok, mal) => {
            for (const t of estado.demoras) clearTimeout(t);
            estado.demoras.clear();
            servidor.closeAllConnections();
            servidor.close((e) => (e ? mal(e) : ok()));
          }),
      });
    });
  });
}

// Ejecutado como script arranca solo, con la key y el secreto de `E2E_REBILL_API_KEY` y
// `E2E_REBILL_SECRETO_WEBHOOK` (los decide el E2E de SLT-231); importado (los tests) no arranca nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url, cerrar } = await arrancarRebillFalso({
    puerto: Number(process.env.E2E_REBILL_PUERTO ?? PUERTO_POR_DEFECTO),
    apiKey: process.env.E2E_REBILL_API_KEY ?? "",
    secretoWebhook: process.env.E2E_REBILL_SECRETO_WEBHOOK ?? "",
  });
  console.log(`[rebill-falso] escuchando en ${url}`);
  for (const senal of ["SIGINT", "SIGTERM"]) {
    process.once(senal, () => {
      cerrar().finally(() => process.exit(0));
    });
  }
}
