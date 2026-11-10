import { randomUUID } from "node:crypto";

import { esPlataforma } from "@/lib/auth/plataforma";
import {
  destinatariosReporteBug,
  ENLACE_CORREO_SEGUNDOS,
  EXTENSION_POR_TIPO,
  IMAGEN_BYTES_MAX,
  IMAGENES_POR_DIA_MAX,
  tipoPorFirma,
  type TipoImagenReporte,
} from "@/lib/config/reporte-bug";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { ICupoImagenesReporte } from "@/lib/interfaces/repositories/ICupoImagenesReporte";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  EnviarReporteBugServiceResult,
  IReporteBugService,
  PrepararSubidasServiceResult,
} from "@/lib/interfaces/services/IReporteBugService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { plantillaReporteBug, type ImagenDelCorreo } from "@/lib/services/email/plantillas/reporte-bug";
import { zonaDeLaEmpresa } from "@/lib/services/zona-de-la-empresa";
import type {
  BugReportCreado,
  EntornoDelReporte,
  EnviarReporteBugDatos,
  NuevaImagen,
  PrepararSubidasImagenesInput,
} from "@/lib/types/reporte-bug";
import { fechaCalendario } from "@/lib/utils/calendario-zona";

// SLT-87 (design §5; R11, R13, R15–R17) — enviar un reporte de problema.
//
// La puerta de verdad está aquí, no en el layout que pinta el botón: solo un usuario de empresa
// reporta. Primero se guarda; la copia por correo va después y es un extra (decisión cerrada «Si el
// correo falla»): un fallo se registra con el id del reporte y el nombre del error, sin reintento, sin
// marca y sin cambiar la respuesta. Un mensaje por destinatario porque `EmailMessage.to` es una sola
// dirección, y en paralelo para que el usuario espere al SMTP una vez y no una por destinatario.
//
// SLT-98 (design §5; R9–R13, R20, R21) — las imágenes. La ruta de cada una la arma SIEMPRE el servidor
// con el usuario de la sesión (`<usuarioId>/<imagenId>.<ext>`), al dar el permiso y al validar: con el
// `imagenId` de otro, la ruta apunta a la carpeta propia, donde ese archivo no está (R10). El almacén
// trabaja en la carpeta de la empresa del contexto; el contexto se abre aquí con la empresa del actor
// ya resuelto, en vez de dejar que el adaptador la saque de la sesión.
//
// SLT-98 (design §16.4; R24–R28, R30, R31) — el tope diario de imágenes. Se cuentan los permisos
// CONCEDIDOS, antes de pedir nada al almacén: sin cupo, la respuesta no dice cuánto se usó ni de qué día.
// El día es el calendario de la zona del país de la empresa, con la hora del servidor (`ahora`), nunca un
// dato del cliente. Si el almacén falla, lo contado se devuelve: el usuario no pierde cupo por un fallo
// nuestro. `enviar` no cuenta nada: lo que llega al envío ya se contó al pedir su permiso.

/** El ancho de `bug_report.user_agent`. */
const USER_AGENT_MAX = 512;

const FORBIDDEN = { status: "forbidden" } as const;
const SIN_CUPO = { status: "sin_cupo_imagenes" } as const;

function causaDe(e: unknown): string {
  return e instanceof Error ? e.name : "desconocido";
}

function rutaDeImagen(usuarioId: string, imagenId: string, tipo: TipoImagenReporte): string {
  return `${usuarioId}/${imagenId}.${EXTENSION_POR_TIPO[tipo]}`;
}

/** El actor de empresa con su empresa, o `null` si no pasa la puerta (SLT-87 R11). */
function empresaDelActor(actor: Actor): string | null {
  const organizacionId = actor.organizacionId ?? null;
  if (esPlataforma(actor.rol) || organizacionId === null) return null;
  return organizacionId;
}

type Validacion = { validas: NuevaImagen[]; invalidas: string[]; rutasABorrar: string[] };

export class ReporteBugService implements IReporteBugService {
  constructor(
    private readonly repo: IBugReportRepository,
    private readonly almacen: IAlmacenImagenesReporte,
    private readonly cupo: ICupoImagenesReporte,
    private readonly sender: IEmailSender,
    private readonly reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
    private readonly destinatarios: () => string[] = () => destinatariosReporteBug(),
    private readonly log: (linea: string) => void = (linea) => console.error(linea),
    private readonly nuevoId: () => string = () => randomUUID(),
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async prepararSubidas(actor: Actor, entrada: PrepararSubidasImagenesInput): Promise<PrepararSubidasServiceResult> {
    const organizacionId = empresaDelActor(actor);
    if (organizacionId === null) return FORBIDDEN;

    const zona = await conEmpresa(organizacionId, () => zonaDeLaEmpresa(this.reglasPais, "ReporteBugService.prepararSubidas"));
    const fecha = fechaCalendario(this.ahora(), zona);
    const n = entrada.imagenes.length;
    // Tope blando (P9): si entra, se conceden las `n` aunque el total pase del tope (R24).
    const total = await this.cupo.consumir(actor.usuarioId, fecha, n, IMAGENES_POR_DIA_MAX);
    if (total === null) return SIN_CUPO;

    const piezas = entrada.imagenes.map(({ tipo }) => {
      const imagenId = this.nuevoId();
      return { imagenId, ruta: rutaDeImagen(actor.usuarioId, imagenId, tipo) };
    });
    try {
      // En serie: si el bucket falta, solo la primera lo crea (design §3.3).
      const permisos = await conEmpresa(organizacionId, async () => {
        const salida: { imagenId: string; url: string }[] = [];
        for (const p of piezas) {
          const { url } = await this.almacen.prepararSubida(p.ruta);
          salida.push({ imagenId: p.imagenId, url });
        }
        return salida;
      });
      return { status: "listas", permisos };
    } catch (error) {
      await this.devolverCupo(actor.usuarioId, fecha, n);
      throw error;
    }
  }

  /** R27: si la resta también falla, se registra y gana el error del almacén, que es el que se relanza. */
  private async devolverCupo(usuarioId: string, fecha: string, n: number): Promise<void> {
    try {
      await this.cupo.devolver(usuarioId, fecha, n);
    } catch (e) {
      this.log(`[reporte-bug] fallo al devolver el cupo de imagenes causa=${causaDe(e)}`);
    }
  }

  async enviar(
    actor: Actor,
    entrada: EnviarReporteBugDatos,
    entorno: EntornoDelReporte,
  ): Promise<EnviarReporteBugServiceResult> {
    const organizacionId = empresaDelActor(actor);
    if (organizacionId === null) return FORBIDDEN;

    const { validas, invalidas, rutasABorrar } = await this.validarImagenes(organizacionId, actor.usuarioId, entrada);
    if (invalidas.length > 0) {
      await this.borrarRechazadas(organizacionId, rutasABorrar);
      return { status: "imagenes_invalidas", imagenes: invalidas };
    }

    const creado = await this.repo.crear({
      organizationId: organizacionId,
      reporterUserId: actor.usuarioId,
      reporterRole: actor.rol,
      description: entrada.descripcion,
      pagePath: entrada.pagina,
      userAgent: entorno.userAgent.slice(0, USER_AGENT_MAX),
      viewportWidth: entrada.ventana?.ancho ?? null,
      viewportHeight: entrada.ventana?.alto ?? null,
      isStandalone: entrada.appInstalada ?? null,
      imagenes: validas,
    });
    if (creado === null) return FORBIDDEN;

    const imagenes = await this.enlacesDelCorreo(organizacionId, creado.id, validas);
    await this.mandarCopias(creado, imagenes);
    return { status: "enviado" };
  }

  /**
   * R10: en serie, para no tener 25 MB en memoria a la vez. Un error de `leer` que no sea «no existe»
   * se propaga: la action responde `error`.
   */
  private async validarImagenes(
    organizacionId: string,
    usuarioId: string,
    entrada: EnviarReporteBugDatos,
  ): Promise<Validacion> {
    const resultado: Validacion = { validas: [], invalidas: [], rutasABorrar: [] };
    if (entrada.imagenes.length === 0) return resultado;
    await conEmpresa(organizacionId, async () => {
      for (const [i, { id, tipo }] of entrada.imagenes.entries()) {
        const ruta = rutaDeImagen(usuarioId, id, tipo);
        const bytes = await this.almacen.leer(ruta);
        const vale =
          bytes !== null && bytes.length >= 1 && bytes.length <= IMAGEN_BYTES_MAX && tipoPorFirma(bytes) === tipo;
        if (vale) {
          resultado.validas.push({ id, position: i + 1, storagePath: ruta, contentType: tipo, sizeBytes: bytes.length });
          continue;
        }
        resultado.invalidas.push(id);
        if (bytes !== null) resultado.rutasABorrar.push(ruta);
      }
    });
    return resultado;
  }

  /** R11: mejor esfuerzo. Las válidas se quedan: el panel las reutiliza en el próximo envío. */
  private async borrarRechazadas(organizacionId: string, rutas: string[]): Promise<void> {
    if (rutas.length === 0) return;
    try {
      await conEmpresa(organizacionId, () => this.almacen.borrar(rutas));
    } catch (e) {
      this.log(`[reporte-bug] fallo al borrar imagenes no aceptadas causa=${causaDe(e)}`);
    }
  }

  /**
   * R20, R21: se firma una vez y los mismos enlaces van a todos los destinatarios. Si firmar lanza o
   * falta una ruta, el correo lleva el aviso en su lugar y la respuesta no cambia.
   */
  private async enlacesDelCorreo(
    organizacionId: string,
    reporteId: string,
    imagenes: NuevaImagen[],
  ): Promise<ImagenDelCorreo[]> {
    if (imagenes.length === 0) return [];
    let firmadas: Record<string, string> = {};
    try {
      firmadas = await conEmpresa(organizacionId, () =>
        this.almacen.firmar(
          imagenes.map((i) => i.storagePath),
          ENLACE_CORREO_SEGUNDOS,
        ),
      );
    } catch (e) {
      this.log(`[reporte-bug] fallo al firmar las imagenes reporte=${reporteId} causa=${causaDe(e)}`);
    }
    return imagenes.map((i) => ({ posicion: i.position, url: firmadas[i.storagePath] ?? null }));
  }

  private async mandarCopias(creado: BugReportCreado, imagenes: ImagenDelCorreo[]): Promise<void> {
    // `async` dentro del map: si componer el correo lanzara, también cae en el `allSettled`.
    const envios = await Promise.allSettled(
      this.destinatarios().map(async (to) =>
        this.sender.enviar(plantillaReporteBug({ to, reporte: creado, imagenes })),
      ),
    );
    for (const e of envios) {
      if (e.status === "rejected") {
        this.log(`[reporte-bug] fallo la copia por correo reporte=${creado.id} causa=${causaDe(e.reason)}`);
      }
    }
  }
}
