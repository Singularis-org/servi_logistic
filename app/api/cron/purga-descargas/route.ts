// Ficha 470 (design §3.6, R17–R20) — Route Handler del cron de purga de los objetos temporales de las
// descargas grandes (bucket privado `descargas`, `tmp/<uuid>.json.gz`). Cada 15 min (`vercel.json`).
// Capa Controller: solo HTTP + autorizacion por `CRON_SECRET`; delega en `PurgaDescargasService`.
// Clon estructural de `app/api/cron/purga-pdf-cargas/route.ts`, con el MISMO secreto via
// `loadCronConfig()`: esta ficha NO añade env de secreto nueva. NUNCA loguea el secreto ni rutas.
//
// SL-19 (design §3.4, R21): cada empresa tiene su carpeta `tmp/` en el bucket y el almacen solo
// alcanza la de la empresa en curso. La purga corre una vez por empresa, como `purga-pdf-cargas`.
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import type { IPurgaDescargasService } from "@/lib/interfaces/services/IPurgaDescargasService";
import { PurgaDescargasService } from "@/lib/services/PurgaDescargasService";
import { SupabaseAlmacenDescargas } from "@/lib/storage/SupabaseAlmacenDescargas";
import { loadCronConfig } from "@/lib/config/cron";
import { loadDescargaConfig } from "@/lib/config/descarga";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";

export const runtime = "nodejs";

/**
 * Presupuesto de la corrida: hasta 5.000 objetos POR EMPRESA, en lotes de 1.000 (un `list` + un
 * `remove` por lote). Mismo techo que `purga-pdf-cargas`.
 */
export const maxDuration = 60;

export interface PurgaDescargasDeps {
  /** Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno. */
  getSecret?: () => string | null;
  service?: IPurgaDescargasService;
  /** Reloj inyectable (tests). El corte es `now − RETENCION_MINUTOS` en milisegundos exactos. */
  now?: () => Date;
  /** SL-19 (R21): fuente de las empresas que se recorren (un doble en tests). */
  empresas?: ClienteDeOrganizaciones;
}

type ResumenPurgaDescargas = { objetosBorrados: number; quedaPendiente: boolean };

function sumar(corridas: ResumenPurgaDescargas[]): ResumenPurgaDescargas {
  return corridas.reduce<ResumenPurgaDescargas>(
    (t, r) => ({
      objetosBorrados: t.objetosBorrados + r.objetosBorrados,
      quedaPendiente: t.quedaPendiente || r.quedaPendiente,
    }),
    { objetosBorrados: 0, quedaPendiente: false },
  );
}

/**
 * COMPOSITION ROOT. El bucket sale de `loadDescargaConfig()` (el mismo con el que la entrega sube);
 * la config se pasa COMO FUNCION para resolver la retencion en cada corrida.
 */
function buildService(): IPurgaDescargasService {
  const cfg = loadDescargaConfig();
  return new PurgaDescargasService(new SupabaseAlmacenDescargas(undefined, cfg.BUCKET), loadDescargaConfig);
}

/** Extrae el token `Bearer <token>` del header Authorization; null si ausente/mal formado. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * R19: sin secreto / incorrecto / no configurado ⇒ 401 SIN efectos (ni se construye el service ni se
 * toca Storage). R20: `200` con SOLO conteos (y, desde SL-19, cuantas empresas se procesaron y los
 * ids de las que fallaron); cualquier fallo sale con codigo de error.
 */
export async function handlePurgaDescargas(req: Request, deps: PurgaDescargasDeps = {}): Promise<NextResponse> {
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || expected === "" || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withErrorHandler(async () => {
    const service = deps.service ?? buildService();
    const now = (deps.now ?? (() => new Date()))();
    const corrida = async (): Promise<ResumenPurgaDescargas> => {
      const resumen = await service.ejecutar(now);
      return { objetosBorrados: resumen.objetosBorrados, quedaPendiente: resumen.quedaPendiente };
    };
    // R21: el almacen solo alcanza la carpeta de la empresa en curso; sin empresa falla cerrado. Una
    // corrida por empresa, y el fallo de una no frena a las demas: queda en `empresas`.
    const corridas: ResumenPurgaDescargas[] = [];
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

  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handlePurgaDescargas(req);
}
