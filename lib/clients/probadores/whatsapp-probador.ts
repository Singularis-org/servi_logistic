// SL-36 (design §5, R17) — prueba de WhatsApp: el número y la cuenta de WhatsApp Business.
//
// Dos GET de solo lectura a Graph con el token en `Authorization: Bearer` (QC inv. 17: nunca en
// la URL, que acaba en logs de proxies). La WABA se prueba también, a diferencia de QC, porque un
// WABA ID mal pegado rompe después la sincronización de plantillas sin que la pantalla lo diga.
// El App Secret no tiene endpoint de prueba: lo comprueba la primera firma del webhook.
import { z } from "zod";
import type {
  CredencialPorServicio,
  DatosPruebaPorServicio,
  IProbadorIntegracion,
  MotivoPruebaPorServicio,
  ResultadoPrueba,
} from "@/lib/interfaces/external/IProbadorIntegracion";
import {
  jsonSinLanzar,
  llamar,
  nombreDeError,
  registrarFallo,
  resolverOpciones,
  type OpcionesProbador,
  type OpcionesResueltas,
} from "@/lib/clients/probadores/comun";

const GRAPH_BASE = "https://graph.facebook.com";
/** Misma versión por defecto que `lib/config/whatsapp.ts`; el composition root puede pasar otra. */
const API_VERSION_POR_DEFECTO = "v21.0";

/** Graph: token inválido o caducado (OAuthException). Es la señal de rechazo de R30. */
const CODIGO_TOKEN_INVALIDO = 190;
/** Graph: el objeto no existe o el token no lo ve. */
const CODIGO_OBJETO_INEXISTENTE = 100;
/** Graph: permiso denegado (10) o permiso de la app ausente (200-299). */
function esCodigoDePermiso(codigo: number): boolean {
  return codigo === 10 || (codigo >= 200 && codigo <= 299);
}

const numeroSchema = z.object({
  display_phone_number: z.string().min(1),
  verified_name: z.string(),
});
const wabaSchema = z.object({ id: z.string().min(1) });
const errorGraphSchema = z.object({ error: z.object({ code: z.number() }) });

type Motivo = MotivoPruebaPorServicio["whatsapp"];
type Resultado = ResultadoPrueba<"whatsapp">;

export interface OpcionesProbadorWhatsapp extends OpcionesProbador {
  apiVersion?: string;
}

export class WhatsappProbador implements IProbadorIntegracion<"whatsapp"> {
  private readonly opts: OpcionesResueltas;
  private readonly apiVersion: string;

  constructor(opts: OpcionesProbadorWhatsapp = {}) {
    this.opts = resolverOpciones(opts);
    this.apiVersion = opts.apiVersion ?? API_VERSION_POR_DEFECTO;
  }

  async probar(
    credencial: CredencialPorServicio["whatsapp"],
    datos: DatosPruebaPorServicio["whatsapp"],
  ): Promise<Resultado> {
    try {
      return await this.probarSinProteger(credencial.token_acceso, datos);
    } catch (error) {
      // Red de seguridad: un fallo no previsto sigue siendo un resultado (QC inv. 18).
      return this.fallo("proveedor", `error inesperado ${nombreDeError(error)}`);
    }
  }

  private async probarSinProteger(
    token: string,
    datos: DatosPruebaPorServicio["whatsapp"],
  ): Promise<Resultado> {
    const numero = await this.leer(
      `${encodeURIComponent(datos.numeroId)}?fields=display_phone_number,verified_name`,
      token,
      "numero_no_encontrado",
    );
    if (!numero.ok) return numero;
    const datosNumero = numeroSchema.safeParse(numero.json);
    if (!datosNumero.success) return this.fallo("respuesta_invalida", "número sin forma esperada");

    const waba = await this.leer(
      `${encodeURIComponent(datos.wabaId)}?fields=id`,
      token,
      "waba_no_encontrada",
    );
    if (!waba.ok) return waba;
    const datosWaba = wabaSchema.safeParse(waba.json);
    // Un id distinto al pedido es una respuesta que no habla de la WABA escrita: no se acepta.
    if (!datosWaba.success || datosWaba.data.id !== datos.wabaId) {
      return this.fallo("respuesta_invalida", "WABA sin forma esperada");
    }

    return {
      ok: true,
      datosPublicos: {
        numeroId: datos.numeroId,
        wabaId: datos.wabaId,
        nombreVisible: datos.nombreVisible,
        telefonoVisible: datosNumero.data.display_phone_number,
        nombreVerificado: datosNumero.data.verified_name,
      },
    };
  }

  /** Un GET a Graph. Devuelve el JSON si es 2xx, o el resultado fallido ya clasificado. */
  private async leer(
    ruta: string,
    token: string,
    motivoInexistente: Motivo,
  ): Promise<{ ok: true; json: unknown } | Extract<Resultado, { ok: false }>> {
    const llamada = await llamar(this.opts, `${GRAPH_BASE}/${this.apiVersion}/${ruta}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (llamada.tipo !== "respuesta") return this.fallo("sin_respuesta", llamada.tipo);

    const { respuesta } = llamada;
    const json = await jsonSinLanzar(respuesta);
    if (respuesta.ok) {
      if (json === undefined) return this.fallo("respuesta_invalida", "cuerpo no es JSON");
      return { ok: true, json };
    }

    const error = errorGraphSchema.safeParse(json);
    const codigo = error.success ? error.data.error.code : undefined;
    const detalle = `HTTP ${respuesta.status}${codigo === undefined ? "" : `, código ${codigo}`}`;
    return this.fallo(clasificar(respuesta.status, codigo, motivoInexistente), detalle);
  }

  private fallo(motivo: Motivo, detalle: string): Extract<Resultado, { ok: false }> {
    registrarFallo(this.opts.logger, "whatsapp", motivo, detalle);
    return { ok: false, motivo };
  }
}

/** Traduce el estado HTTP y el `error.code` de Graph al motivo del catálogo. */
function clasificar(status: number, codigo: number | undefined, motivoInexistente: Motivo): Motivo {
  if (status === 401 || codigo === CODIGO_TOKEN_INVALIDO) return "credencial_rechazada";
  if (status === 403 || (codigo !== undefined && esCodigoDePermiso(codigo))) return "sin_permiso";
  if (status === 404 || codigo === CODIGO_OBJETO_INEXISTENTE) return motivoInexistente;
  return "proveedor";
}
