// SL-36 (design §5, §7.2, §9.1; R23, R26, R28, R29, R30) — la credencial de optimizacion de rutas de
// la empresa EN CURSO, lista para los dos clientes de Google (optimizacion y trazado).
//
// POR QUE UNA CLASE CON ESTADO Y NO UNA FUNCION: el token de Google dura una hora y pedirlo cuesta una
// llamada, asi que se cachea. Pero el drenador de la cola sirve en la misma corrida jobs de varias
// empresas, y la cache que habia (`tokenProvider ??=`, una por proceso) le habria dado a B el token de
// la cuenta de servicio de A. Aqui la cache va POR EMPRESA (R28), y se rehace si la empresa cambia la
// clave o conecta otra integracion.
import { createHash } from "node:crypto";
import { construirTokenProvider } from "@/lib/auth/google-sa-token";
import { RutaNoConfiguradoError, type TokenProvider } from "@/lib/auth/google-token-shared";
import {
  leerClaveCuentaServicio,
  type ClaveCuentaServicio,
} from "@/lib/clients/probadores/optimizacion-rutas-probador";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type {
  CodigoRechazoDe,
  ICredencialesIntegracion,
} from "@/lib/interfaces/services/ICredencialesIntegracion";
import {
  empresaEnCurso,
  fetchQueAvisaRechazo,
} from "@/lib/services/integraciones/credencial-de-la-empresa";

/** Lo que los clientes de Google necesitan de la empresa. */
export interface RutasDeLaEmpresa {
  organizacionId: string;
  /** El proyecto de la URL de `optimizeTours`: sale de la clave de la empresa, no del entorno. */
  projectId: string;
  /** El token de la cuenta de servicio de ESTA empresa. El mismo para optimizar y para trazar. */
  getToken: () => Promise<string>;
  /**
   * El `fetch` de `optimizeTours`: un 403 deja la integracion en `optimizacion_rutas.permiso` (R30).
   * La prueba de conexion no puede verificar el rol ni que la API este habilitada (design §5): este
   * es el primer sitio donde se ve.
   */
  fetchOptimizacion: typeof fetch;
}

export interface RutasPorEmpresaDeps {
  credenciales: ICredencialesIntegracion;
  /** La empresa de la sesion cuando no hay contexto explicito (la action del mensajero). */
  empresaDeLaSesion?: () => Promise<string | null>;
  fetchBase?: typeof fetch;
  log?: { warn(mensaje: string): void };
}

type CodigoRutas = CodigoRechazoDe<"optimizacion_rutas">;

/**
 * R30 (design §5): en el intercambio JWT-bearer, Google responde 400 `invalid_grant` a una clave
 * revocada o borrada y 401 a un cliente invalido. Son las mismas señales que usa la prueba.
 */
const esRechazoDelToken = (respuesta: Response) => respuesta.status === 400 || respuesta.status === 401;
/** R30: la cuenta no tiene el rol o el proyecto no tiene habilitada Route Optimization. */
const esFaltaDePermiso = (respuesta: Response) => respuesta.status === 403;

/** Identifica la clave sin guardarla dos veces en memoria: si cambia, el token viejo no sirve. */
function huellaDe(integracionId: string, clave: ClaveCuentaServicio): string {
  return createHash("sha256")
    .update(`${integracionId}\n${clave.client_email}\n${clave.private_key}`)
    .digest("hex");
}

export class RutasPorEmpresa {
  /** R28: clave = `organizacionId`. Nunca una entrada compartida. */
  private readonly tokens = new Map<string, { huella: string; proveedor: TokenProvider }>();

  constructor(private readonly deps: RutasPorEmpresaDeps) {}

  /**
   * Lanza `RutaNoConfiguradoError` sin llamar a Google si no hay empresa, si la empresa no tiene la
   * integracion o si su clave no se lee (R26, R29): `FallbackRouteOptimizationClient` lo traduce en
   * el orden local aproximado y el job termina bien.
   */
  async deLaEmpresa(): Promise<RutasDeLaEmpresa> {
    const organizacionId = await this.empresa();
    const { credenciales } = this.deps;
    const lectura = await conEmpresa(organizacionId, () => credenciales.leer("optimizacion_rutas"));
    if (lectura.estado !== "lista") throw new RutaNoConfiguradoError(lectura.estado);
    const clave = leerClaveCuentaServicio(lectura.credencial.clave_cuenta_servicio);
    if (clave === null) throw new RutaNoConfiguradoError("clave_mal_formada");

    const base = this.deps.fetchBase ?? fetch;
    // La marca captura la empresa al construirse: la action del mensajero llama a Google fuera de
    // `conEmpresa`, y la fila que se marca tiene que ser la de esta empresa.
    const marcar = (codigo: CodigoRutas) => () =>
      conEmpresa(organizacionId, () => credenciales.marcarRechazo("optimizacion_rutas", codigo));
    const proveedor = this.proveedorDe(organizacionId, lectura.integracionId, clave, () =>
      fetchQueAvisaRechazo(
        base,
        esRechazoDelToken,
        marcar("optimizacion_rutas.credencial_rechazada"),
        "optimizacion_rutas",
        this.deps.log,
      ),
    );
    return {
      organizacionId,
      projectId: clave.project_id,
      getToken: () => proveedor.obtener(),
      fetchOptimizacion: fetchQueAvisaRechazo(
        base,
        esFaltaDePermiso,
        marcar("optimizacion_rutas.permiso"),
        "optimizacion_rutas",
        this.deps.log,
      ),
    };
  }

  private async empresa(): Promise<string> {
    try {
      return await empresaEnCurso("optimizacion_rutas", this.deps.empresaDeLaSesion);
    } catch (error) {
      // Sin empresa no hay credencial que usar ni que prestar: se degrada como sin integracion.
      if (error instanceof EmpresaNoResuelta) throw new RutaNoConfiguradoError("sin_empresa");
      throw error;
    }
  }

  private proveedorDe(
    organizacionId: string,
    integracionId: string,
    clave: ClaveCuentaServicio,
    fetchDelToken: () => typeof fetch,
  ): TokenProvider {
    const huella = huellaDe(integracionId, clave);
    const enCache = this.tokens.get(organizacionId);
    if (enCache !== undefined && enCache.huella === huella) return enCache.proveedor;
    const proveedor = construirTokenProvider(
      { email: clave.client_email, privateKey: clave.private_key },
      { fetchImpl: fetchDelToken() },
    );
    this.tokens.set(organizacionId, { huella, proveedor });
    return proveedor;
  }
}
