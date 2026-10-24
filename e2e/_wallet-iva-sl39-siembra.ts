import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient, type RolValue } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { SINPE_DE_PRUEBA } from "./_dos-empresas-fixture";

// SL-39 (T5, C2, T7) — la siembra del recorrido en el navegador de `wallet-iva-aparte-sl39.spec.ts`.
//
// Dos empresas, A y B, dadas de alta por el servicio (molde de SL-17, `_dos-empresas-fixture.ts`).
// En cada una:
//   - la caja: las filas que el feed del cierre escribe al aprobar (molde de
//     `tests/integration/db/caja-iva-aparte-sl39.test.ts`): el ejemplo de design §1 en A, importes
//     pequenos y distintos en B;
//   - solo en A, los cierres A y B de design §12.4 (molde de
//     `tests/integration/db/cierre-iva-aparte-sl39.test.ts`), SOLICITADOS y con destino la bodega
//     central, para que el maestro los vea en «Pendientes de decision». Un cierre solicitado no
//     escribe en la caja: la caja de A es la del ejemplo y nada mas.
//
// Las cifras esperadas NO se derivan aqui: van escritas a mano en el spec, que es el contrato.

type FilaDeCaja = {
  tipo: "ingreso" | "egreso";
  categoria:
    | "ingreso_cod_recaudado"
    | "ingreso_flete"
    | "ingreso_iva_flete"
    | "ingreso_comision_cod"
    | "ingreso_iva_comision_cod"
    | "egreso_pago_mensajero";
  monto: string;
};

/** El ejemplo de design §1, fila a fila. */
export const CAJA_A: readonly FilaDeCaja[] = [
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "20000.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "325.00" },
  { tipo: "ingreso", categoria: "ingreso_comision_cod", monto: "700.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "91.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "1500.00" },
];

/** B: pequenos y distintos. Si una fila de B se colara en A (o al reves) cambiaria en centimos. */
export const CAJA_B: readonly FilaDeCaja[] = [
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "500.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "40.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "5.20" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "1.30" },
];

/** Escribe la caja de una empresa y comprueba, con el dueno (sin RLS), que las filas existen. */
export async function sembrarCaja(
  dueno: PrismaClient,
  organizacionId: string,
  filas: readonly FilaDeCaja[],
): Promise<void> {
  const origenId = randomUUID();
  const ids = await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    const creados: string[] = [];
    for (const f of filas) {
      const { id } = await tx.walletMovimiento.create({
        data: {
          organizacionId,
          tipo: f.tipo,
          categoria: f.categoria,
          monto: new Prisma.Decimal(f.monto),
          origenTipo: "cierre_dia",
          origenId,
          descripcion: "SL-39: recorrido del IVA aparte",
        },
        select: { id: true },
      });
      creados.push(id);
    }
    return creados;
  });
  // Control de no vacuidad: sin las filas, la pantalla mediria ceros y el spec no probaria nada.
  const leidas = await dueno.walletMovimiento.findMany({
    where: { id: { in: ids } },
    select: { organizacionId: true, categoria: true, monto: true },
  });
  const huella = leidas.map((f) => `${f.organizacionId}|${f.categoria}|${f.monto.toFixed(2)}`).sort();
  const esperada = filas.map((f) => `${organizacionId}|${f.categoria}|${f.monto}`).sort();
  if (JSON.stringify(huella) !== JSON.stringify(esperada)) {
    throw new Error("SL-39 siembra: la caja sembrada no coincide con la pedida");
  }
}

/** Los nombres de los dos mensajeros: por ellos se localiza cada cierre en la cola. */
export interface CierresSembrados {
  mensajeroEntrega: string;
  mensajeroRechazo: string;
}

/** Los cierres A (entrega) y B (rechazo) de design §12.4, solicitados a la bodega central de A. */
export async function sembrarCierres(
  dueno: PrismaClient,
  organizacionId: string,
): Promise<CierresSembrados> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const mensajeroEntrega = `Entrega${sufijo}`;
  const mensajeroRechazo = `Rechazo${sufijo}`;

  await dueno.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);

      const roles = await tx.rol.findMany({ select: { id: true, value: true } });
      const rolId = (v: RolValue): string => {
        const r = roles.find((x) => x.value === v);
        if (!r) throw new Error(`SL-39 siembra: falta el rol «${v}»: corre \`pnpm run db:seed\``);
        return r.id;
      };
      const tipo = await tx.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
      const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
      const canton = await tx.canton.findFirst({
        where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
        select: { id: true, provinciaId: true },
      });
      if (!tipo || !estatus || !canton) {
        throw new Error("SL-39 siembra: faltan catalogos o geografia (¿sin `pnpm run db:seed`?)");
      }

      const persona = (nombre: string, rol: RolValue) => {
        const s = randomUUID().replace(/-/g, "").slice(0, 12);
        return tx.usuario.create({
          data: {
            nombre,
            primerApellido: "SL39",
            email: `sl39-${rol.toLowerCase()}-${s}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `sl39-${s}`,
            tipoIdentificacionId: tipo.id,
            rolId: rolId(rol),
            estado: "activo",
            organizacionId,
          },
          select: { id: true },
        });
      };

      // `sinpeRevisadoAt`: sin el, cada pantalla abre el modal «Confirma el SINPE» y tapa los clics.
      const central = await tx.zona.create({
        data: {
          nombre: `Central SL39 ${sufijo}`,
          sinpeNumero: SINPE_DE_PRUEBA,
          sinpeNombre: "Titular SL39",
          esCentral: true,
          sinpeRevisadoAt: new Date(),
        },
        select: { id: true },
      });
      const zona = await tx.zona.create({
        data: {
          nombre: `Zona SL39 ${sufijo}`,
          sinpeNumero: SINPE_DE_PRUEBA,
          sinpeNombre: "Titular SL39",
          sinpeRevisadoAt: new Date(),
        },
        select: { id: true },
      });
      const tienda = await persona(`Tienda${sufijo}`, "adminTienda");
      const mA = await persona(mensajeroEntrega, "mensajero");
      const mB = await persona(mensajeroRechazo, "mensajero");

      // El flete normal y el GAM valen lo mismo (y los dos devueltos): la columna que elija
      // `resolverFlete` no cambia la cifra. Tasas de IVA 13,00 % en flete y comision.
      const tarifa = await tx.tarifa.create({
        data: {
          tiendaId: tienda.id,
          zonaId: null,
          valorFlete: new Prisma.Decimal("2500.00"),
          valorFleteGam: new Prisma.Decimal("2500.00"),
          valorFleteDevuelto: new Prisma.Decimal("2000.00"),
          valorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
          fulfillment: new Prisma.Decimal("0.00"),
          comisionCod: new Prisma.Decimal("3.50"),
          ivaFlete: new Prisma.Decimal("13.00"),
          ivaComisionCod: new Prisma.Decimal("13.00"),
        },
        select: { id: true },
      });

      const nuevoCierre = async (mensajeroId: string, general: string, pago: string) =>
        (
          await tx.cierreDia.create({
            data: {
              mensajeroId,
              estado: "solicitado",
              destinoTipo: "bodega_central",
              destinoZonaId: central.id,
              totalEfectivo: new Prisma.Decimal(general),
              totalSimpe: new Prisma.Decimal("0.00"),
              totalTransferencia: new Prisma.Decimal("0.00"),
              totalGeneral: new Prisma.Decimal(general),
              totalPagoMensajero: new Prisma.Decimal(pago),
              totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
            },
            select: { id: true },
          })
        ).id;

      const cierreA = await nuevoCierre(mA.id, "20000.00", "1500.00");
      const cierreB = await nuevoCierre(mB.id, "0.00", "2100.00");

      const gestion = async (o: {
        clave: string;
        cierreId: string;
        mensajeroId: string;
        montoCobrar: string;
        resultado: "entregado" | "devolucion_a_origen_por_rechazo";
        pagado: string | null;
      }) => {
        const numRemision = `SL39-${o.clave}-${sufijo}`;
        const orden = await tx.orden.create({
          data: {
            numRemision,
            destinatario: `Destinatario ${o.clave}`,
            telefonoDest: "88880000",
            producto: `Producto ${o.clave}`,
            montoCobrar: new Prisma.Decimal(o.montoCobrar),
            cobraComision: true,
            estatusId: estatus.id,
            mensajeroAsignadoId: o.mensajeroId,
            tiendaId: tienda.id,
            zonaId: zona.id,
            provinciaId: canton.provinciaId,
            cantonId: canton.id,
          },
          select: { id: true },
        });
        await tx.gestionOrden.create({
          data: {
            ordenId: orden.id,
            mensajeroId: o.mensajeroId,
            resultado: o.resultado,
            cierreId: o.cierreId,
            montoRecibido: o.pagado === null ? null : new Prisma.Decimal(o.pagado),
            metodoPago: o.pagado === null ? null : "efectivo",
            pagos:
              o.pagado === null
                ? undefined
                : { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(o.pagado) }] },
          },
          select: { id: true },
        });
        await tx.cierreDetail.create({
          data: {
            cierreId: o.cierreId,
            ordenId: orden.id,
            montoCobrar: new Prisma.Decimal(o.montoCobrar),
            cobraComision: true,
            zonaId: zona.id,
            tiendaId: tienda.id,
            esCentral: false,
            esZonaEspecial: false,
            tarifaId: tarifa.id,
            tarifaValorFlete: new Prisma.Decimal("2500.00"),
            tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
            tarifaValorFleteDevuelto: new Prisma.Decimal("2000.00"),
            tarifaValorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
            tarifaComisionCod: new Prisma.Decimal("3.50"),
            tarifaIvaFlete: new Prisma.Decimal("13.00"),
            tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
            tarifaFulfillment: new Prisma.Decimal("0.00"),
            numRemision,
            destinatario: `Destinatario ${o.clave}`,
            producto: `Producto ${o.clave}`,
            tiendaNombre: "Tienda SL-39",
            zonaNombre: "Zona SL-39",
            provinciaNombre: "Cartago",
            cantonNombre: "Cartago",
          },
          select: { id: true },
        });
      };

      await gestion({
        clave: "a-entrega",
        cierreId: cierreA,
        mensajeroId: mA.id,
        montoCobrar: "20000.00",
        resultado: "entregado",
        pagado: "20000.00",
      });
      await gestion({
        clave: "b-rechazo",
        cierreId: cierreB,
        mensajeroId: mB.id,
        montoCobrar: "15000.00",
        resultado: "devolucion_a_origen_por_rechazo",
        pagado: null,
      });
    },
    { timeout: 60_000 },
  );

  return { mensajeroEntrega, mensajeroRechazo };
}

/**
 * Un importe tal como lo pinta la pantalla a la forma decimal de los DTO. `money()` agrupa los
 * miles con «.», separa los decimales con «,» y los OMITE cuando son cero: «₡1.700» → «1700.00»,
 * «₡6,50» → «6.50», «-₡100» → «-100.00», «+₡416» → «416.00». Solo cambia la notacion: no hay
 * aritmetica.
 */
export function importeDeTexto(texto: string): string {
  const limpio = texto.replace(/\s/g, "");
  const negativo = /^[^\d]*[-−]/.test(limpio);
  const cifras = limpio.replace(/[^\d.,]/g, "");
  const m = /^(\d{1,3}(?:\.\d{3})*)(?:,(\d{2}))?$/.exec(cifras);
  if (!m) throw new Error(`importe ilegible en pantalla: «${texto}»`);
  const enteros = (m[1] ?? "").replace(/\./g, "");
  return `${negativo ? "-" : ""}${enteros}.${m[2] ?? "00"}`;
}
