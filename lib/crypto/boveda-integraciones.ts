import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { leerAnilloDeClaves, type AnilloDeClaves } from "@/lib/config/integraciones";
import type { ContextoSecreto, ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IFuenteAleatoria } from "@/lib/interfaces/external/IFuenteAleatoria";
import type { IResumenSecreto } from "@/lib/interfaces/external/IResumenSecreto";

/**
 * SL-36 (design §3; R1-R4, R38) — la boveda de las credenciales de las integraciones.
 *
 * AES-256-GCM de `node:crypto`, sin libreria de terceros (R1). No reutiliza
 * `lib/crypto/webhook-secret-cipher.ts`: aquel no liga el valor a su fila ni tiene anillo de claves.
 */

/**
 * Parte del contrato de los datos asociados: cambiarla deja ilegible todo lo ya cifrado.
 */
export const ETIQUETA_DATOS_ASOCIADOS = "integraciones.secreto";

const ALGORITMO = "aes-256-gcm";
const BYTES_IV = 12;
const BYTES_TAG = 16;

/**
 * `v<n>:<iv 12 bytes>:<tag 16 bytes>:<cifrado>` en base64 ESTANDAR estricta (QC inv. 15). Es la
 * misma forma que exige el CHECK `integracion_secretos_cifrados` de la migracion
 * 20261025120000: si cambia aqui, cambia alli en una migracion nueva.
 */
const FORMA_GUARDADA =
  /^(v[1-9][0-9]*):([A-Za-z0-9+/]{16}):([A-Za-z0-9+/]{22}==):((?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/;

/** Por que no se pudo leer, para el log interno. Sin valores: ni del guardado ni de la clave. */
export type DiagnosticoIlegible = "forma_invalida" | "version_ausente" | "no_autentica";

/**
 * El UNICO error de lectura (R3). Sin `cause` a proposito: el error de OpenSSL encadenado puede
 * llevar trozos del valor, y quien lo registre lo filtraria. El mensaje es siempre el mismo, asi
 * que tampoco distingue ante un atacante «otra empresa» de «alterado».
 */
export class CredencialIlegibleError extends Error {
  readonly codigo = "credencial_ilegible" as const;
  constructor(readonly diagnostico: DiagnosticoIlegible) {
    super("credencial ilegible");
    this.name = "CredencialIlegibleError";
  }
}

/** Texto vacio o contexto incompleto: un error del llamador, no una credencial ilegible. */
export class EntradaDeBovedaInvalidaError extends Error {
  readonly codigo = "invalid_input" as const;
  constructor(motivo: "texto_vacio" | "contexto_incompleto") {
    super(`entrada de boveda invalida: ${motivo}`);
    this.name = "EntradaDeBovedaInvalidaError";
  }
}

function exigirContexto(ctx: ContextoSecreto): void {
  const completo = [ctx?.organizacionId, ctx?.integracionId, ctx?.campo].every(
    (parte) => typeof parte === "string" && parte !== "",
  );
  if (!completo) throw new EntradaDeBovedaInvalidaError("contexto_incompleto");
}

/**
 * Los datos asociados, codificados en JSON y NUNCA unidos con `:` (QC inv. 2): con `:`,
 * `("a:b", "c")` y `("a", "b:c")` darian los mismos bytes y un cifrado se leeria en otra fila.
 */
function datosAsociados(version: string, ctx: ContextoSecreto): Buffer {
  return Buffer.from(
    JSON.stringify([ETIQUETA_DATOS_ASOCIADOS, version, ctx.organizacionId, ctx.integracionId, ctx.campo]),
    "utf8",
  );
}

/**
 * Decodifica y exige que la base64 sea CANONICA: Node ignora los bits de relleno del ultimo
 * caracter, asi que un tag con ese caracter cambiado decodificaria a los mismos bytes y un valor
 * alterado se daria por bueno.
 */
function decodificarCanonica(base64: string): Buffer | null {
  const bytes = Buffer.from(base64, "base64");
  return bytes.toString("base64") === base64 ? bytes : null;
}

type Partes = { version: string; iv: Buffer; tag: Buffer; cifrado: Buffer };

function partesDe(guardado: string): Partes | null {
  const m = typeof guardado === "string" ? FORMA_GUARDADA.exec(guardado) : null;
  if (!m) return null;
  const iv = decodificarCanonica(m[2]);
  const tag = decodificarCanonica(m[3]);
  const cifrado = decodificarCanonica(m[4]);
  if (!iv || !tag || !cifrado || iv.length !== BYTES_IV || tag.length !== BYTES_TAG) return null;
  return { version: m[1], iv, tag, cifrado };
}

export class BovedaIntegraciones implements ICifradorSecretos {
  /**
   * El anillo se pide en CADA operacion (R4): rotar la activa no exige reiniciar, y sin las
   * variables la app arranca y solo falla quien cifra o descifra.
   */
  constructor(private readonly leerAnillo: () => AnilloDeClaves = () => leerAnilloDeClaves()) {}

  async cifrar(texto: string, ctx: ContextoSecreto): Promise<string> {
    if (typeof texto !== "string" || texto === "") throw new EntradaDeBovedaInvalidaError("texto_vacio");
    exigirContexto(ctx);
    const { activa, claves } = this.leerAnillo();
    const iv = randomBytes(BYTES_IV);
    const cifrador = createCipheriv(ALGORITMO, claves.get(activa) as Buffer, iv, { authTagLength: BYTES_TAG });
    cifrador.setAAD(datosAsociados(activa, ctx));
    const cifrado = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
    const tag = cifrador.getAuthTag();
    return `${activa}:${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
  }

  async descifrar(guardado: string, ctx: ContextoSecreto): Promise<string> {
    exigirContexto(ctx);
    // Antes de mirar el valor: sin configuracion valida el error es de configuracion (R4), no
    // «ilegible», que mandaria a volver a escribir una credencial que esta bien.
    const { claves } = this.leerAnillo();
    const partes = partesDe(guardado);
    if (!partes) throw new CredencialIlegibleError("forma_invalida");
    const clave = claves.get(partes.version);
    if (!clave) throw new CredencialIlegibleError("version_ausente");
    try {
      const descifrador = createDecipheriv(ALGORITMO, clave, partes.iv, { authTagLength: BYTES_TAG });
      descifrador.setAAD(datosAsociados(partes.version, ctx));
      descifrador.setAuthTag(partes.tag);
      return Buffer.concat([descifrador.update(partes.cifrado), descifrador.final()]).toString("utf8");
    } catch {
      // Se descarta el error de OpenSSL a proposito: ver `CredencialIlegibleError`.
      throw new CredencialIlegibleError("no_autentica");
    }
  }

  versionDe(guardado: string): string | null {
    return partesDe(guardado)?.version ?? null;
  }
}

const FORMA_RESUMEN = /^[0-9a-f]{64}$/;

export class ResumenSecretoSha256 implements IResumenSecreto {
  resumen(secreto: string): string {
    return createHash("sha256").update(secreto, "utf8").digest("hex");
  }

  coincide(secreto: string, resumen: string): boolean {
    // Un resumen mal formado no llega a `timingSafeEqual`, que lanza con largos distintos.
    if (typeof resumen !== "string" || !FORMA_RESUMEN.test(resumen)) return false;
    const calculado = createHash("sha256").update(secreto, "utf8").digest();
    return timingSafeEqual(calculado, Buffer.from(resumen, "hex"));
  }
}

const BYTES_TOKEN_VERIFICACION = 32;

export class FuenteAleatoriaCripto implements IFuenteAleatoria {
  nuevoId(): string {
    return randomUUID();
  }

  nuevoTokenVerificacion(): string {
    return randomBytes(BYTES_TOKEN_VERIFICACION).toString("base64url");
  }
}
