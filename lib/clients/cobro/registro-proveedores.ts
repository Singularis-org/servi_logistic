import { esperarConTemporizador, type TransporteDeps } from "@/lib/clients/cobro/http-proveedor";
import { RebillProveedorCobro } from "@/lib/clients/cobro/rebill-proveedor";
import {
  entornoDeCobro,
  ESPERAS_REINTENTO_CONSULTA_MS,
  TIEMPO_MAXIMO_COBRO_MS,
  URL_BASE_REBILL,
} from "@/lib/config/cobro";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IProveedorCobro, LeerCredencialesCobro } from "@/lib/interfaces/external/IProveedorCobro";
import { CobroCredencialRepository } from "@/lib/repositories/CobroCredencialRepository";
import { crearLectorCredencialesCobro } from "@/lib/services/CobroCredencialService";
import { ProveedorCobroError, type EntornoCobro, type ProveedorCobroId } from "@/lib/types/cobro";

// SLT-227 (design §7) — el registro de proveedores de cobro. Un registro y no un `Map` por proveedor porque el
// adaptador depende del país: cada país tiene sus credenciales. El `Map` de `CobroIntentoService` lo llena quien lo
// construye (SLT-228) con `registro.obtener(…)`.

const FORMA_PAIS = /^[A-Z]{2}$/;

export interface RegistroProveedoresCobroDeps {
  /** Se fija al construir el registro (R3): ninguna operación lo recibe. */
  entorno: EntornoCobro;
  leerCredenciales: LeerCredencialesCobro;
  transporte: TransporteDeps;
  /** La misma en los dos entornos (P5); los tests pasan la del doble. */
  urlsBase: { rebill: string };
}

export class RegistroProveedoresCobro {
  constructor(private readonly deps: RegistroProveedoresCobroDeps) {}

  /**
   * El adaptador del proveedor ligado al país y al entorno (R2). Un proveedor sin adaptador falla sin leer
   * credenciales; un país válido sin credenciales falla en la primera operación (R14), no aquí.
   */
  obtener(proveedor: ProveedorCobroId, paisId: string): IProveedorCobro {
    if (!FORMA_PAIS.test(paisId)) {
      throw new ProveedorCobroError("solicitud_invalida", proveedor, { operacion: null });
    }
    switch (proveedor) {
      case "rebill":
        return new RebillProveedorCobro({
          paisId,
          entorno: this.deps.entorno,
          urlBase: this.deps.urlsBase.rebill,
          leerCredenciales: this.deps.leerCredenciales,
          transporte: this.deps.transporte,
        });
      // Sus adaptadores son de SLT-252 (Wompi) y SLT-253 (Global66): cada ficha añade aquí su rama y su URL.
      case "wompi":
      case "global66":
        throw new ProveedorCobroError("proveedor_no_disponible", proveedor, { operacion: null });
    }
  }
}

/**
 * El registro de la app: el entorno de R3 leído una sola vez aquí, el lector real (repositorio de plataforma y
 * bóveda) y `fetch` real. Los tests construyen `RegistroProveedoresCobro` con sus dobles.
 */
export function construirRegistroProveedoresCobro(): RegistroProveedoresCobro {
  return new RegistroProveedoresCobro({
    entorno: entornoDeCobro(),
    leerCredenciales: crearLectorCredencialesCobro({
      repo: new CobroCredencialRepository(getPrismaClient()),
      cifrador: new BovedaIntegraciones(),
    }),
    transporte: {
      fetchImpl: (entrada, init) => fetch(entrada, init),
      esperar: esperarConTemporizador,
      tiempoMaximoMs: TIEMPO_MAXIMO_COBRO_MS,
      esperasReintentoMs: ESPERAS_REINTENTO_CONSULTA_MS,
    },
    urlsBase: { rebill: URL_BASE_REBILL },
  });
}
