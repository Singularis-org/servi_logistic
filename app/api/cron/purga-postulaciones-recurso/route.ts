// Feature 253 (P2, FIRMADA EN CONTRA de la recomendacion del spec el 2026-08-21) — Route Handler
// del cron DIARIO que borra las postulaciones de vehiculo o bodega YA ATENDIDAS pasados N meses.
//
// ⚠️ **ESTO BORRA Y ES IRREVERSIBLE.** No hay papelera ni borrado logico: la fila desaparece. Lo
// que decide el borrado NO esta aqui —esta capa es solo HTTP + autorizacion— sino en
// `PurgaPostulacionRecursoService` y en `PostulacionRecursoRepository.purgarAtendidasAnterioresA`,
// y se resume en una frase: `atendida_at IS NOT NULL AND atendida_at < now - N meses`.
// ⛔ `created_at` no participa: una postulacion SIN ATENDER no se borra jamas.
//
// Es un cron, asi que va como Route Handler y no como Server Action (docs/architecture.md, tabla
// "Server Actions vs Route Handlers"). Clon estructural de `app/api/cron/purga-pdf-cargas/route.ts`
// (feature 178), con el MISMO `CRON_SECRET` via `loadCronConfig()`: esta feature NO anade env de
// secreto nueva.
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import { loadCronConfig } from "@/lib/config/cron";
import { loadPostulacionRecursoConfig } from "@/lib/config/postulacion-recurso";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import type { IPurgaPostulacionRecursoService } from "@/lib/interfaces/services/IPurgaPostulacionRecursoService";
import { PostulacionRecursoRepository } from "@/lib/repositories/PostulacionRecursoRepository";
import { PurgaPostulacionRecursoService } from "@/lib/services/PurgaPostulacionRecursoService";

// El runtime de Node es OBLIGATORIO: Prisma no corre en edge.
export const runtime = "nodejs";

export interface PurgaPostulacionesRecursoDeps {
  /** Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno. */
  getSecret?: () => string | null;
  service?: IPurgaPostulacionRecursoService;
  /** Reloj inyectable (tests): por defecto `new Date()`. El corte es `now - N meses`. */
  now?: () => Date;
  // SL-17 (R16): fuente de las empresas que se recorren (un doble en tests). Con `service`
  // inyectado y sin `empresas`, una sola corrida sin recorrer empresas: el contrato de los tests
  // de controller anteriores a SL-17.
  empresas?: ClienteDeOrganizaciones;
}

/**
 * COMPOSITION ROOT. `loadPostulacionRecursoConfig` se pasa COMO FUNCION, sin invocar: la retencion
 * se resuelve en cada corrida (el proceso serverless sobrevive entre invocaciones), asi que un
 * valor congelado al importar dejaria dos corridas con ventanas distintas.
 */
function buildService(): IPurgaPostulacionRecursoService {
  return new PurgaPostulacionRecursoService(
    new PostulacionRecursoRepository(getPrismaClient()),
    loadPostulacionRecursoConfig,
  );
}

// Resumen de UNA corrida, campo a campo y sin PII (el mismo que devolvia la ruta).
type ResumenPurgaPostulaciones = { corte: string; quedaPendiente: boolean; borradas: number };

// Las fechas salen del mismo instante y son iguales en todas las corridas; sin empresas no hay
// corrida de la que tomarlas y van `null`.
type Total = { corte: string | null; quedaPendiente: boolean; borradas: number };

function sumar(corridas: ResumenPurgaPostulaciones[]): Total {
  return corridas.reduce<Total>(
    (t, r) => ({
      corte: t.corte ?? r.corte,
      quedaPendiente: t.quedaPendiente || r.quedaPendiente,
      borradas: t.borradas + r.borradas,
    }),
    { corte: null, quedaPendiente: false, borradas: 0 },
  );
}

/** Extrae el token `Bearer <token>` del header Authorization; null si ausente o mal formado. */
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * Logica del endpoint, extraida de `GET` para poder inyectar dependencias en test (secreto +
 * service doble + reloj) sin DB real ni entorno.
 *
 * Autorizacion ANTES de cualquier efecto: sin secreto, con secreto incorrecto o con el secreto no
 * configurado -> 401 y NI SIQUIERA se construye el service. En un endpoint que borra, esa
 * precedencia no es estilo: es la diferencia entre un 401 y una perdida de datos.
 *
 * El cuerpo de la respuesta es SOLO numerico + el corte en ISO: nunca ids, nombres, correos,
 * telefonos ni el secreto (R19).
 */
export async function handlePurgaPostulacionesRecurso(
  req: Request,
  deps: PurgaPostulacionesRecursoDeps = {},
): Promise<NextResponse> {
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || expected === "" || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withErrorHandler(async () => {
    const service = deps.service ?? buildService();
    const now = (deps.now ?? (() => new Date()))();
    const corrida = async (): Promise<ResumenPurgaPostulaciones> => {
      const resumen = await service.ejecutar(now);
      return {
        borradas: resumen.borradas,
        corte: resumen.corte,
        quedaPendiente: resumen.quedaPendiente,
      };
    };
    if (deps.service !== undefined && deps.empresas === undefined) return corrida();
    // SL-17 (R16): `postulacion_recurso` es de cada empresa: una corrida por empresa, cada una en
    // su contexto. Un fallo en una no frena a las demas y queda en `empresas`.
    const corridas: ResumenPurgaPostulaciones[] = [];
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
  return handlePurgaPostulacionesRecurso(req);
}
