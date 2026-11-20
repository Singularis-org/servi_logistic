import { MONEDA_PLATAFORMA } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import type { IPaisService, PaisParaPantallas } from "@/lib/interfaces/services/IPaisService";
import { ETIQUETAS_NEUTRAS, etiquetasDePais, type PaisDTO } from "@/lib/types/pais";

// SLT-235 (design §4; R2–R5, R7–R10) — el país de la empresa para las pantallas del portal.
//
// Módulo de servidor: lo usan el layout y `/paquete`. El layout se pinta en TODAS las páginas, así que
// el país se memoriza por proceso para no ir a la base en cada una. El memo NO entra en el puerto
// `IReglasPaisEmpresa`: lo que arma el servidor (WhatsApp, PDF) sigue leyendo sin caché (SLT-42 R30) y
// ve un cambio al momento; las pantallas aceptan hasta 10 min de retraso (decisión cerrada).

/** Decisión cerrada: un cambio de país tarda como mucho esto en verse por instancia. */
export const MEMO_PAIS_MS = 10 * 60_000;
/** Por encima se barren las caducadas al escribir, como el memo de SL-17: no crece sin límite. */
export const MEMO_PAIS_BARRIDO = 1_000;

type EntradaMemo = { pais: PaisDTO; caduca: number };

/**
 * Memo `organizacionId → PaisDTO`, mismo patrón que `lib/auth/empresa-de-la-peticion.ts`. La clave es la
 * empresa que resolvió la sesión en el servidor: dos empresas son dos claves, y una no puede recibir el
 * país de otra (R8). El reloj se inyecta para probar la caducidad sin esperar.
 *
 * Sin promesas en vuelo compartidas: dos páginas a la vez para una empresa sin memo hacen dos lecturas.
 * Es una consulta por clave, y compartir la promesa añadiría un estado más que probar (design §4).
 */
export class MemoPaisEmpresa {
  private readonly entradas = new Map<string, EntradaMemo>();

  constructor(private readonly ahora: () => number = Date.now) {}

  /**
   * `recienLeido` dice si salió de la base en esta llamada: con él, los avisos de R3/R4 salen una vez
   * por lectura y no en cada página (R10). Si `leer` lanza o da `null`, no se memoriza nada y se lanza
   * (R8): la siguiente página vuelve a intentarlo en vez de quedarse 10 min con un fallo.
   */
  async leer(
    organizacionId: string,
    leer: () => Promise<PaisDTO | null>,
  ): Promise<{ pais: PaisDTO; recienLeido: boolean }> {
    const enMemo = this.vigente(organizacionId);
    if (enMemo) return { pais: enMemo, recienLeido: false };

    const pais = await leer();
    // `organizacion.pais_id` es NOT NULL: sin país, la empresa no existe o no es la del contexto.
    // Inventar un país aquí escondería ese fallo.
    if (pais === null) throw new Error(`país para pantallas: no se encontró el país de la empresa ${organizacionId}`);
    this.escribir(organizacionId, pais);
    return { pais, recienLeido: true };
  }

  private vigente(organizacionId: string): PaisDTO | undefined {
    const entrada = this.entradas.get(organizacionId);
    if (!entrada) return undefined;
    if (entrada.caduca <= this.ahora()) {
      this.entradas.delete(organizacionId);
      return undefined;
    }
    return entrada.pais;
  }

  private escribir(organizacionId: string, pais: PaisDTO): void {
    const ahora = this.ahora();
    if (this.entradas.size >= MEMO_PAIS_BARRIDO) {
      for (const [clave, entrada] of this.entradas) if (entrada.caduca <= ahora) this.entradas.delete(clave);
    }
    this.entradas.set(organizacionId, { pais, caduca: ahora + MEMO_PAIS_MS });
  }

  /** Cuántas entradas guarda, caducadas incluidas. Para medir el barrido de R9. */
  get tamano(): number {
    return this.entradas.size;
  }
}

/** El de producción: uno por proceso. */
export const memoPaisEmpresa = new MemoPaisEmpresa();

/** R2: sin empresa (el superadmin) no hay país que leer. */
export const PARA_PANTALLAS_DE_PLATAFORMA: PaisParaPantallas = {
  etiquetas: ETIQUETAS_NEUTRAS,
  moneda: MONEDA_PLATAFORMA,
  impuestoNombre: IMPUESTO_ROTULO,
};

/**
 * R3, R4, R10. Un país sin moneda o sin nombre de impuesto es un dato a medio cargar, no un error de
 * la página: se cae a lo de la plataforma (decisión cerrada) y se avisa en el log para que alguien lo
 * complete. El aviso solo con `recienLeido`, para no repetirlo en cada página servida desde el memo.
 */
export function paraPantallasDe(pais: PaisDTO, recienLeido: boolean, organizacionId: string): PaisParaPantallas {
  if (recienLeido && pais.moneda === null) {
    console.warn(
      `[país] la empresa ${organizacionId} (país ${pais.id}) no tiene moneda; las pantallas usan la de la plataforma`,
    );
  }
  if (recienLeido && pais.impuestoNombre === null) {
    console.warn(
      `[país] la empresa ${organizacionId} (país ${pais.id}) no tiene nombre de impuesto; las pantallas usan el rótulo de la plataforma`,
    );
  }
  return {
    etiquetas: etiquetasDePais(pais),
    moneda: pais.moneda ?? MONEDA_PLATAFORMA,
    impuestoNombre: pais.impuestoNombre ?? IMPUESTO_ROTULO,
  };
}

/**
 * R2, R5 — lo que llaman el layout y `/paquete`. Se pintan en todas las páginas, así que un fallo de
 * lectura no puede dar un 500: se cae a lo neutro y de la plataforma, y el error queda en el log. No
 * se sustituye por los datos de un país: eso escondería el fallo detrás de unos que parecen buenos.
 */
export async function paisParaPantallasDelActor(
  organizacionId: string | null,
  servicio: Pick<IPaisService, "paraPantallas">,
): Promise<PaisParaPantallas> {
  if (!organizacionId) return PARA_PANTALLAS_DE_PLATAFORMA;
  try {
    return await servicio.paraPantallas(organizacionId);
  } catch (error) {
    console.error(
      `[país] no se pudo leer el país de la empresa ${organizacionId}; las pantallas usan lo neutro y lo de la plataforma`,
      error,
    );
    return PARA_PANTALLAS_DE_PLATAFORMA;
  }
}
