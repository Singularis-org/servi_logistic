import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  DestinoWebhook,
  IIntegracionEnrutadoRepository,
} from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";

// SL-36 (design §10, R22) — LA ÚNICA LECTURA EN PLATAFORMA DEL WEBHOOK DE WHATSAPP.
//
// El webhook llega sin sesión: antes de saber de qué empresa es, hay que buscar el número (POST) o
// el resumen del token (GET) entre todas. Es el mismo patrón que `lib/api/api-key-request.ts`: una
// lectura acotada que traduce la entrada a su empresa, y todo lo demás corre después en
// `conEmpresa`. Está en `EXCEPCIONES_DE_PLATAFORMA` con la ficha SL-36.
//
// El `select` es solo `id` y `organizacion_id`, y eso es el requisito, no un detalle: aquí no hay
// filtro de empresa, así que lo que se seleccione lo ve cualquiera que mande un número. Lo afirma
// `tests/integration/db/integracion-enrutado.test.ts`.

type EnrutadoPrismaClient = Pick<PrismaClient, "integracion">;

const FICHA = "SL-36";
const MOTIVO = "webhook de WhatsApp: traducir un numero o un resumen de token a su empresa, sin sesion";

/** Lo único que sale de la base en plataforma (R22). */
const SELECT_DESTINO = { id: true, organizacionId: true } as const;

function aDestino(fila: { id: string; organizacionId: string }): DestinoWebhook {
  return { organizacionId: fila.organizacionId, integracionId: fila.id };
}

export class IntegracionEnrutadoRepository implements IIntegracionEnrutadoRepository {
  constructor(private readonly prisma: EnrutadoPrismaClient) {}

  porResumenVerificacion(resumen: string): Promise<DestinoWebhook | null> {
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const fila = await this.prisma.integracion.findUnique({
        where: { whatsappResumenVerificacion: resumen },
        select: SELECT_DESTINO,
      });
      return fila === null ? null : aDestino(fila);
    });
  }

  /**
   * Una consulta por número y no un `IN`: con un `IN` haría falta seleccionar también el número para
   * saber de quién es cada fila, y el `select` dejaría de ser solo los dos ids. Un evento de Meta
   * trae uno o, como mucho, unos pocos números, y cada búsqueda va por el índice único.
   */
  porNumeros(numerosIds: readonly string[]): Promise<Map<string, DestinoWebhook>> {
    const distintos = [...new Set(numerosIds)];
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const destinos = new Map<string, DestinoWebhook>();
      for (const numero of distintos) {
        const fila = await this.prisma.integracion.findUnique({
          where: { whatsappNumeroId: numero },
          select: SELECT_DESTINO,
        });
        if (fila !== null) destinos.set(numero, aDestino(fila));
      }
      return destinos;
    });
  }
}
