// SLT-268 (design §2; R6-R16) — disparador MANUAL del recifrado de las credenciales de integraciones,
// dentro del runtime de servi: `POST /api/cron/recifrar-integraciones[?solo-contar=1]`.
//
// Por que una ruta y no solo `pnpm integraciones:recifrar`: una clave vieja puede existir SOLO en las
// variables de Vercel (Sensitive, nadie puede leerla). El recifrado tiene que correr en un proceso que
// la tenga en su entorno, y ese proceso es el runtime desplegado. La regla es la de siempre
// (`RecifradoIntegracionesService`, SL-36 design §12); aqui solo hay HTTP, autorizacion y cableado.
//
// Capa Controller. Se autentica sola con `CRON_SECRET` (`middleware.ts` deja pasar `/api/cron/*`).
// NO esta en `vercel.json` (R16): se invoca a mano. Solo `POST` (R7): modifica datos, y un `GET` lo
// dispararia una vista previa de enlace o un prefetch.
//
// Nunca sale de aqui un secreto, un texto cifrado o descifrado, un id ni el valor de una variable: la
// respuesta son conteos copiados campo a campo (R13), y al log van solo el nombre y el codigo del error.
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";

import { loadCronConfig } from "@/lib/config/cron";
import { ConfiguracionBovedaError, leerAnilloDeClaves } from "@/lib/config/integraciones";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { paraCadaEmpresa } from "@/lib/db/para-cada-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  IRecifradoIntegracionesService,
  ResumenRecifrado,
} from "@/lib/interfaces/services/IRecifradoIntegracionesService";
import { IntegracionRecifradoRepository } from "@/lib/repositories/IntegracionRecifradoRepository";
import { RecifradoIntegracionesService, type RecifradoDeps } from "@/lib/services/RecifradoIntegracionesService";

export const runtime = "nodejs";

/** Volumen medido el 2026-11-24: 1 empresa y 3 credenciales. Mismo techo que los demas crons. */
export const maxDuration = 60;

const PARAMETRO_SOLO_CONTAR = "solo-contar";

export interface RecifrarIntegracionesDeps {
  /** Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno. */
  getSecret?: () => string | null;
  /** Fabrica del servicio. Se llama SOLO despues de autorizar y validar los parametros (R6, R8). */
  servicio?: () => IRecifradoIntegracionesService;
}

type Entorno = Readonly<Record<string, string | undefined>>;

/**
 * COMPOSITION ROOT. La misma forma que `scripts/recifrar-integraciones.ts > main`. El anillo se lee
 * en cada llamada (`leerAnilloDeClaves(env)`), nunca al importar: la app arranca sin las variables y
 * una rotacion no exige reiniciar.
 */
export function construirServicioRecifrado(
  deps: {
    prisma?: Pick<PrismaClient, "integracion">;
    env?: Entorno;
    recorrerEmpresas?: RecifradoDeps["recorrerEmpresas"];
  } = {},
): IRecifradoIntegracionesService {
  const anillo = () => leerAnilloDeClaves(deps.env ?? process.env);
  return new RecifradoIntegracionesService({
    cifrador: new BovedaIntegraciones(anillo),
    versionActiva: () => anillo().activa,
    repositorio: new IntegracionRecifradoRepository(deps.prisma ?? getPrismaClient()),
    recorrerEmpresas: deps.recorrerEmpresas ?? ((fn) => paraCadaEmpresa(fn)),
  });
}

/** Extrae el token `Bearer <token>` del header Authorization; null si ausente/mal formado. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * R8: sin parametros recifra; exactamente `solo-contar=1` solo cuenta; cualquier otra cosa (otra
 * clave, otro valor, la clave repetida) es `null`. Una errata como `?solo_contar=1` NO recifra.
 */
function modoDe(req: Request): { soloContar: boolean } | null {
  const parametros = [...new URL(req.url).searchParams];
  if (parametros.length === 0) return { soloContar: false };
  if (parametros.length === 1 && parametros[0][0] === PARAMETRO_SOLO_CONTAR && parametros[0][1] === "1") {
    return { soloContar: true };
  }
  return null;
}

/** Nombre y codigo de un error, sin su mensaje: el de Prisma lleva los argumentos, cifrados incluidos. */
function rastroDelError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === "string" && /^[A-Z0-9_]{1,12}$/.test(codigo) ? `${error.name} ${codigo}` : error.name;
}

/** R13: las 7 claves, copiadas una a una. Un campo de mas en el resultado del servicio no sale. */
function respuestaDe(resumen: ResumenRecifrado): ResumenRecifrado {
  return {
    soloContar: resumen.soloContar,
    versionActiva: resumen.versionActiva,
    porVersion: { ...resumen.porVersion },
    ilegibles: resumen.ilegibles,
    recifrados: resumen.recifrados,
    conflictos: resumen.conflictos,
    empresasConError: resumen.empresasConError,
  };
}

export async function handleRecifrarIntegraciones(
  req: Request,
  deps: RecifrarIntegracionesDeps = {},
): Promise<NextResponse> {
  // R6: lo primero. Sin el secreto correcto no se construye el servicio, no se lee el anillo y no se
  // consulta la base.
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || expected === "" || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // R8: no se repite lo recibido; alguien podria pegar una clave en la URL.
  const modo = modoDe(req);
  if (modo === null) {
    return NextResponse.json({ error: "parametro_no_reconocido" }, { status: 400 });
  }

  // Sin `withErrorHandler`: no esta demostrado que no vuelque el mensaje al log, y el de Prisma lleva
  // los valores cifrados. Es la misma decision que el script.
  let resumen: ResumenRecifrado;
  try {
    resumen = await (deps.servicio ?? construirServicioRecifrado)().ejecutar(modo);
  } catch (error) {
    // R15: el servicio lee la version activa antes de recorrer empresas, asi que la base no se toco.
    if (error instanceof ConfiguracionBovedaError) {
      console.error("[recifrar-integraciones] configuracion de la boveda invalida");
      return NextResponse.json({ error: "configuracion_boveda" }, { status: 500 });
    }
    console.error(`[recifrar-integraciones] fallo el recifrado (${rastroDelError(error)})`);
    return NextResponse.json({ error: "recifrado_fallido" }, { status: 500 });
  }

  // R14: con una empresa fallida el conteo esta incompleto; mismo resumen, status 500.
  return NextResponse.json(respuestaDe(resumen), { status: resumen.empresasConError > 0 ? 500 : 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleRecifrarIntegraciones(req);
}
