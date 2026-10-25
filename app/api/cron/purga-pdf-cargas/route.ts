// Feature 178 (T18-T21, design §2/§4.4/§5, R11/R23/R24/R25) — Route Handler del cron DIARIO de
// purga de los PDF de etiquetas de cargas antiguas. Capa Controller: solo HTTP + autorizacion por
// `CRON_SECRET`; delega TODA la logica de negocio en `PurgaPdfCargasService` (docs/architecture.md,
// patron Controller -> Service -> Repo). Sin queries ni logica de negocio aqui. NUNCA loguea el
// secreto ni PII (R24). Clon estructural de `app/api/cron/procesar-devueltas-sla/route.ts`
// (feature 99), con el MISMO `CRON_SECRET` via `loadCronConfig()`: esta feature NO anade env de
// secreto nueva.
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import type { IPurgaPdfCargasService } from "@/lib/interfaces/services/IPurgaPdfCargasService";
import { PurgaPdfCargasService } from "@/lib/services/PurgaPdfCargasService";
import { PurgaPdfCargasRepository } from "@/lib/repositories/PurgaPdfCargasRepository";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { loadCronConfig } from "@/lib/config/cron";
import { loadPurgaPdfConfig } from "@/lib/config/purga-pdf";
import { etiquetasConfig } from "@/lib/config/etiquetas";

// El runtime de Node es OBLIGATORIO: Prisma no corre en edge.
export const runtime = "nodejs";

/**
 * Presupuesto de tiempo de la corrida (design §2). NINGUNA otra ruta bajo `app/api/cron/` lo
 * declara hoy: es una adicion nueva y deliberada de esta feature, no un descuido de las demas. El
 * precedente del repo es `app/api/ordenes/api-key/carga/route.ts:75`.
 *
 * Motivo (design §2.1): una corrida procesa hasta `PURGA_PDF_MAX_CARGAS_POR_CORRIDA` cargas
 * (default 200) y cada una cuesta una llamada a Storage mas una transaccion corta. El tope por
 * corrida solo puede dimensionarse contra un presupuesto EXPLICITO; con el default de plataforma
 * (10 s) la primera corrida sobre un historico de meses moriria a mitad, dejando medio trabajo
 * hecho y la respuesta en error. 60 s es el mismo techo que ya usa la carga por API.
 */
export const maxDuration = 60;

export interface PurgaPdfCargasDeps {
  // Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno.
  getSecret?: () => string | null;
  service?: IPurgaPdfCargasService;
  // Reloj inyectable (tests): por defecto `new Date()`. Se pasa CRUDO al service; el corte es
  // `now - N dias` en milisegundos (R5), no un corte de dia natural, asi que NO se trunca por
  // `startOfDayCR`.
  now?: () => Date;
  // SL-17 (R16): fuente de las empresas que se recorren (un doble en tests). Con `service`
  // inyectado y sin `empresas`, una sola corrida sin recorrer empresas: el contrato de los tests
  // de controller anteriores a SL-17.
  empresas?: ClienteDeOrganizaciones;
}

/**
 * COMPOSITION ROOT (R11). El segundo argumento de `SupabaseFileStorage` es OBLIGATORIO aqui: su
 * default es `postulacionConfig.BUCKET` (documentos de mensajeros), asi que omitirlo haria que la
 * purga borrase rutas de etiquetas contra el bucket de postulaciones — **en silencio**, porque
 * `SupabaseFileStorage.remove` descarta el `{ error }` del SDK. El bucket correcto es
 * `etiquetasConfig.ETIQUETAS_BUCKET`, el mismo con el que la 136/141 subio esos objetos.
 *
 * `loadPurgaPdfConfig` se pasa COMO FUNCION, sin invocar: R4 exige resolver la ventana en cada
 * corrida (el proceso serverless sobrevive entre invocaciones).
 */
function buildService(): IPurgaPdfCargasService {
  const prisma = getPrismaClient();
  return new PurgaPdfCargasService(
    new PurgaPdfCargasRepository(prisma),
    new SupabaseFileStorage(undefined, etiquetasConfig.ETIQUETAS_BUCKET),
    loadPurgaPdfConfig,
  );
}

// Resumen de UNA corrida, campo a campo y sin PII (el mismo que devolvia la ruta).
type ResumenPurgaPdf = {
  quedaPendiente: boolean;
  cargasPurgadas: number;
  ordenesAfectadas: number;
  objetosBorrados: number;
};

type Total = {
  quedaPendiente: boolean;
  cargasPurgadas: number;
  ordenesAfectadas: number;
  objetosBorrados: number;
};

function sumar(corridas: ResumenPurgaPdf[]): Total {
  return corridas.reduce<Total>(
    (t, r) => ({
      quedaPendiente: t.quedaPendiente || r.quedaPendiente,
      cargasPurgadas: t.cargasPurgadas + r.cargasPurgadas,
      ordenesAfectadas: t.ordenesAfectadas + r.ordenesAfectadas,
      objetosBorrados: t.objetosBorrados + r.objetosBorrados,
    }),
    { quedaPendiente: false, cargasPurgadas: 0, ordenesAfectadas: 0, objetosBorrados: 0 },
  );
}

// Extrae el token `Bearer <token>` del header Authorization; null si ausente/mal formado.
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * Logica del endpoint, extraida de `GET` para permitir inyeccion de dependencias en tests
 * (secreto + service fake + reloj) sin DB real ni entorno. R25: sin secreto / incorrecto / no
 * configurado -> 401 sin efectos (ni siquiera se construye el service, ni se toca Storage).
 * R23: `200` con el resumen agregado; cualquier fallo sale con codigo de error via
 * `appErrorToResponse` (el fallo es observable sin cola de jobs). R24: el cuerpo es SOLO numerico
 * — nunca rutas de objetos (contienen el id del usuario), nunca `carga_id`, nunca el secreto.
 */
export async function handlePurgaPdfCargas(
  req: Request,
  deps: PurgaPdfCargasDeps = {},
): Promise<NextResponse> {
  // R25: autorizacion ANTES de cualquier efecto. Secreto no configurado -> 401.
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || expected === "" || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withErrorHandler(async () => {
    const service = deps.service ?? buildService();
    const now = (deps.now ?? (() => new Date()))();
    const corrida = async (): Promise<ResumenPurgaPdf> => {
      const resumen = await service.ejecutar(now);
      // R23/R24: resumen agregado SIN PII (solo conteos + el flag de pendiente de R22).
      return {
        cargasPurgadas: resumen.cargasPurgadas,
        ordenesAfectadas: resumen.ordenesAfectadas,
        objetosBorrados: resumen.objetosBorrados,
        quedaPendiente: resumen.quedaPendiente,
      };
    };
    if (deps.service !== undefined && deps.empresas === undefined) return corrida();
    // SL-17 (R16): lee `carga` y `orden`, que son de cada empresa, para saber que PDF borrar: una
    // corrida por empresa, cada una en su contexto. Un fallo en una no frena a las demas y queda en
    // `empresas`.
    const corridas: ResumenPurgaPdf[] = [];
    const empresas = await paraCadaEmpresa(
      async () => {
        corridas.push(await corrida());
      },
      { cliente: deps.empresas },
    );
    return {
      ...sumar(corridas),
      empresas: {
        procesadas: empresas.ok.length,
        fallidas: empresas.fallidas.map((f) => f.organizacionId),
      },
    };
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result); // error ya registrado por el logger, sin secreto
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handlePurgaPdfCargas(req);
}
