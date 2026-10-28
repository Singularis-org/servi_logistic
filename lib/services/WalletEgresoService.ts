import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  AntesDelRegistro,
  CrearMovimientoInput,
  IWalletMovimientoRepository,
  LateralesDelRegistro,
  WalletTxClient,
} from "@/lib/interfaces/repositories/IWalletMovimientoRepository";
import type { ITopePagoPlataforma } from "@/lib/interfaces/services/ITopePagoPlataformaService";
import { MENSAJE_TOPE_PAGO_PLATAFORMA } from "@/lib/types/cobro-plataforma";
import type { ComprobanteRecibido, IWalletComprobanteService } from "@/lib/interfaces/services/IWalletComprobanteService";
import { lateralesDeCaja, registrarConComprobante } from "@/lib/services/registro-con-comprobante";
import type { CamposLateralesCaja } from "@/lib/types/wallet-laterales";
import type {
  IWalletEgresoService,
  RegistrarEgresoServiceResult,
  ReversarEgresoServiceResult,
  VerDesgloseEgresosServiceResult,
} from "@/lib/interfaces/services/IWalletEgresoService";
import {
  TIPO_EGRESO_MANUAL_A_CATEGORIA,
  type ListarMovimientosInput,
  type RegistrarEgresoAdministrativoInput,
  type ReversarEgresoInput,
} from "@/lib/types/wallet";
import { instanteDelMovimientoManual } from "@/lib/utils/fecha-movimiento-manual";
import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { CATEGORIA_LABEL } from "@/lib/constants/wallet-rotulos";

// Roles autorizados (R17): acceso total (maestro/admin, dueños de la caja central), espejo de
// WalletService.

/**
 * SL-45 (design §6, R9) — el pago supera la deuda vigente. Lo lanza el `antes` DENTRO de la
 * transacción, para que se deshaga sin escribir nada, y el servicio lo traduce a `validation_error`.
 */
class TopeSuperadoError extends Error {
  constructor() {
    super("SL-45: el pago a la plataforma supera la deuda vigente");
    this.name = "TopeSuperadoError";
  }
}

/**
 * Feature 45 — logica de negocio de los EGRESOS administrativos de la caja principal (gasto
 * variable / sueldo manual + reversa + desglose). No conoce HTTP ni Prisma directamente:
 * recibe el repo del libro por inyeccion (mismo patron que WalletService). Guardia de rol
 * maestro (R17). INMUTABILIDAD (R6): NO expone update/delete; la correccion es un movimiento
 * compensatorio append-only (reversarEgreso). Money-safe: DTOs con montos STRING.
 */
export class WalletEgresoService implements IWalletEgresoService {
  constructor(
    private readonly repo: IWalletMovimientoRepository,
    // Cliente de escritura para el egreso/reverso (fuera de una tx de cierre): el repo
    // acepta cualquier WalletTxClient; aqui inyectamos el PrismaClient completo.
    private readonly writeClient: WalletTxClient,
    /** FICHA 458-B (R74) — el comprobante del sueldo/gasto. Sin el, registrar CON comprobante lanza. */
    private readonly comprobantes?: IWalletComprobanteService,
    /** SL-45 (design §6) — el tope del pago a la plataforma. Sin él, registrar un pago lanza. */
    private readonly tope?: ITopePagoPlataforma,
  ) {}

  async registrarEgreso(
    input: RegistrarEgresoAdministrativoInput & Partial<CamposLateralesCaja>,
    actor: Actor,
    comprobante: ComprobanteRecibido | null = null,
  ): Promise<RegistrarEgresoServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R17
    // SL-45 (design §6): un pago sin tope no se acepta nunca. Falla ruidoso, antes de subir el
    // comprobante o tocar la base: es un composition root mal cableado, no un dato del usuario.
    if (input.tipoEgreso === "pago_plataforma" && this.tope === undefined) {
      throw new Error("wallet: pago a la plataforma sin el tope inyectado: revisar el composition root");
    }
    // FICHA 458-B (R42/R74–R76): «a quien», referencia y comprobante, en la MISMA transaccion que el
    // asiento. Sin ninguno de los tres, lo de abajo es exactamente el registro de antes.
    return registrarConComprobante(this.comprobantes, "wallet_movimiento", comprobante, async (guardado) => {
      const r = await this.escribirEgreso(input, actor, lateralesDeCaja(input, guardado, actor.usuarioId));
      return { quedo: r.status === "ok", resultado: r };
    });
  }

  private async escribirEgreso(
    input: RegistrarEgresoAdministrativoInput,
    actor: Actor,
    laterales: LateralesDelRegistro | undefined,
  ): Promise<Extract<RegistrarEgresoServiceResult, { status: "ok" | "ya_registrado" | "validation_error" }>> {
    // R2: mapeo tipo de egreso manual -> categoria del libro (gasto_variable /
    // egreso_gasto_variable, sueldo / egreso_sueldo). El gasto FIJO no llega aqui (rechazado
    // en el borde por zod, R19). R1/R3/R7: fila inmutable, origen_tipo=gasto, origen_id=NULL
    // (fuera del indice unico parcial: cada egreso manual es una fila propia),
    // registrado_por=<maestro>. Un unico INSERT atomico via crearMovimientos.
    const categoria = TIPO_EGRESO_MANUAL_A_CATEGORIA[input.tipoEgreso];
    // Ficha 334 (R28, design §5): el `id` lo genera EL SERVICIO y viaja en la insercion, para
    // poder releer despues EXACTAMENTE esta fila. Sigue siendo UN SOLO INSERT.
    const id = randomUUID();
    // Ficha 334 (R22/R23): con «hoy» la clave NO viaja y manda el DEFAULT de la columna.
    const fechaMovimiento = instanteDelMovimientoManual(input.fecha);
    // FICHA 362 (R6/R9) — `egreso_administrativo_registrado`, en la MISMA transaccion que el
    // asiento. La abre el repositorio: el servicio no conoce Prisma.
    const mov: CrearMovimientoInput & { id: string } = {
      id,
      tipo: "egreso",
      categoria,
      monto: input.monto,
      origenTipo: "gasto",
      origenId: null,
      descripcion: input.descripcion,
      registradoPor: actor.usuarioId,
      ...(fechaMovimiento !== undefined ? { fechaMovimiento } : {}),
      claveIdempotencia: input.claveIdempotencia, // ficha 461 (R66/R67)
    };
    const registro = { accion: "egreso_administrativo_registrado" as const, actorUsuarioId: actor.usuarioId };
    // FICHA 458-B: sin laterales, la llamada es EXACTAMENTE la de antes (dos argumentos).
    // SL-45: el pago a la plataforma pasa además el tope, que corre dentro de la transacción.
    const antes = this.antesDelPago(input, actor);
    let escritas: number;
    try {
      escritas =
        antes !== undefined
          ? await this.repo.crearMovimientoRegistrado(mov, registro, laterales, antes)
          : laterales === undefined
            ? await this.repo.crearMovimientoRegistrado(mov, registro)
            : await this.repo.crearMovimientoRegistrado(mov, registro, laterales);
    } catch (e) {
      if (e instanceof TopeSuperadoError) {
        return { status: "validation_error", fieldErrors: { monto: [MENSAJE_TOPE_PAGO_PLATAFORMA] } }; // R9
      }
      throw e;
    }
    // Ficha 461 (R68, auditoria D2): `0` = la clave YA tenia su fila (doble clic, reintento). No se
    // escribio nada —ni asiento ni historial— y se responde con el egreso ORIGINAL, releido por la
    // clave. Antes, dos envios iguales eran dos sueldos o dos gastos y nada lo notaba.
    if (escritas === 0) {
      const original = await this.repo.obtenerPorClave(input.claveIdempotencia);
      if (original === null) {
        throw new Error("wallet: clave de idempotencia repetida sin egreso que releer");
      }
      return { status: "ya_registrado", movimiento: original };
    }

    // Ficha 334 (R28): se relee POR ID, no «el mas reciente de esta categoria». Aquella
    // relectura funcionaba por ACCIDENTE (todo se fechaba con `now()`); registrado un gasto
    // variable con fecha de la semana pasada devolveria OTRO gasto variable.
    const movimiento = await this.repo.obtenerPorId(id);
    if (movimiento === null) {
      // Imposible por construccion: `escritas` fue 1, asi que la fila con ESTE id existe. Se propaga
      // con contexto antes que devolver una fila ajena.
      throw new Error(`wallet: el egreso manual ${id} no se pudo releer tras insertarlo`);
    }
    return { status: "ok", movimiento };
  }

  /**
   * SL-45 (design §6, R9–R11) — el `antes` del pago a la plataforma: el tope, con el candado de la
   * empresa, dentro de la transacción del registro. Un reenvío de la misma clave pasa sin comparar:
   * el `INSERT` lo deduplica y se responde `ya_registrado`. Para los demás tipos, nada.
   */
  private antesDelPago(input: RegistrarEgresoAdministrativoInput, actor: Actor): AntesDelRegistro | undefined {
    if (input.tipoEgreso !== "pago_plataforma") return undefined;
    const tope = this.tope;
    // `registrarEgreso` ya lo comprobó antes de subir nada; se repite para estrechar el tipo.
    if (tope === undefined) throw new Error("wallet: pago a la plataforma sin el tope inyectado");
    // Sin empresa no hay deuda que comparar (el superadmin ya cayó en `forbidden`).
    const organizacionId = actor.organizacionId ?? null;
    if (organizacionId === null) throw new Error("wallet: pago a la plataforma sin empresa en el actor");
    return async (tx) => {
      const r = await tope.comprobar(tx, {
        organizacionId,
        monto: input.monto,
        claveIdempotencia: input.claveIdempotencia,
      });
      if (r === "supera") throw new TopeSuperadoError();
    };
  }

  async reversarEgreso(
    input: ReversarEgresoInput,
    actor: Actor,
  ): Promise<ReversarEgresoServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R17

    // R13: el monto se lee SERVER-SIDE (no lo provee el cliente). Solo se reversa un egreso
    // administrativo (tipo=egreso AND origen_tipo=gasto). Cubre tambien los egresos generados
    // por el cron (mismo tipo/origen, R32).
    const original = await this.repo.obtenerPorId(input.movimientoId);
    if (original === null || original.tipo !== "egreso" || original.origenTipo !== "gasto") {
      return { status: "not_found" };
    }

    // R13/R16: reverso = ingreso_ajuste de igual monto, origen_tipo=gasto, origen_id=<egreso
    // original> -> net cero en el balance. R14: append-only (el original no se toca). R15:
    // idempotencia por el indice unico parcial (gasto, <egresoId>, ingreso_ajuste): un
    // segundo intento es no-op via skipDuplicates -> count===0 -> already_reversed.
    //
    // FICHA 362 (R6/R9/R11) — `egreso_administrativo_reversado`. El registro va DENTRO de la
    // misma transaccion Y solo si el asiento se escribio: cuando el indice unico parcial
    // deduplica (segundo intento, `count === 0` -> `already_reversed`) NO queda fila de auditoria
    // de un reverso que no ocurrio. Eso lo garantiza el repositorio, no un `if` de aqui.
    //
    // El `id` se genera ARRIBA porque es lo que la fila del registro apunta como entidad; no
    // afecta a la idempotencia, que la da el indice `(origen_tipo, origen_id, categoria)`.
    const reversoId = randomUUID();
    const count = await this.repo.crearMovimientoRegistrado(
      {
        id: reversoId,
        tipo: "ingreso",
        categoria: "ingreso_ajuste",
        monto: original.monto,
        origenTipo: "gasto",
        origenId: original.id,
        // Ficha 458-A (TA.6, R4): sin descripcion, el texto cae al NOMBRE del concepto, nunca al id.
        descripcion: `Reverso de: ${original.descripcion ?? CATEGORIA_LABEL[original.categoria]}`,
        registradoPor: actor.usuarioId,
      },
      { accion: "egreso_administrativo_reversado", actorUsuarioId: actor.usuarioId },
    );
    if (count === 0) return { status: "already_reversed" }; // R15
    return { status: "ok" };
  }

  async verDesgloseEgresos(
    input: ListarMovimientosInput,
    actor: Actor,
  ): Promise<VerDesgloseEgresosServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R17

    // R11: desglose por tipo del conjunto filtrado (mismos filtros de fecha que el libro),
    // derivado por agregacion. Money-safe: todo STRING (nunca number).
    const { gastoFijo, gastoVariable, sueldo, indemnizacion } =
      await this.repo.agregarPorCategoria({
        tipo: input.tipo,
        categoria: input.categoria,
        desde: input.desde,
        hasta: input.hasta,
        // Ficha 458-E (TE.2, R59): el desglose del MISMO conjunto que el libro con «A quién».
        ...(input.aQuien !== undefined ? { aQuien: input.aQuien } : {}),
      });
    // Feature 158/R32: la indemnizacion entra en el total. Suma con Prisma.Decimal (nunca
    // number/parseFloat) y sale como STRING escala 2, igual que los otros tres conceptos.
    const total = new Prisma.Decimal(gastoFijo)
      .add(new Prisma.Decimal(gastoVariable))
      .add(new Prisma.Decimal(sueldo))
      .add(new Prisma.Decimal(indemnizacion))
      .toFixed(2);
    return {
      status: "ok",
      desglose: { gastoFijo, gastoVariable, sueldo, indemnizacion, total },
    };
  }
}
