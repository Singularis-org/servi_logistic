import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { buildWebhookWhatsappService, handleGet, handlePost } from "@/app/api/webhooks/whatsapp/route";
import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  type TxDeTest,
} from "@/tests/integration/db/_postgres-real";

// Feature 109 (R1-R4, R9, R11) + SL-36 (design §10; R19, R20, R21) — el route del webhook contra
// Postgres real, con el composition root de produccion (`buildWebhookWhatsappService`) montado
// sobre la transaccion del caso: enrutado por numero, App Secret descifrado de la integracion de
// CADA empresa con `CredencialesIntegracionService`, anotacion del ultimo contacto e ingesta reales.
// Solo la boveda lleva un anillo de prueba (el del entorno no existe en CI).
//
// Dos empresas, A y B, cada una con su numero, su token de verificacion y su App Secret. La prueba
// de que el evento se ingirio EN SU EMPRESA es la marca `ultimo_webhook_at`: la deja
// `IntegracionRepository.anotarWebhook`, que filtra por la empresa del contexto, y solo despues de
// validar la firma con el App Secret de esa empresa.
//
// Mutacion medida (progress/impl_SL-36-T6a.md): firmar el evento de A con el App Secret de B en el
// caso «cada evento en su empresa» lo deja en rojo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const boveda = new BovedaIntegraciones(() => ({ activa: "v1", claves: new Map([["v1", Buffer.alloc(32, 0x3c)]]) }));
const resumidor = new ResumenSecretoSha256();

let base: PrismaClient;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transaccion del dueno que siempre se revierte, bajo el lock de escritura real de la 227. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

interface Empresa {
  org: string;
  integracionId: string;
  numero: string;
  token: string;
  appSecret: string;
}

/** Una empresa nueva con su WhatsApp conectado, sus dos secretos cifrados con SU contexto. */
async function empresaConWhatsapp(tx: TxDeTest): Promise<Empresa> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const integracionId = randomUUID();
  const numero = `7${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const token = `verificacion-${randomUUID()}`;
  const appSecret = `app-secret-${randomUUID()}`;
  const cifrar = (valor: string, campo: string) => boveda.cifrar(valor, { organizacionId: org, integracionId, campo });
  const secretos = JSON.stringify({
    token_acceso: await cifrar(`token-${randomUUID()}`, "token_acceso"),
    app_secret: await cifrar(appSecret, "app_secret"),
  });
  const datosPublicos = JSON.stringify({
    nombreVisible: "WhatsApp de prueba",
    wabaId: "123456",
    telefonoVisible: "+506 8888 0000",
    nombreVerificado: "Prueba",
  });
  await tx.$executeRawUnsafe(
    `INSERT INTO integracion (id, servicio, estado, datos_publicos, secretos, whatsapp_numero_id, whatsapp_resumen_verificacion)
     VALUES ($1, 'whatsapp', 'conectada', $2::jsonb, $3::jsonb, $4, $5)`,
    integracionId,
    datosPublicos,
    secretos,
    numero,
    resumidor.resumen(token),
  );
  return { org, integracionId, numero, token, appSecret };
}

async function ultimoWebhook(tx: TxDeTest, integracionId: string): Promise<Date | null> {
  const filas = await tx.$queryRawUnsafe<{ ultimo_webhook_at: Date | null }[]>(
    `SELECT ultimo_webhook_at FROM integracion WHERE id = $1`,
    integracionId,
  );
  return filas[0]?.ultimo_webhook_at ?? null;
}

function firmar(raw: string, secreto: string): string {
  return "sha256=" + createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
}

/** Un estado de un mensaje que no existe: la ingesta lo lee en la empresa y no escribe nada. */
function cuerpoDe(numero: string): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "50688880000", phone_number_id: numero },
              statuses: [{ id: `wamid.${randomUUID()}`, status: "delivered", timestamp: "1759662000", recipient_id: "50688887777" }],
            },
          },
        ],
      },
    ],
  });
}

function post(raw: string, firma: string | null): Request {
  return new Request("https://x/api/webhooks/whatsapp", {
    method: "POST",
    body: raw,
    headers: firma === null ? {} : { "x-hub-signature-256": firma },
  });
}

function serviceSobre(tx: TxDeTest) {
  return buildWebhookWhatsappService({
    prisma: clienteConTransaccionAnidada(tx),
    cifrador: boveda,
    logger: { warn: () => {} },
  });
}

describeSiHayBase("SL-36 — webhook de WhatsApp por número contra Postgres real", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("⭑ R20: dos empresas, el evento de cada una se ingiere en SU empresa con SU App Secret", async () => {
    const r = await revertida(async (tx) => {
      const a = await empresaConWhatsapp(tx);
      const b = await empresaConWhatsapp(tx);
      const service = serviceSobre(tx);
      const rawA = cuerpoDe(a.numero);
      const rawB = cuerpoDe(b.numero);
      const resA = await handlePost(post(rawA, firmar(rawA, a.appSecret)), { service });
      const tras = { a: await ultimoWebhook(tx, a.integracionId), b: await ultimoWebhook(tx, b.integracionId) };
      const resB = await handlePost(post(rawB, firmar(rawB, b.appSecret)), { service });
      return {
        statusA: resA.status,
        cuerpoA: await resA.json(),
        statusB: resB.status,
        tras,
        final: { a: await ultimoWebhook(tx, a.integracionId), b: await ultimoWebhook(tx, b.integracionId) },
      };
    });

    expect(r.statusA).toBe(200);
    expect(r.cuerpoA).toMatchObject({ ok: true });
    // El POST de A solo toca la integracion de A.
    expect(r.tras.a).toBeInstanceOf(Date);
    expect(r.tras.b).toBeNull();
    expect(r.statusB).toBe(200);
    expect(r.final.b).toBeInstanceOf(Date);
  });

  it("R21: el evento de A firmado con el App Secret de B -> 401 y ninguna integracion cambia", async () => {
    const r = await revertida(async (tx) => {
      const a = await empresaConWhatsapp(tx);
      const b = await empresaConWhatsapp(tx);
      const raw = cuerpoDe(a.numero);
      const res = await handlePost(post(raw, firmar(raw, b.appSecret)), { service: serviceSobre(tx) });
      return { status: res.status, a: await ultimoWebhook(tx, a.integracionId), b: await ultimoWebhook(tx, b.integracionId) };
    });
    expect(r).toEqual({ status: 401, a: null, b: null });
  });

  it("R21: un número que no es de ninguna empresa -> 401; sin firma -> 401", async () => {
    const r = await revertida(async (tx) => {
      const a = await empresaConWhatsapp(tx);
      const raw = cuerpoDe(`desconocido-${randomUUID()}`);
      const desconocido = await handlePost(post(raw, firmar(raw, a.appSecret)), { service: serviceSobre(tx) });
      const propio = cuerpoDe(a.numero);
      const sinFirma = await handlePost(post(propio, null), { service: serviceSobre(tx) });
      return { desconocido: desconocido.status, sinFirma: sinFirma.status, a: await ultimoWebhook(tx, a.integracionId) };
    });
    expect(r).toEqual({ desconocido: 401, sinFirma: 401, a: null });
  });

  it("R19: GET con el token de A devuelve el challenge y anota SOLO a A; un token ajeno da 403", async () => {
    const r = await revertida(async (tx) => {
      const a = await empresaConWhatsapp(tx);
      const b = await empresaConWhatsapp(tx);
      const url = (token: string) =>
        `https://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=CH-1`;
      const ok = await handleGet(new Request(url(a.token)), { service: serviceSobre(tx) });
      const no = await handleGet(new Request(url(`otro-${randomUUID()}`)), { service: serviceSobre(tx) });
      return {
        ok: { status: ok.status, texto: await ok.text(), tipo: ok.headers.get("content-type") },
        no: { status: no.status, texto: await no.text() },
        a: await ultimoWebhook(tx, a.integracionId),
        b: await ultimoWebhook(tx, b.integracionId),
      };
    });
    expect(r.ok).toEqual({ status: 200, texto: "CH-1", tipo: "text/plain" });
    expect(r.no.status).toBe(403);
    expect(r.no.texto).not.toContain("CH-1");
    expect(r.a).toBeInstanceOf(Date);
    expect(r.b).toBeNull();
  });

  it("R11: ni en exito ni en fallo salen por consola el App Secret, el token ni el numero", async () => {
    const espias = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    try {
      const a = await revertida(async (tx) => {
        const e = await empresaConWhatsapp(tx);
        const service = buildWebhookWhatsappService({ prisma: clienteConTransaccionAnidada(tx), cifrador: boveda });
        const raw = cuerpoDe(e.numero);
        await handlePost(post(raw, firmar(raw, e.appSecret)), { service });
        await handlePost(post(raw, firmar(raw, "otro-secreto")), { service });
        await handleGet(
          new Request(`https://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${e.token}&hub.challenge=C`),
          { service },
        );
        return e;
      });
      const todo = espias
        .flatMap((s) => s.mock.calls)
        .flat()
        .map(String)
        .join(" | ");
      expect(todo).not.toContain(a.appSecret);
      expect(todo).not.toContain(a.token);
      expect(todo).not.toContain(a.numero);
    } finally {
      espias.forEach((s) => s.mockRestore());
    }
  });
});
