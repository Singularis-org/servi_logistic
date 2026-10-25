// SL-36 (T5) — dobles de interfaz para los tests de `IntegracionesService` y
// `CredencialesIntegracionService`. El SQL ya está probado contra la base en T3
// (`tests/integration/db/integracion-*.test.ts`); aquí se prueba la regla del service.
//
// Cada doble anota la empresa del contexto en el que lo llamaron: es lo que mide R7 (la empresa
// sale del actor) sin depender de cómo la use el repositorio real.
import { vi } from "vitest";

import { CredencialIlegibleError, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { ContextoSecreto, ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { ProbadoresPorServicio, ResultadoPrueba } from "@/lib/interfaces/external/IProbadorIntegracion";
import type {
  IIntegracionRepository,
  IntegracionConSecretos,
  IntegracionGuardada,
} from "@/lib/interfaces/repositories/IIntegracionRepository";
import type { IIntegracionPruebaMinutoRepository } from "@/lib/interfaces/repositories/IIntegracionPruebaMinutoRepository";
import type { Actor } from "@/lib/interfaces/services/IIntegracionesService";
import type { IntegracionesServiceDeps } from "@/lib/services/IntegracionesService";
import type { ServicioIntegracion } from "@/lib/types/integraciones";

export const ORG_A = "00000000-0000-4000-8000-0000000000a1";
export const ORG_B = "00000000-0000-4000-8000-0000000000b2";
export const ID_NUEVO = "11111111-1111-4111-8111-111111111111";
export const ID_WHATSAPP = "22222222-2222-4222-8222-222222222222";
export const ID_MAPS = "33333333-3333-4333-8333-333333333333";
export const ID_INEXISTENTE = "44444444-4444-4444-8444-444444444444";
export const TOKEN_VERIFICACION = "token-verificacion-de-prueba-unico";
export const URL_WEBHOOK = "https://app.ejemplo.test/api/webhooks/whatsapp";
export const AHORA = new Date("2026-10-25T12:00:20.000Z");
export const MINUTO = new Date("2026-10-25T12:00:00.000Z");

export const MAESTRO_A: Actor = { usuarioId: "usuario-maestro-a", rol: "maestro", organizacionId: ORG_A };

/** Secretos en claro de los ejemplos. Ningún valor guardado, vista, resultado o log puede contenerlos. */
export const SECRETOS_CLARO = {
  tokenViejo: "token-acceso-guardado-a",
  appSecretViejo: "app-secreto-guardado-a",
  tokenNuevo: "token-acceso-nuevo-a",
  appSecretNuevo: "app-secreto-nuevo-a",
  claveMaps: "clave-mapas-de-prueba-a",
} as const;

/* -------------------------------------------------------------------------- */
/* Cifrador doble                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Guarda `v1:doble-<n>` y recuerda el texto y el contexto. Descifrar con OTRO contexto falla como la
 * bóveda real (R3): así un service que cifra con la empresa de la entrada no lee lo que guardó.
 */
export function cifradorDoble() {
  const guardados = new Map<string, { texto: string; ctx: ContextoSecreto }>();
  let n = 0;
  const cifrar = vi.fn<ICifradorSecretos["cifrar"]>(async (texto, ctx) => {
    n += 1;
    const valor = `v1:doble-${n}`;
    guardados.set(valor, { texto, ctx: { ...ctx } });
    return valor;
  });
  const descifrar = vi.fn<ICifradorSecretos["descifrar"]>(async (valor, ctx) => {
    const g = guardados.get(valor);
    if (
      g === undefined ||
      g.ctx.organizacionId !== ctx.organizacionId ||
      g.ctx.integracionId !== ctx.integracionId ||
      g.ctx.campo !== ctx.campo
    ) {
      throw new CredencialIlegibleError("no_autentica");
    }
    return g.texto;
  });
  const cifrador: ICifradorSecretos = { cifrar, descifrar, versionDe: () => "v1" };
  /** Siembra un valor guardado como si lo hubiera cifrado una operación anterior. */
  function sembrar(texto: string, ctx: ContextoSecreto): string {
    const valor = `v1:sembrado-${ctx.integracionId}-${ctx.campo}`;
    guardados.set(valor, { texto, ctx: { ...ctx } });
    return valor;
  }
  return { cifrador, cifrar, descifrar, sembrar };
}

/* -------------------------------------------------------------------------- */
/* Repositorio doble                                                            */
/* -------------------------------------------------------------------------- */

function sinSecretos(fila: IntegracionConSecretos): IntegracionGuardada {
  return {
    id: fila.id,
    servicio: fila.servicio,
    estado: fila.estado,
    datosPublicos: fila.datosPublicos,
    whatsappNumeroId: fila.whatsappNumeroId,
    ultimoErrorCodigo: fila.ultimoErrorCodigo,
    ultimaPruebaAt: fila.ultimaPruebaAt,
    ultimoWebhookAt: fila.ultimoWebhookAt,
  } as IntegracionGuardada;
}

/**
 * Filas en memoria de UNA empresa (la del contexto en que se siembran). Como el real, filtra por la
 * empresa del contexto: una fila de A no la ve quien llama en el contexto de B (R8, R9).
 */
export function repoDoble(semilla: Array<IntegracionConSecretos & { organizacionId: string }> = []) {
  const filas = new Map(semilla.map((f) => [f.id, { ...f }]));
  /** La empresa del contexto en cada llamada al repositorio. */
  const empresasVistas: Array<string | undefined> = [];
  const empresa = (): string | undefined => {
    const c = contextoActual();
    const org = c?.tipo === "empresa" ? c.organizacionId : undefined;
    empresasVistas.push(org);
    return org;
  };
  const deLaEmpresa = (id: string) => {
    const org = empresa();
    const f = filas.get(id);
    return f !== undefined && f.organizacionId === org ? f : undefined;
  };

  const repo = {
    listar: vi.fn<IIntegracionRepository["listar"]>(async () => {
      const org = empresa();
      return [...filas.values()].filter((f) => f.organizacionId === org).map(sinSecretos);
    }),
    porId: vi.fn<IIntegracionRepository["porId"]>(async (id) => {
      const f = deLaEmpresa(id);
      return f === undefined ? null : ({ ...f, secretos: { ...f.secretos } } as IntegracionConSecretos);
    }),
    porServicio: vi.fn<IIntegracionRepository["porServicio"]>(async (servicio) => {
      const org = empresa();
      const f = [...filas.values()].find((x) => x.organizacionId === org && x.servicio === servicio);
      return f === undefined ? null : ({ ...f, secretos: { ...f.secretos } } as IntegracionConSecretos);
    }),
    crear: vi.fn<IIntegracionRepository["crear"]>(async (nueva) => {
      const org = empresa() ?? "sin-empresa";
      const fila = {
        id: nueva.id,
        organizacionId: org,
        servicio: nueva.servicio,
        estado: "conectada",
        datosPublicos: nueva.datosPublicos,
        secretos: { ...nueva.secretos },
        whatsappNumeroId: nueva.whatsappNumeroId ?? null,
        ultimoErrorCodigo: null,
        ultimaPruebaAt: nueva.probadaAt,
        ultimoWebhookAt: null,
      } as IntegracionConSecretos & { organizacionId: string };
      filas.set(fila.id, fila);
      return { status: "creada", integracion: sinSecretos(fila) };
    }),
    actualizar: vi.fn<IIntegracionRepository["actualizar"]>(async (id, cambios) => {
      const f = deLaEmpresa(id);
      if (f === undefined) return { status: "no_encontrada" };
      const nueva = {
        ...f,
        ...(cambios.datosPublicos ? { datosPublicos: cambios.datosPublicos } : {}),
        secretos: { ...f.secretos, ...(cambios.secretos ?? {}) },
        ...(cambios.whatsappNumeroId ? { whatsappNumeroId: cambios.whatsappNumeroId } : {}),
        ...(cambios.probadaAt ? { estado: "conectada", ultimoErrorCodigo: null, ultimaPruebaAt: cambios.probadaAt } : {}),
      } as IntegracionConSecretos & { organizacionId: string };
      filas.set(id, nueva);
      return { status: "guardada", integracion: sinSecretos(nueva) };
    }),
    registrarPrueba: vi.fn<IIntegracionRepository["registrarPrueba"]>(async (id, resultado, at) => {
      const f = deLaEmpresa(id);
      if (f === undefined) return false;
      filas.set(id, {
        ...f,
        estado: resultado.ok ? "conectada" : "error",
        ultimoErrorCodigo: resultado.ok ? null : resultado.codigo,
        ultimaPruebaAt: at,
      });
      return true;
    }),
    regenerarToken: vi.fn<IIntegracionRepository["regenerarToken"]>(async (id) => {
      const f = deLaEmpresa(id);
      return f !== undefined && f.servicio === "whatsapp";
    }),
    borrar: vi.fn<IIntegracionRepository["borrar"]>(async (id) => {
      const f = deLaEmpresa(id);
      if (f === undefined) return null;
      filas.delete(id);
      return f.servicio;
    }),
    marcarError: vi.fn<IIntegracionRepository["marcarError"]>(async (servicio, codigo) => {
      const org = empresa();
      for (const [id, f] of filas) {
        if (f.organizacionId === org && f.servicio === servicio) {
          filas.set(id, { ...f, estado: "error", ultimoErrorCodigo: codigo });
        }
      }
    }),
    anotarWebhook: vi.fn<IIntegracionRepository["anotarWebhook"]>(async () => undefined),
  } satisfies IIntegracionRepository;

  return { repo, filas, empresasVistas };
}

/** La fila de WhatsApp de la empresa A, con sus dos secretos cifrados por el doble. */
export function filaWhatsappA(sembrar: (texto: string, ctx: ContextoSecreto) => string) {
  return {
    id: ID_WHATSAPP,
    organizacionId: ORG_A,
    servicio: "whatsapp" as const,
    estado: "conectada" as const,
    datosPublicos: {
      nombreVisible: "Mensajeria A",
      wabaId: "waba-a",
      telefonoVisible: "+000 1111",
      nombreVerificado: "Mensajeria A",
    },
    secretos: {
      token_acceso: sembrar(SECRETOS_CLARO.tokenViejo, { organizacionId: ORG_A, integracionId: ID_WHATSAPP, campo: "token_acceso" }),
      app_secret: sembrar(SECRETOS_CLARO.appSecretViejo, { organizacionId: ORG_A, integracionId: ID_WHATSAPP, campo: "app_secret" }),
    },
    whatsappNumeroId: "numero-a",
    ultimoErrorCodigo: null,
    ultimaPruebaAt: new Date("2026-10-24T08:00:00.000Z"),
    ultimoWebhookAt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Probadores, contador y el resto                                              */
/* -------------------------------------------------------------------------- */

type ProbarDe<S extends ServicioIntegracion> = ProbadoresPorServicio[S]["probar"];

/** Probadores que pasan; cada test cambia el resultado con `mockResolvedValueOnce`. */
export function probadoresDobles() {
  const whatsapp = vi.fn<ProbarDe<"whatsapp">>(async (_c, d) => ({
    ok: true,
    datosPublicos: {
      numeroId: d.numeroId,
      wabaId: d.wabaId,
      nombreVisible: d.nombreVisible,
      telefonoVisible: "+000 2222",
      nombreVerificado: "Verificado por Meta",
    },
  }));
  const google_maps = vi.fn<ProbarDe<"google_maps">>(async () => ({ ok: true, datosPublicos: {} }));
  const optimizacion_rutas = vi.fn<ProbarDe<"optimizacion_rutas">>(
    async (): Promise<ResultadoPrueba<"optimizacion_rutas">> => ({
      ok: true,
      datosPublicos: { proyectoId: "proyecto-a", cuentaServicio: "cuenta-a@proyecto-a.iam.gserviceaccount.test" },
    }),
  );
  const asistente = vi.fn<ProbarDe<"asistente">>(async () => ({ ok: true, datosPublicos: {} }));
  const probadores: ProbadoresPorServicio = {
    whatsapp: { probar: whatsapp },
    google_maps: { probar: google_maps },
    optimizacion_rutas: { probar: optimizacion_rutas },
    asistente: { probar: asistente },
  };
  return { probadores, espias: { whatsapp, google_maps, optimizacion_rutas, asistente } };
}

/** Cuenta como la base: cada llamada suma uno en el mismo minuto. */
export function pruebasDobles() {
  let intentos = 0;
  const sumarPrueba = vi.fn<IIntegracionPruebaMinutoRepository["sumarPrueba"]>(async () => {
    intentos += 1;
    return { intentos, minuto: MINUTO };
  });
  return { pruebas: { sumarPrueba }, sumarPrueba };
}

/** Todo lo que necesita el service, con dobles; devuelve también los espías. */
export function montar(semilla?: (sembrar: (texto: string, ctx: ContextoSecreto) => string) => Array<IntegracionConSecretos & { organizacionId: string }>) {
  const cif = cifradorDoble();
  const r = repoDoble(semilla ? semilla(cif.sembrar) : []);
  const p = probadoresDobles();
  const c = pruebasDobles();
  const resumen = new ResumenSecretoSha256();
  const resumir = vi.spyOn(resumen, "resumen");
  const nuevoId = vi.fn(() => ID_NUEVO);
  const nuevoTokenVerificacion = vi.fn(() => TOKEN_VERIFICACION);
  const deps: IntegracionesServiceDeps = {
    repo: r.repo,
    pruebas: c.pruebas,
    probadores: p.probadores,
    cifrador: cif.cifrador,
    resumen,
    aleatoria: { nuevoId, nuevoTokenVerificacion },
    urlWebhook: URL_WEBHOOK,
    limitePorMinuto: () => 5,
    reloj: () => AHORA,
  };
  return { deps, ...r, ...cif, ...p, ...c, resumen, resumir, nuevoId, nuevoTokenVerificacion };
}

/** Todas las llamadas de todos los espías de repositorio, contador, probadores, cifrador y aleatoria. */
export function llamadasTotales(m: ReturnType<typeof montar>): number {
  const espias = [
    ...Object.values(m.repo),
    ...Object.values(m.espias),
    m.sumarPrueba,
    m.cifrar,
    m.descifrar,
    m.nuevoId,
    m.nuevoTokenVerificacion,
  ];
  return espias.reduce((n, e) => n + e.mock.calls.length, 0);
}
