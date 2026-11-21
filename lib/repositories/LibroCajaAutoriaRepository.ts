import type { PrismaClient } from "@prisma/client";

import type {
  AnulacionDeDocumento,
  CuentaNombrada,
  IdsDeDocumentos,
  ILibroCajaAutoriaRepository,
  MarcasDeLaPlataforma,
  MovimientoDeCajaParaAutoria,
} from "@/lib/interfaces/repositories/ILibroCajaAutoriaRepository";
import type { ComoDTO } from "@/lib/types/libro-caja-autoria";
import { NOMBRE_USUARIO_SELECT, nombreCompletoUsuario, type NombreUsuarioFuente } from "@/lib/utils/nombre-usuario";

type Cliente = Pick<
  PrismaClient,
  | "walletMovimiento"
  | "usuario"
  | "cierreDia"
  | "liquidacionPago"
  | "rechazoTiendaCobro"
  | "rankingSnapshotFila"
  | "ordenIncidente"
  | "pagoPorCuentaTienda"
  | "walletTiendaMovimiento"
  | "abonoTienda"
  | "walletAnotacion"
  | "pagoMensajeroMovimiento" // SLT-68: el devengo del incentivo
  // Ficha 458-C (M1, R58): las constancias de anulacion.
  | "liquidacionAnulacion"
  | "pagoPorCuentaTiendaAnulacion"
  | "aporteCapitalAnulacion"
  | "abonoTiendaAnulacion"
  | "cobroTiendaAnulacion"
  | "rechazoTiendaCobroAnulacion"
  | "ajusteCajaAnulacion"
  | "pagoPlataformaConfirmacion" // SLT-143 (design §5.1): la marca de la plataforma
>;

const PERSONA = { select: { id: true, ...NOMBRE_USUARIO_SELECT } } as const;

function cuenta(tipo: "tienda" | "mensajero", u: { id: string } & NombreUsuarioFuente): CuentaNombrada {
  return { tipo, id: u.id, nombre: nombreCompletoUsuario(u) };
}

function nombreONulo(u: NombreUsuarioFuente | null): string | null {
  return u === null ? null : nombreCompletoUsuario(u);
}

/**
 * FICHA 458-B (design §3.4, R56/R57) — las lecturas en lote de «A quien» y «Registro». SOLO queries,
 * por clave primaria o unica; una lista vacia no consulta.
 */
export class LibroCajaAutoriaRepository implements ILibroCajaAutoriaRepository {
  constructor(private readonly prisma: Cliente) {}

  async movimientos(ids: readonly string[]): Promise<MovimientoDeCajaParaAutoria[]> {
    if (ids.length === 0) return [];
    return this.prisma.walletMovimiento.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, tipo: true, categoria: true, origenTipo: true, origenId: true, registradoPor: true, createdAt: true },
    });
  }

  async nombres(usuarioIds: readonly string[]): Promise<Map<string, string>> {
    if (usuarioIds.length === 0) return new Map();
    const us = await this.prisma.usuario.findMany({ where: { id: { in: [...usuarioIds] } }, ...PERSONA });
    return new Map(us.map((u) => [u.id, nombreCompletoUsuario(u)]));
  }

  async cierres(ids: readonly string[]) {
    if (ids.length === 0) return new Map();
    const cs = await this.prisma.cierreDia.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, mensajero: PERSONA, resueltoPorUsuario: PERSONA },
    });
    return new Map(cs.map((c) => [c.id, { mensajero: cuenta("mensajero", c.mensajero), aprobo: nombreONulo(c.resueltoPorUsuario) }]));
  }

  async pagos(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, CuentaNombrada>();
    const ps = await this.prisma.liquidacionPago.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, tienda: PERSONA, mensajero: PERSONA },
    });
    const salida = new Map<string, CuentaNombrada>();
    for (const p of ps) {
      if (p.tienda !== null) salida.set(p.id, cuenta("tienda", p.tienda));
      else if (p.mensajero !== null) salida.set(p.id, cuenta("mensajero", p.mensajero));
    }
    return salida;
  }

  async rechazos(gestionIds: readonly string[]) {
    if (gestionIds.length === 0) return new Map();
    const rs = await this.prisma.rechazoTiendaCobro.findMany({
      where: { gestionId: { in: [...gestionIds] } },
      select: { gestionId: true, tienda: PERSONA, decisor: PERSONA },
    });
    return new Map(rs.map((r) => [r.gestionId, { tienda: cuenta("tienda", r.tienda), aprobo: nombreONulo(r.decisor) }]));
  }

  async podios(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, CuentaNombrada>();
    const fs = await this.prisma.rankingSnapshotFila.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, mensajero: PERSONA },
    });
    return new Map(fs.map((f) => [f.id, cuenta("mensajero", f.mensajero)]));
  }

  async incentivos(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, CuentaNombrada>();
    const fs = await this.prisma.pagoMensajeroMovimiento.findMany({
      where: { id: { in: [...ids] }, categoria: "incentivo" },
      select: { id: true, mensajero: PERSONA },
    });
    return new Map(fs.map((f) => [f.id, cuenta("mensajero", f.mensajero)]));
  }

  async incidentes(ids: readonly string[]) {
    if (ids.length === 0) return new Map();
    const is = await this.prisma.ordenIncidente.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, orden: { select: { tienda: PERSONA } }, resueltoPorUsuario: PERSONA },
    });
    return new Map(
      is.map((i) => [i.id, { tienda: cuenta("tienda", i.orden.tienda), resolvio: nombreONulo(i.resueltoPorUsuario) }]),
    );
  }

  async pagosPorCuenta(ids: readonly string[]) {
    if (ids.length === 0) return new Map();
    const ps = await this.prisma.pagoPorCuentaTienda.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, beneficiario: true, tienda: PERSONA },
    });
    return new Map(ps.map((p) => [p.id, { tienda: cuenta("tienda", p.tienda), beneficiario: p.beneficiario }]));
  }

  async debitosDeTienda(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, CuentaNombrada>();
    const ds = await this.prisma.walletTiendaMovimiento.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, tienda: PERSONA },
    });
    return new Map(ds.map((d) => [d.id, cuenta("tienda", d.tienda)]));
  }

  async abonos(ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, CuentaNombrada>();
    const as = await this.prisma.abonoTienda.findMany({ where: { id: { in: [...ids] } }, select: { id: true, tienda: PERSONA } });
    return new Map(as.map((a) => [a.id, cuenta("tienda", a.tienda)]));
  }

  async anotaciones(movimientoIds: readonly string[]) {
    if (movimientoIds.length === 0) return new Map<string, string | null>();
    const as = await this.prisma.walletAnotacion.findMany({
      where: { movimientoId: { in: [...movimientoIds] } },
      select: { movimientoId: true, contraparteNombre: true },
    });
    return new Map(as.map((a) => [a.movimientoId, a.contraparteNombre]));
  }

  async comos(ids: Pick<IdsDeDocumentos, "pagos" | "pagosPorCuenta" | "abonos" | "movimientos">) {
    const como = (metodo: ComoDTO["metodo"], referencia: string | null): ComoDTO => ({ metodo, referencia });
    const pagos =
      ids.pagos.length === 0
        ? []
        : await this.prisma.liquidacionPago.findMany({
            where: { id: { in: [...ids.pagos] } },
            select: { id: true, metodo: true, referencia: true },
          });
    const pagosPorCuenta =
      ids.pagosPorCuenta.length === 0
        ? []
        : await this.prisma.pagoPorCuentaTienda.findMany({
            where: { id: { in: [...ids.pagosPorCuenta] } },
            select: { id: true, metodo: true, referencia: true },
          });
    const abonos =
      ids.abonos.length === 0
        ? []
        : await this.prisma.abonoTienda.findMany({
            where: { id: { in: [...ids.abonos] } },
            select: { id: true, metodo: true, referencia: true },
          });
    // La referencia anotada a mano (458-B, TB.11): sin metodo; sin referencia no hay «como».
    const anotadas =
      ids.movimientos.length === 0
        ? []
        : await this.prisma.walletAnotacion.findMany({
            where: { movimientoId: { in: [...ids.movimientos] }, referencia: { not: null } },
            select: { movimientoId: true, referencia: true },
          });
    return {
      pagos: new Map(pagos.map((p) => [p.id, como(p.metodo, p.referencia)])),
      pagosPorCuenta: new Map(pagosPorCuenta.map((p) => [p.id, como(p.metodo, p.referencia)])),
      abonos: new Map(abonos.map((a) => [a.id, como(a.metodo, a.referencia)])),
      movimientos: new Map(anotadas.map((a) => [a.movimientoId, como(null, a.referencia)])),
    };
  }

  async anulaciones(ids: IdsDeDocumentos): Promise<Record<keyof IdsDeDocumentos, Map<string, AnulacionDeDocumento>>> {
    const CONSTANCIA = { motivo: true, createdAt: true, anulador: { select: NOMBRE_USUARIO_SELECT } } as const;
    // SLT-143 (R36): la constancia de una anulación de la plataforma la firma el superadmin, que no tiene empresa:
    // la RLS de `usuario` se lo esconde a la empresa y Prisma trae `null` aunque la relación sea obligatoria. Sale
    // `por: null` y el servicio pone «la plataforma».
    const leer = (f: { motivo: string; createdAt: Date; anulador: NombreUsuarioFuente | null }): AnulacionDeDocumento => ({
      motivo: f.motivo,
      por: nombreONulo(f.anulador),
      fecha: f.createdAt,
    });
    const lista = (xs: readonly string[]) => ({ in: [...xs] });

    const pagos =
      ids.pagos.length === 0
        ? []
        : await this.prisma.liquidacionAnulacion.findMany({ where: { pagoId: lista(ids.pagos) }, select: { pagoId: true, ...CONSTANCIA } });
    const pagosPorCuenta =
      ids.pagosPorCuenta.length === 0
        ? []
        : await this.prisma.pagoPorCuentaTiendaAnulacion.findMany({
            where: { pagoId: lista(ids.pagosPorCuenta) },
            select: { pagoId: true, ...CONSTANCIA },
          });
    const aportes =
      ids.aportes.length === 0
        ? []
        : await this.prisma.aporteCapitalAnulacion.findMany({ where: { aporteId: lista(ids.aportes) }, select: { aporteId: true, ...CONSTANCIA } });
    const abonos =
      ids.abonos.length === 0
        ? []
        : await this.prisma.abonoTiendaAnulacion.findMany({ where: { abonoId: lista(ids.abonos) }, select: { abonoId: true, ...CONSTANCIA } });
    const cobros =
      ids.cobros.length === 0
        ? []
        : await this.prisma.cobroTiendaAnulacion.findMany({ where: { cobroId: lista(ids.cobros) }, select: { cobroId: true, ...CONSTANCIA } });
    const rechazos =
      ids.rechazos.length === 0
        ? []
        : await this.prisma.rechazoTiendaCobroAnulacion.findMany({
            where: { cobro: { gestionId: lista(ids.rechazos) } },
            select: { cobro: { select: { gestionId: true } }, ...CONSTANCIA },
          });
    const movimientos =
      ids.movimientos.length === 0
        ? []
        : await this.prisma.ajusteCajaAnulacion.findMany({
            where: { movimientoId: lista(ids.movimientos) },
            select: { movimientoId: true, ...CONSTANCIA },
          });
    // El premio (293) no tiene constancia: su reverso de caja ES la anulacion (misma clave de origen).
    const premios =
      ids.premios.length === 0
        ? []
        : await this.prisma.walletMovimiento.findMany({
            where: { categoria: "ingreso_ajuste", origenTipo: "ranking_snapshot_fila", origenId: lista(ids.premios) },
            select: { origenId: true, descripcion: true, createdAt: true, registrador: { select: NOMBRE_USUARIO_SELECT } },
          });

    // SLT-68: el incentivo tampoco tiene constancia; su reverso de caja ES la anulacion.
    const incentivos =
      ids.incentivos.length === 0
        ? []
        : await this.prisma.walletMovimiento.findMany({
            where: { categoria: "ingreso_ajuste", origenTipo: "incentivo_mensajero", origenId: lista(ids.incentivos) },
            select: { origenId: true, descripcion: true, createdAt: true, registrador: { select: NOMBRE_USUARIO_SELECT } },
          });

    return {
      pagos: new Map(pagos.map((f) => [f.pagoId, leer(f)])),
      pagosPorCuenta: new Map(pagosPorCuenta.map((f) => [f.pagoId, leer(f)])),
      aportes: new Map(aportes.map((f) => [f.aporteId, leer(f)])),
      abonos: new Map(abonos.map((f) => [f.abonoId, leer(f)])),
      cobros: new Map(cobros.map((f) => [f.cobroId, leer(f)])),
      rechazos: new Map(rechazos.map((f) => [f.cobro.gestionId, leer(f)])),
      movimientos: new Map(movimientos.map((f) => [f.movimientoId, leer(f)])),
      premios: new Map(
        premios.flatMap((f) =>
          f.origenId === null
            ? []
            : [[f.origenId, { motivo: f.descripcion, por: nombreONulo(f.registrador), fecha: f.createdAt }] as const],
        ),
      ),
      incentivos: new Map(
        incentivos.flatMap((f) =>
          f.origenId === null
            ? []
            : [[f.origenId, { motivo: f.descripcion, por: nombreONulo(f.registrador), fecha: f.createdAt }] as const],
        ),
      ),
    };
  }

  async marcasDeLaPlataforma(pagoIds: readonly string[]): Promise<MarcasDeLaPlataforma> {
    if (pagoIds.length === 0) return { registrados: new Set(), anulados: new Set(), enLinea: new Set() };
    // Una sola lectura para las tres marcas: la confirmación dice si fue por fuera, si fue en línea (SLT-226,
    // R29) y si su anulación existe. Solo se leen los ids: ni quién confirmó ni quién anuló llegan a la empresa
    // (R13, R36).
    const cs = await this.prisma.pagoPlataformaConfirmacion.findMany({
      where: {
        pagoId: { in: [...pagoIds] },
        OR: [{ porFuera: true }, { enLinea: true }, { anulaciones: { some: {} } }],
      },
      select: { pagoId: true, porFuera: true, enLinea: true, anulaciones: { select: { id: true } } },
    });
    return {
      registrados: new Set(cs.filter((c) => c.porFuera).map((c) => c.pagoId)),
      anulados: new Set(cs.filter((c) => c.anulaciones.length > 0).map((c) => c.pagoId)),
      enLinea: new Set(cs.filter((c) => c.enLinea).map((c) => c.pagoId)),
    };
  }
}
