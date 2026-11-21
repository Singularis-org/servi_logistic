import type { HistorialAccionTipo, RolValue } from "@prisma/client";

import type { FilaMora, OrganizacionMora } from "@/lib/planes/mora";

// SLT-121 (design §5.1) — el acceso a datos de la mora de una empresa. La autorización (superadmin para lo de
// plataforma, maestro y admin para el banner) la decide el servicio antes de llamar (R4, R24). Las reglas del
// congelamiento viven en las funciones del dueño (§2); el repositorio deja el historial y los correos en la
// misma transacción (R29, R30).

/** Lo que se lee de la mora de una empresa: sus columnas y sus facturas cerradas con saldo (R6). */
export interface MoraLeida extends OrganizacionMora {
  facturas: FilaMora[];
}

/** Una fila del historial de la mora, para la sección del superadmin (R31). */
export interface FilaHistorialMora {
  id: string;
  accion: HistorialAccionTipo;
  createdAt: Date;
  actorNombre: string | null;
  actorRol: RolValue | null;
  /** Importe con dos decimales, o `null`. */
  monto: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
}

export interface MoraParaPlataforma extends MoraLeida {
  /** `null` = rige la global. */
  graciaPropia: number | null;
  historial: FilaHistorialMora[];
}

/** Lo que responde `organizacion_mora_congelar` (§2.2). */
export type ResultadoCongelar =
  | { resultado: "fuera_de_franja" | "ya_congelada" | "descongelada_a_mano" | "al_dia" }
  | {
      resultado: "congelada";
      facturas: { facturaId: string; numero: number; saldo: string }[];
      saldoVencido: string;
    };

export interface IMoraEmpresaRepository {
  /** La empresa del contexto (`servi_app`): banner (R24). Sin empresa falla sin leer (R33). */
  moraDeLaEmpresa(ahora: Date, gracia: number): Promise<MoraLeida>;
  /**
   * La empresa del contexto: su gracia vigente, la propia o `gracia` (la global) si no tiene. La usa el correo de
   * cierre de SLT-136 para la fecha límite (R25). Sin empresa falla sin leer (R33).
   */
  graciaDeLaEmpresa(gracia: number): Promise<number>;
  /** La empresa del contexto: la puerta del borde (§6.2). Una lectura por llamada, sin caché. */
  estaCongelada(): Promise<boolean>;
  /** Superadmin: la mora de `organizacionId` leída con esa empresa fijada (R32), con su historial (R31). */
  moraParaPlataforma(organizacionId: string, ahora: Date, gracia: number): Promise<MoraParaPlataforma>;
  /** Superadmin: fija (o quita, con `null`) la gracia propia; si descongela, lo deja dicho (R3, R5, R30). */
  fijarGracia(
    organizacionId: string,
    dias: number | null,
    actorUsuarioId: string,
    ahora: Date,
    gracia: number,
  ): Promise<"ok" | "sin_cambio">;
  /** Superadmin: descongela a mano hasta `hasta` (`AAAA-MM-DD`), con su motivo en el historial (R22, R30). */
  descongelarAMano(
    organizacionId: string,
    hasta: string,
    motivo: string,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<"ok" | "no_congelada">;
  /** Corrida: las empresas con alguna factura cerrada con saldo o congeladas (§4.1). */
  empresasConMora(): Promise<string[]>;
  /** Corrida: congela si toca, con su historial y su correo (R7-R9, R27, R30). */
  congelarSiVencida(organizacionId: string, ahora: Date, gracia: number): Promise<ResultadoCongelar>;
  /** Corrida: encola el recordatorio de cada factura cuya fecha límite es mañana (R26). Cuántos se encolaron. */
  encolarRecordatorios(organizacionId: string, ahora: Date, gracia: number): Promise<number>;
}
