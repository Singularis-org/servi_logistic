import type { TransporteDeps } from "@/lib/clients/cobro/http-proveedor";
import type {
  DevolucionDelProveedor,
  EnlaceDelProveedor,
  IProveedorCobro,
  LeerCredencialesCobro,
  PagoDelProveedor,
} from "@/lib/interfaces/external/IProveedorCobro";
import type { EntornoCobro } from "@/lib/types/cobro";

// SLT-227 (design §6) — el adaptador de Rebill. ESQUELETO de T3.3: solo el constructor, para que el registro lo
// devuelva. Las cuatro operaciones (y sus parámetros) las implementa T4.2; hasta entonces fallan siempre, sin leer
// credenciales ni red.

export interface RebillProveedorCobroDeps {
  paisId: string;
  /** Elige la fila de credenciales que se lee (R4); la URL es la misma en los dos entornos (P5). */
  entorno: EntornoCobro;
  urlBase: string;
  leerCredenciales: LeerCredencialesCobro;
  transporte: TransporteDeps;
}

function sinImplementar(operacion: string): never {
  throw new Error(`rebill ${operacion}: sin implementar (SLT-227 T4.2)`);
}

export class RebillProveedorCobro implements IProveedorCobro {
  readonly proveedor = "rebill";

  constructor(private readonly deps: RebillProveedorCobroDeps) {}

  get paisId(): string {
    return this.deps.paisId;
  }

  get entorno(): EntornoCobro {
    return this.deps.entorno;
  }

  async crearEnlace(): Promise<EnlaceDelProveedor> {
    return sinImplementar("crearEnlace");
  }

  async consultarPago(): Promise<PagoDelProveedor | null> {
    return sinImplementar("consultarPago");
  }

  async verificarFirma(): Promise<boolean> {
    return sinImplementar("verificarFirma");
  }

  async devolver(): Promise<DevolucionDelProveedor> {
    return sinImplementar("devolver");
  }
}
