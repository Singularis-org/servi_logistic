// Feature 45 (R27-R31) — Route Handler del cron DIARIO de GASTOS FIJOS (feature 84: era mensual
// dia 1; ahora corre `0 6 * * *` y el SERVICE filtra que plantillas aplican hoy). Capa Controller:
// solo HTTP + autorizacion por `CRON_SECRET`; delega TODA la logica de negocio en
// GeneracionGastosFijosService (docs/architecture.md, patron Controller -> Service -> Repo).
// Sin queries ni logica de negocio aqui. NUNCA loguea el secreto ni PII (R29). Clon del patron
// de `corte-diario` (feature 41) / `liberar-reprogramadas` (feature 46), con el MISMO
// CRON_SECRET. Auth ANTES de cualquier efecto (401 sin construir el service ni tocar la DB).
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import type { IGeneracionGastosFijosService } from "@/lib/interfaces/services/IGeneracionGastosFijosService";
import { GeneracionGastosFijosService } from "@/lib/services/GeneracionGastosFijosService";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { GastoFijoPlantillaRepository } from "@/lib/repositories/GastoFijoPlantillaRepository";
import { GastoFijoCobroRepository } from "@/lib/repositories/GastoFijoCobroRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { loadCronConfig } from "@/lib/config/cron";
import { notificarGastoFijoCobroPendienteReal } from "@/lib/notificaciones/notificadores";

export interface GenerarGastosFijosDeps {
  // Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno.
  getSecret?: () => string | null;
  service?: IGeneracionGastosFijosService;
  // Reloj inyectable (tests): por defecto `new Date()`. Determina el dia CR de la corrida, y con
  // el que plantillas aplican hoy (feature 84; la regla vive en el service, no aca).
  now?: () => Date;
  // SL-17 (R16): fuente de las empresas que se recorren (un doble en tests). Con `service`
  // inyectado y sin `empresas`, una sola corrida sin recorrer empresas: el contrato de los tests
  // de controller anteriores a SL-17.
  empresas?: ClienteDeOrganizaciones;
}

type ResumenGastos = {
  fecha: string;
  plantillasActivas: number;
  plantillasQueAplicanHoy: number;
  egresosGenerados: number;
  cobrosPendientesCreados: number;
  cobrosPendientesTotales: number;
};

// La fecha es la misma en todas las corridas (sale del mismo `hoy`); sin empresas no hay corrida
// de la que tomarla y va `null`.
function sumar(corridas: ResumenGastos[]): Omit<ResumenGastos, "fecha"> & { fecha: string | null } {
  return corridas.reduce<Omit<ResumenGastos, "fecha"> & { fecha: string | null }>(
    (t, r) => ({
      fecha: t.fecha ?? r.fecha,
      plantillasActivas: t.plantillasActivas + r.plantillasActivas,
      plantillasQueAplicanHoy: t.plantillasQueAplicanHoy + r.plantillasQueAplicanHoy,
      egresosGenerados: t.egresosGenerados + r.egresosGenerados,
      cobrosPendientesCreados: t.cobrosPendientesCreados + r.cobrosPendientesCreados,
      cobrosPendientesTotales: t.cobrosPendientesTotales + r.cobrosPendientesTotales,
    }),
    {
      fecha: null,
      plantillasActivas: 0,
      plantillasQueAplicanHoy: 0,
      egresosGenerados: 0,
      cobrosPendientesCreados: 0,
      cobrosPendientesTotales: 0,
    },
  );
}

function buildService(): IGeneracionGastosFijosService {
  const prisma = getPrismaClient();
  return new GeneracionGastosFijosService(
    new GastoFijoPlantillaRepository(prisma),
    new WalletMovimientoRepository(prisma),
    // Ficha 333 (D3): el repo de COBROS pendientes, para las plantillas que requieren aprobacion.
    new GastoFijoCobroRepository(prisma),
    // Ficha 333 (R10): las DOS escrituras de la corrida, en UNA transaccion interactiva.
    (fn) => prisma.$transaction((tx) => fn(tx)),
    // ⚠️ FICHA 333 (E3, R34) — COMPOSITION ROOT del aviso «quedan N cobros por aprobar». Se cablea
    // AQUI y no como default del service (ver `lib/notificaciones/notificadores.ts`): el default
    // es el no-op para que ninguna suite escriba avisos en la base, que es COMPARTIDA.
    //
    // ESTA LINEA ES EL REQUISITO, NO EL `import` DE ARRIBA. En `corte-diario` la llamada pasaba
    // cinco argumentos y el notificador se quedaba con su default: el aviso nocturno no se emitio
    // JAMAS, con la suite entera en verde. Borrar este argumento —dejando el import intacto—
    // reproduce ese fallo, y por eso la guardia de
    // `tests/unit/services/notificacion-notificadores-reales.test.ts` afirma sobre el USO
    // EFECTIVO (fuente sin imports ni comentarios) y no sobre el fichero entero.
    notificarGastoFijoCobroPendienteReal,
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
 * (secreto + service fake + reloj) sin DB real ni entorno. R29: sin/incorrecto secreto (o no
 * configurado) -> 401 sin efectos (ni siquiera se construye el service ni se toca la DB).
 * NUNCA se loguea el secreto. 200 con conteos agregados (sin PII).
 */
export async function handleGenerarGastosFijos(
  req: Request,
  deps: GenerarGastosFijosDeps = {},
): Promise<NextResponse> {
  // R29: autorizacion ANTES de cualquier efecto. Secreto no configurado -> 401 (el endpoint
  // no queda abierto). Reutiliza el MISMO CRON_SECRET que corte-diario/liberar-reprogramadas.
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withErrorHandler(async () => {
    const service = deps.service ?? buildService();
    // Feature 84: TODA la decision (que plantillas aplican hoy, que periodo/clave usa cada una)
    // vive en el service; el controller solo le pasa `now`.
    const hoy = (deps.now ?? (() => new Date()))();
    const corrida = async (): Promise<ResumenGastos> => {
      const resumen = await service.ejecutarGeneracion(hoy);
      // R29 (45) / R13 (333): resumen SIN PII — solo conteos + la fecha CR de la corrida. Se
      // enumera campo a campo A PROPOSITO, en vez de devolver `resumen` entero: asi, el dia que el
      // servicio gane un campo con un monto o un identificador, no cruza a la respuesta sola.
      return {
        fecha: resumen.fecha,
        plantillasActivas: resumen.plantillasActivas,
        plantillasQueAplicanHoy: resumen.plantillasQueAplicanHoy,
        egresosGenerados: resumen.egresosGenerados,
        // Ficha 333 (R13): los cobros pendientes creados y los que quedan. Dos numeros, sin monto,
        // sin concepto y sin identificador de persona.
        cobrosPendientesCreados: resumen.cobrosPendientesCreados,
        cobrosPendientesTotales: resumen.cobrosPendientesTotales,
      };
    };
    if (deps.service !== undefined && deps.empresas === undefined) return corrida();
    // SL-17 (R16): plantillas, movimientos y cobros son de cada empresa: una corrida por empresa,
    // cada una en su contexto. Un fallo en una no frena a las demas y queda en `empresas`.
    const corridas: ResumenGastos[] = [];
    const empresas = await paraCadaEmpresa(
      async () => {
        corridas.push(await corrida());
      },
      // SL-23 (R21): las empresas con el módulo apagado no corren; quedan en `saltadas`.
      { cliente: deps.empresas, modulo: "wallet" },
    );
    return {
      ...sumar(corridas),
      empresas: {
        procesadas: empresas.ok.length,
        fallidas: empresas.fallidas.map((f) => f.organizacionId),
        saltadas: empresas.saltadas.length,
      },
    };
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result); // error notificado por el logger, sin secreto
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleGenerarGastosFijos(req);
}
