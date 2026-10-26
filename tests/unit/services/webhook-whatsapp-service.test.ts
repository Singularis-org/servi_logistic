import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

import { contextoActual } from "@/lib/db/contexto-empresa";
import { ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import type {
  DestinoWebhook,
  IIntegracionEnrutadoRepository,
} from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";
import { WebhookWhatsappService, type WebhookWhatsappDeps } from "@/lib/services/WebhookWhatsappService";
import type { IngestaResumen } from "@/lib/services/ChatWhatsappService";
import type { WebhookEventos } from "@/lib/types/whatsapp-webhook";

// SL-36 T5.3 (design §10; R19-R21) — `WebhookWhatsappService` con dobles: dos empresas, cada una con
// su numero, su App Secret y su token de verificacion.
//
// Los dobles que leen el App Secret, ingieren o anotan registran la empresa del CONTEXTO
// (`contextoActual()`) en el momento de la llamada: asi «en su contexto» (R20) es una afirmacion y
// no una suposicion, y un App Secret leido fuera de `conEmpresa` falla.
//
// Mutaciones medidas (progress/impl_SL-36-T5b.md): leer el App Secret una vez y reusarlo para las
// demas empresas del POST (firma de A verificada con el secreto de B) -> rojo; quitar la
// comprobacion de firma -> rojo.

const resumidor = new ResumenSecretoSha256();

interface Empresa {
  organizacionId: string;
  integracionId: string;
  numero: string;
  appSecret: string;
  token: string;
}

const A: Empresa = {
  organizacionId: "org-a",
  integracionId: "int-a",
  numero: "111000111",
  appSecret: "secreto-de-a-1234567890",
  token: "token-verificacion-de-a",
};
const B: Empresa = {
  organizacionId: "org-b",
  integracionId: "int-b",
  numero: "222000222",
  appSecret: "secreto-de-b-0987654321",
  token: "token-verificacion-de-b",
};
const EMPRESAS = [A, B];
const NUMERO_CLIENTE = "50688887777";

function destino(e: Empresa): DestinoWebhook {
  return { organizacionId: e.organizacionId, integracionId: e.integracionId };
}

function firmar(cuerpo: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(cuerpo, "utf8").digest("hex")}`;
}

/** Un `change` de Meta con un entrante de texto para el numero dado. */
function change(numero: string, waId: string): unknown {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "50600000000", phone_number_id: numero },
      messages: [{ from: NUMERO_CLIENTE, id: waId, timestamp: "1700000000", type: "text", text: { body: "hola" } }],
    },
  };
}

function cuerpo(...changes: unknown[]): string {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba-1", changes }] });
}

interface Llamada {
  empresa: string | undefined;
  integracionId?: string;
  waIds?: string[];
}

function empresaDelContexto(): string | undefined {
  const c = contextoActual();
  return c?.tipo === "empresa" ? c.organizacionId : undefined;
}

function montar(sobrescribir: Partial<WebhookWhatsappDeps> = {}) {
  const lecturasDeSecreto: Llamada[] = [];
  const ingestas: Llamada[] = [];
  const anotaciones: Llamada[] = [];
  const avisos: string[] = [];
  const depuraciones: string[] = [];

  const enrutado: IIntegracionEnrutadoRepository = {
    porResumenVerificacion: vi.fn(async (resumen: string) => {
      const e = EMPRESAS.find((x) => resumidor.resumen(x.token) === resumen);
      return e === undefined ? null : destino(e);
    }),
    porNumeros: vi.fn(async (numeros: readonly string[]) => {
      const mapa = new Map<string, DestinoWebhook>();
      for (const n of numeros) {
        const e = EMPRESAS.find((x) => x.numero === n);
        if (e !== undefined) mapa.set(n, destino(e));
      }
      return mapa;
    }),
  };

  const deps: WebhookWhatsappDeps = {
    enrutado,
    resumidor,
    // Como la credencial real: la de la empresa EN CURSO, no la que pida el argumento.
    leerAppSecret: vi.fn(async (integracionId: string) => {
      const empresa = empresaDelContexto();
      lecturasDeSecreto.push({ empresa, integracionId });
      return EMPRESAS.find((x) => x.organizacionId === empresa)?.appSecret ?? null;
    }),
    anotarWebhook: vi.fn(async (integracionId: string) => {
      anotaciones.push({ empresa: empresaDelContexto(), integracionId });
    }),
    ingesta: {
      ingerirEventos: vi.fn(async (eventos: WebhookEventos): Promise<IngestaResumen> => {
        ingestas.push({ empresa: empresaDelContexto(), waIds: eventos.mensajes.map((m) => m.waMessageId) });
        return { mensajesRegistrados: eventos.mensajes.length, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0 };
      }),
    },
    entregaEstado: () => ({ aplicar: vi.fn(async () => 0) }),
    logger: { warn: (m: string) => avisos.push(m) },
    depuracion: (m: string, d: string) => depuraciones.push(`${m} ${d}`),
    reloj: () => new Date("2026-10-25T12:00:00.000Z"),
    ...sobrescribir,
  };
  return {
    servicio: new WebhookWhatsappService(deps),
    deps,
    enrutado,
    lecturasDeSecreto,
    ingestas,
    anotaciones,
    avisos,
    depuraciones,
  };
}

describe("SL-36 T5.3 — WebhookWhatsappService · GET (R19)", () => {
  it("GET: challenge solo con resumen conocido; 403 si no; anota el último webhook", async () => {
    const m = montar();
    const ok = await m.servicio.verificar({ mode: "subscribe", token: B.token, challenge: "reto-123" });
    expect(ok).toEqual({ status: "ok", challenge: "reto-123" });
    // Se busca por el RESUMEN, nunca por el token en claro.
    expect(m.enrutado.porResumenVerificacion).toHaveBeenCalledWith(resumidor.resumen(B.token));
    expect(m.anotaciones).toEqual([{ empresa: B.organizacionId, integracionId: B.integracionId }]);
    expect(m.deps.anotarWebhook).toHaveBeenCalledWith(B.integracionId, new Date("2026-10-25T12:00:00.000Z"));

    const desconocido = await m.servicio.verificar({ mode: "subscribe", token: "otro-token", challenge: "reto-123" });
    expect(desconocido).toEqual({ status: "forbidden" });
    expect(m.anotaciones).toHaveLength(1);
  });

  it("GET sin modo subscribe, sin token o sin challenge: 403 sin consultar la base", async () => {
    const m = montar();
    for (const entrada of [
      { mode: "unsubscribe", token: A.token, challenge: "x" },
      { mode: "subscribe", token: null, challenge: "x" },
      { mode: "subscribe", token: "", challenge: "x" },
      { mode: "subscribe", token: A.token, challenge: null },
    ]) {
      expect(await m.servicio.verificar(entrada)).toEqual({ status: "forbidden" });
    }
    expect(m.enrutado.porResumenVerificacion).not.toHaveBeenCalled();
    expect(m.anotaciones).toHaveLength(0);
  });

  it("GET: si anotar el último webhook falla, el challenge se devuelve igual y el log no lleva el token", async () => {
    const m = montar({ anotarWebhook: async () => Promise.reject(new Error(`boom ${A.token}`)) });
    expect(await m.servicio.verificar({ mode: "subscribe", token: A.token, challenge: "c" })).toEqual({
      status: "ok",
      challenge: "c",
    });
    expect(m.avisos.join("\n")).not.toContain(A.token);
  });
});

describe("SL-36 T5.3 — WebhookWhatsappService · POST (R20, R21)", () => {
  it("POST: empresa por número, firma con su App Secret, ingesta en su contexto", async () => {
    const m = montar();
    const crudo = cuerpo(change(A.numero, "wamid.A1"));
    const r = await m.servicio.recibir({ cuerpoCrudo: crudo, firma: firmar(crudo, A.appSecret) });

    expect(r).toEqual({
      status: "ok",
      resumen: { mensajesRegistrados: 1, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0 },
    });
    expect(m.enrutado.porNumeros).toHaveBeenCalledWith([A.numero]);
    expect(m.lecturasDeSecreto).toEqual([{ empresa: A.organizacionId, integracionId: A.integracionId }]);
    expect(m.ingestas).toEqual([{ empresa: A.organizacionId, waIds: ["wamid.A1"] }]);
    expect(m.anotaciones).toEqual([{ empresa: A.organizacionId, integracionId: A.integracionId }]);
  });

  it("POST con eventos de dos empresas: cada una solo con su firma, sus eventos y su contexto", async () => {
    const m = montar();
    // Firmado con el secreto de B: lo de B entra, lo de A NO, aunque vengan en el mismo POST y B vaya
    // primero (si el secreto de B sirviera para A, A tambien entraria).
    const crudo = cuerpo(change(B.numero, "wamid.B1"), change(A.numero, "wamid.A1"));
    const r = await m.servicio.recibir({ cuerpoCrudo: crudo, firma: firmar(crudo, B.appSecret) });

    expect(r.status).toBe("ok");
    expect(m.ingestas).toEqual([{ empresa: B.organizacionId, waIds: ["wamid.B1"] }]);
    expect(m.anotaciones).toEqual([{ empresa: B.organizacionId, integracionId: B.integracionId }]);
    expect(m.lecturasDeSecreto).toEqual([
      { empresa: B.organizacionId, integracionId: B.integracionId },
      { empresa: A.organizacionId, integracionId: A.integracionId },
    ]);
  });

  it("número desconocido o firma inválida: descartado; ninguno válido: 401 sin efectos", async () => {
    // Evento de A firmado con el App Secret de B.
    const m1 = montar();
    const deA = cuerpo(change(A.numero, "wamid.A1"));
    expect(await m1.servicio.recibir({ cuerpoCrudo: deA, firma: firmar(deA, B.appSecret) })).toEqual({
      status: "unauthorized",
    });
    expect(m1.ingestas).toHaveLength(0);
    expect(m1.anotaciones).toHaveLength(0);
    expect(m1.depuraciones).toHaveLength(0);

    // Firma con forma valida pero de otro cuerpo.
    const m2 = montar();
    expect(
      await m2.servicio.recibir({ cuerpoCrudo: deA, firma: firmar(cuerpo(change(A.numero, "otro")), A.appSecret) }),
    ).toEqual({ status: "unauthorized" });
    expect(m2.ingestas).toHaveLength(0);

    // Numero que no es de ninguna empresa: ni se lee un App Secret.
    const m3 = montar();
    const desconocido = cuerpo(change("999999999", "wamid.X"));
    expect(
      await m3.servicio.recibir({ cuerpoCrudo: desconocido, firma: firmar(desconocido, A.appSecret) }),
    ).toEqual({ status: "unauthorized" });
    expect(m3.lecturasDeSecreto).toHaveLength(0);
    expect(m3.ingestas).toHaveLength(0);
    expect(m3.anotaciones).toHaveLength(0);

    // Un numero desconocido junto a uno valido: solo entra el valido, y el desconocido no se ingiere
    // en la empresa del otro.
    const m4 = montar();
    const mixto = cuerpo(change("999999999", "wamid.X"), change(A.numero, "wamid.A1"));
    const r4 = await m4.servicio.recibir({ cuerpoCrudo: mixto, firma: firmar(mixto, A.appSecret) });
    expect(r4.status).toBe("ok");
    expect(m4.ingestas).toEqual([{ empresa: A.organizacionId, waIds: ["wamid.A1"] }]);
  });

  it("POST sin firma, con firma mal formada, sin JSON o sin números: 401 sin leer la base", async () => {
    const m = montar();
    const deA = cuerpo(change(A.numero, "wamid.A1"));
    const sinNumero = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });
    for (const evento of [
      { cuerpoCrudo: deA, firma: null },
      { cuerpoCrudo: deA, firma: "md5=abc" },
      { cuerpoCrudo: "{no-json", firma: firmar("{no-json", A.appSecret) },
      { cuerpoCrudo: sinNumero, firma: firmar(sinNumero, A.appSecret) },
    ]) {
      expect(await m.servicio.recibir(evento)).toEqual({ status: "unauthorized" });
    }
    expect(m.enrutado.porNumeros).not.toHaveBeenCalled();
    expect(m.ingestas).toHaveLength(0);
  });

  it("POST de una empresa sin App Secret legible: descartado con 401", async () => {
    const m = montar({ leerAppSecret: async () => null });
    const deA = cuerpo(change(A.numero, "wamid.A1"));
    expect(await m.servicio.recibir({ cuerpoCrudo: deA, firma: firmar(deA, A.appSecret) })).toEqual({
      status: "unauthorized",
    });
    expect(m.ingestas).toHaveLength(0);
  });

  it("el log de un descarte lleva solo conteos: ni secreto, ni firma, ni números", async () => {
    const m = montar();
    const mixto = cuerpo(change("999999999", "wamid.X"), change(A.numero, "wamid.A1"));
    const firma = firmar(mixto, B.appSecret);
    await m.servicio.recibir({ cuerpoCrudo: mixto, firma });
    const log = m.avisos.join("\n");
    expect(log).toContain("1 empresa(s) con firma invalida, 1 numero(s) desconocido(s)");
    for (const prohibido of [A.appSecret, B.appSecret, firma, A.numero, "999999999", NUMERO_CLIENTE]) {
      expect(log).not.toContain(prohibido);
    }
  });

  it("los estados de entregas se aplican en la empresa; si construir el service falla, el 200 se mantiene", async () => {
    const empresasDeEntregas: (string | undefined)[] = [];
    const statusDeA = {
      field: "messages",
      value: {
        metadata: { phone_number_id: A.numero },
        statuses: [{ id: "wamid.OUT1", status: "delivered", timestamp: "1700000001", recipient_id: NUMERO_CLIENTE }],
      },
    };
    const crudo = cuerpo(statusDeA);
    const ok = montar({
      entregaEstado: () => ({
        aplicar: async () => {
          empresasDeEntregas.push(empresaDelContexto());
          return 1;
        },
      }),
    });
    expect((await ok.servicio.recibir({ cuerpoCrudo: crudo, firma: firmar(crudo, A.appSecret) })).status).toBe("ok");
    expect(empresasDeEntregas).toEqual([A.organizacionId]);

    const roto = montar({
      entregaEstado: () => {
        throw new Error("no se pudo construir");
      },
    });
    expect((await roto.servicio.recibir({ cuerpoCrudo: crudo, firma: firmar(crudo, A.appSecret) })).status).toBe("ok");
    expect(roto.avisos.join("\n")).toContain("estados de entregas no aplicados: Error");
  });
});
