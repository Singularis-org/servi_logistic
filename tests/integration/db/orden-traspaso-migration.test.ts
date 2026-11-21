import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";

// FICHA 427 (T3, design §4.1/§4.2) — LA FORMA DE `orden_traspaso_mensajero`, CONTRA POSTGRES.
//
// Una regex sobre el `migration.sql` demuestra que el TEXTO dice lo que dice. Lo que no puede
// demostrar es que Postgres HAGA lo que el texto promete: que el CHECK rechace, que las FK sean
// RESTRICT de verdad, que la RLS quede encendida y que los cinco indices existan con su nombre. Eso
// son hechos del motor.
//
// ⚠️ PROHIBIDO `if (!fks) return;`. Sin datos para sembrar, este archivo REVIENTA con un mensaje
// que lo dice: un `return` temprano reporta `passed` sin comprobar nada, y este repo ya lo pago.
//
// TODO corre dentro de una transaccion que SIEMPRE se revierte.

const ROOT = path.join(__dirname, "..", "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

function carpetaQueTerminaEn(sufijo: string): string {
  const dir = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .find((n) => n.endsWith(sufijo));
  if (!dir) throw new Error(`No se encontro la carpeta de migracion ${sufijo}`);
  return path.join(MIGRATIONS_DIR, dir);
}

const dirTabla = carpetaQueTerminaEn("_orden_traspaso_mensajero");
const upSql = fs.readFileSync(path.join(dirTabla, "migration.sql"), "utf8");
const downSql = fs.readFileSync(path.join(dirTabla, "down.sql"), "utf8");

function sinComentarios(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.trimStart().startsWith("--"))
    .join("\n");
}

const upDdl = sinComentarios(upSql);
const downDdl = sinComentarios(downSql);

const INDICES = [
  "orden_traspaso_mensajero_orden_id_created_at_idx",
  "orden_traspaso_mensajero_mensajero_anterior_id_created_at_idx",
  "orden_traspaso_mensajero_mensajero_nuevo_id_created_at_idx",
  "orden_traspaso_mensajero_actor_usuario_id_idx",
  "orden_traspaso_mensajero_lote_id_idx",
];

describe("427/T2 — el UP y el DOWN, leidos del archivo", () => {
  it("el UP crea la tabla, el CHECK, los CINCO indices y enciende la RLS", () => {
    expect(upDdl).toMatch(/CREATE TABLE "orden_traspaso_mensajero"/);
    expect(upDdl).toMatch(/orden_traspaso_mensajero_distinto_check/);
    for (const idx of INDICES) expect(upDdl, idx).toContain(idx);
    expect(upDdl).toMatch(/ALTER TABLE "orden_traspaso_mensajero" ENABLE ROW LEVEL SECURITY/);
  });

  it("el UP NO crea ningun tipo, y por eso el DOWN no recrea ninguna lista de enum", () => {
    // La pregunta obligatoria de este repo («¿los downs previos de ese enum recrean-con-lista o
    // solo dropean?») solo aplica cuando se ANADE un valor a un enum. Esta migracion no anade
    // ninguno: `rol_value` es PREEXISTENTE y esta tabla solo lo USA.
    expect(upDdl).not.toMatch(/CREATE TYPE/);
    expect(upDdl).not.toMatch(/ALTER TYPE/);
    expect(downDdl).not.toMatch(/CREATE TYPE/);
    expect(downDdl).not.toMatch(/DROP TYPE/);
  });

  it("el UP es ADITIVO: no altera `orden`, `usuario` ni `chat_conversacion`", () => {
    for (const tabla of ["orden", "usuario", "chat_conversacion", "gestion_orden"]) {
      expect(upDdl, tabla).not.toMatch(
        new RegExp(`ALTER TABLE "${tabla}"(?!_traspaso)\\s`, "i"),
      );
    }
    expect(upDdl).not.toMatch(/^\s*UPDATE\s/im);
    expect(upDdl).not.toMatch(/^\s*DELETE\s/im);
    expect(upDdl).not.toMatch(/^\s*INSERT\s/im);
  });

  it("el DOWN es exactamente el `DROP TABLE` de lo que el UP creo", () => {
    expect(downDdl).toMatch(/DROP TABLE IF EXISTS "orden_traspaso_mensajero";/);
    // Y NO toca ninguna otra tabla: revertir NO devuelve las ordenes a su mensajero anterior.
    expect(downDdl).not.toMatch(/ALTER TABLE "orden"/);
    expect(downDdl).not.toMatch(/UPDATE "orden"/);
  });

  it("su timestamp es POSTERIOR al de la ultima migracion anterior del arbol", () => {
    const anteriores = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !n.endsWith("_orden_traspaso_mensajero"))
      .sort();
    // Solo pueden ir DETRAS las que se DECLARAN aqui, cada una con su ficha y su motivo: la de los
    // enums de esta misma ficha y las de fichas que llegaron despues. Mismo patron que los censos
    // de enum con su lista de POSTERIORES: la lista crece con cada ficha posterior y la igualdad
    // EXACTA se queda. Una migracion que aparezca detras de esta sin declararse —por ejemplo, con
    // un timestamp anterior a otra ya aplicada— sigue poniendo este caso rojo.
    const posteriores = anteriores.filter((n) => n > path.basename(dirTabla));
    expect(posteriores).toEqual([
      "20260917120100_notificacion_evento_traspaso", // ficha 427: los enums de sus dos avisos
      // Ficha 425 (2026-09-14): la tabla del vinculo de revision `cierre_rechazo_tienda`. Nace
      // despues de toda migracion aplicada y no toca `orden_traspaso_mensajero`.
      "20260917120200_cierre_rechazo_tienda",
      // Ficha 429 (2026-09-15): el SINPE por bodega. Tres migraciones —el valor de enum, las tres
      // columnas de `zona` nullables y el `NOT NULL` + los dos `CHECK` una vez sembradas—. Ninguna
      // toca `orden_traspaso_mensajero`.
      "20260918120000_historial_accion_zona_sinpe",
      "20260918120100_zona_sinpe",
      "20260918120200_zona_sinpe_no_nulo",
      // Ficha 431 (2026-09-16): la conciliacion de las consolidaciones de bodega. DOS migraciones
      // —los dos valores de `historial_accion_tipo`, que van solos porque Postgres prohibe usar un
      // valor de enum en la misma transaccion que lo añade; y las cuatro columnas de la marca con
      // su backfill, sus dos CHECK y el borrado del indice unico parcial de la feature 40—.
      // Ninguna toca `orden_traspaso_mensajero`.
      "20260919120000_historial_accion_conciliacion_bodega",
      "20260919120100_cierre_bodega_conciliacion",
      // Ficha 436 (2026-09-17): `asistente_uso_diario`, el contador del tope del asistente de
      // ayuda. ADITIVA PURA: crea una tabla nueva y su FK a `usuario`; no toca
      // `orden_traspaso_mensajero` ni ningun otro objeto preexistente, y no crea ningun enum.
      "20260920120000_asistente_uso_diario",
      // Ficha 453 (2026-09-21): `vista_filtro`, las combinaciones de filtros guardadas con nombre.
      // ADITIVA PURA: crea una tabla nueva, su unico `(usuario_id, superficie, nombre)` y su FK a
      // `usuario`; no toca `orden_traspaso_mensajero` ni ningun otro objeto preexistente, no lleva
      // backfill y no crea ningun enum.
      "20260921120000_vista_filtro",
      // Ficha 454 (2026-09-23): M1, el valor `webhook_evento` de `job_tipo` (sola, por el 55P04), y
      // M2, la tabla `orden_evento` con su enum. ADITIVAS: ninguna toca `orden_traspaso_mensajero`.
      "20260923120000_job_tipo_webhook_evento",
      "20260923120100_orden_evento",
      // Ficha 454 (2026-09-23): M3, backfill y retiro condicional de `ayuda_tienda` y
      // `devolucion_por_confirmar`. Toca `orden`, `orden_historial_estado`, `orden_evento` y
      // `order_status`; no toca `orden_traspaso_mensajero` ni crea ningun enum.
      "20260923120200_retiro_estados_454",
      // Ficha 455 (2026-09-24): M1 renombra 7 values de `order_status` (UPDATE de catalogo), M2
      // renombra 4 etiquetas de `gestion_resultado` (RENAME VALUE) y M3 retira los dos huerfanos del
      // catalogo si nadie los referencia. Ninguna toca `orden_traspaso_mensajero` ni crea ningun enum.
      "20260924120000_order_status_nombre_unico",
      "20260924120100_gestion_resultado_nombre_unico",
      "20260924120200_order_status_retiro_huerfanos",
      // Ficha 459 (2026-09-25): los valores de enum de la caja, de la tienda y de origen; los del
      // historial; las cuatro tablas del pago por cuenta y del saldo inicial o aporte (con los dos
      // CHECK de los libros ampliados). Ninguna toca `orden_traspaso_mensajero`.
      "20260925120000_caja_459_enums",
      "20260925120100_historial_accion_459",
      "20260925120200_pago_por_cuenta_y_capital",
      // Ficha 462 (2026-09-25): los dos valores de enum del aviso «reprogramadas de hoy que esperan la
      // aprobacion de un cierre». Sola, aditiva, `down.sql` dinamico; no toca `orden_traspaso_mensajero`.
      "20260925130000_notificacion_evento_reprogramadas_esperan_cierre",
      // Ficha 461 (2026-09-25): los enums del cobro de la empresa a una tienda; la tabla de su anulacion
      // con los dos CHECK ampliados; la linea de caja de los cobros previos (solo INSERT en
      // `wallet_movimiento`); el enum de la anulacion de una correccion; las claves de idempotencia y
      // `ajuste_caja_anulacion`; y el backfill +6 h de los asientos de pago (solo UPDATE de
      // `fecha_movimiento` en los tres libros). Ninguna toca `orden_traspaso_mensajero`. Van DESPUES de
      // la de la 462 porque su timestamp (20260926…) es posterior: es el orden real de aplicacion.
      "20260926120000_cobro_tienda_461_enums",
      "20260926120100_cobro_tienda_461_anulacion_y_checks",
      "20260926120200_cobro_tienda_461_completar_caja",
      "20260926120300_wallet_461_enum_anulacion_correccion",
      "20260926120400_wallet_461_idempotencia_y_anulacion_correccion",
      "20260926120500_wallet_461_fechas_cr_pagos",
      // Ficha 457 (2026-09-25): los ocho valores de enum del pago de una tienda a la empresa (down dinamico)
      // y sus dos tablas con los dos CHECK de los libros ampliados. Ninguna toca `orden_traspaso_mensajero`.
      "20260927120000_abono_tienda_457_enums",
      "20260927120100_abono_tienda_457_tablas_y_checks",
      // Ficha 458-B (2026-09-26): seis valores de enum de la wallet (down dinamico) y sus tres tablas
      // laterales con los CHECK de los libros ampliados. Ninguna toca `orden_traspaso_mensajero`.
      "20260928120000_wallet_458_enums",
      "20260928120100_wallet_458_tablas",
      // Ficha 474 (2026-10-05): los cinco valores de `job_tipo` de los envios automaticos por
      // WhatsApp (solos, por el 55P04), sus cuatro tablas con dos columnas nuevas en
      // `plantilla_mensaje`, y la siembra del job de mantenimiento (solo INSERT en `jobs`). Ninguna
      // toca `orden_traspaso_mensajero`.
      "20261005120000_job_tipo_whatsapp_envios",
      "20261005120100_whatsapp_envios",
      "20261005120200_seed_whatsapp_envio_mantenimiento",
      // Ficha 419 (2026-10-21): las tres tablas del comprobante de entrega central a la tienda. No
      // toca `orden_traspaso_mensajero`.
      "20261021120000_devolucion_tienda_comprobante_419",
      // SLT-187 (2026-11-18): las 103 migraciones de SL-17 «Tabla organizacion y aislamiento por
      // empresa» en adelante, que ninguna ficha declaro aqui mientras este archivo estaba en el
      // baseline de rojos. Medido con grep sobre sus `.sql`: solo DOS tocan
      // `orden_traspaso_mensajero`, y las dos son de SL-17: `organizacion_id_en_negocio` le anade
      // `organizacion_id` (su FK, su indice y su policy por empresa) y `misma_empresa_en_fk` sus
      // triggers de misma empresa. Las demas no la nombran.
      "20261022130000_organizacion_y_rol_app",
      "20261022130100_organizacion_id_en_negocio", // SL-17: SI toca `orden_traspaso_mensajero` (ver abajo)
      "20261022130200_jobs_organizacion_id",
      "20261022130300_misma_empresa_en_fk", // SL-17: SI toca `orden_traspaso_mensajero` (ver abajo)
      "20261023090000_unicos_por_empresa",
      "20261023100000_rol_superadmin",
      "20261023100100_seed_rol_superadmin",
      "20261023100200_usuario_empresa_o_superadmin",
      "20261023120000_distrito_zona_especial_por_empresa",
      "20261023120100_retirar_distrito_zona_especial",
      "20261023130000_cobro_plataforma_tarifa",
      "20261023130100_cobro_plataforma_movimiento",
      "20261023130200_cobro_plataforma_triggers_orden",
      "20261023140000_usuario_contrasena_definida_at",
      "20261024120000_cobro_plataforma_blindaje_orden",
      "20261024130000_pago_plataforma_categoria",
      "20261024130100_pago_plataforma_check",
      "20261024140000_pago_plataforma_blindaje",
      "20261025120000_integracion",
      "20261025120100_historial_accion_integraciones",
      "20261025150000_jobs_por_empresa",
      "20261025160000_organizacion_es_demo",
      "20261025160100_entorno_marca",
      "20261026090000_usuario_unico_por_empresa",
      "20261026090100_indices_rutas_calientes",
      "20261026090200_indices_ordenes_gestiones_historial",
      "20261026120000_organizacion_modulo",
      "20261026120100_historial_accion_modulos",
      "20261026120200_job_estado_descartado",
      "20261026130000_pais",
      "20261026130100_organizacion_pais",
      "20261026130200_geografia_por_pais",
      "20261026130300_geografia_del_pais_de_la_empresa",
      "20261026130400_historial_plataforma",
      "20261026130500_pais_disponible",
      "20261027120000_modulos_nucleo",
      "20261028120000_modulo_wallet_nucleo",
      "20261028130000_plan",
      "20261028130100_historial_accion_planes",
      "20261028130200_plan_topes_triggers",
      "20261028130300_plan_cambio_programado",
      "20261028130400_plan_cambio_enums",
      "20261029120000_gestion_pago_mensajero_ajuste",
      "20261029120000_plan_de_la_empresa",
      "20261029120100_historial_accion_pago_mensajero_ajustado",
      "20261029150000_plan_ciclo_inicio_elegido",
      "20261030120000_incentivo_mensajero_enums",
      "20261030120100_incentivo_mensajero_checks",
      "20261031120000_liberar_recolecciones_recibidas",
      "20261031130000_cierre_sin_gestion_confirmacion_fisica",
      "20261031140000_plan_costeo_y_maestro_sin_tope",
      "20261031140000_slt73_diferencia_satelite_enums",
      "20261031140100_cobro_plataforma_fuente_plan",
      "20261031140100_slt73_ajuste_conciliacion",
      "20261031140200_plan_costeo_funciones",
      "20261031140200_slt73_retirar_asientos_satelite",
      "20261031140300_plan_desasignar_sin_costo_base",
      "20261101090000_zona_distrito_duplicados_sin_zona",
      "20261101090100_zona_distrito_distrito_unico_por_empresa",
      "20261102090000_slt76_historial_zona_distrito",
      "20261102090100_slt76_retirar_respaldos",
      "20261103120000_tarifas_flexibles_enums",
      "20261103120000_vehiculo_activo",
      "20261103120100_tarifas_flexibles_tablas",
      "20261103120100_vehiculo_rastro",
      "20261103120200_tarifas_flexibles_misma_empresa",
      "20261103120300_historial_tarifas_flexibles",
      "20261103140000_rechazo_tienda_cobro_tarifa_valor",
      "20261103140100_rechazo_tienda_cobro_tarifa_valor_misma_empresa",
      "20261104130000_plan_sin_negociable_y_tipo_cobro",
      "20261104130100_historial_accion_plan_tipo_cobro_cambiado",
      "20261104140000_historial_tarifa_activacion",
      "20261104140100_tarifa_activacion",
      "20261104150000_plan_costo_por_orden_porcentual",
      "20261104150100_cobro_plataforma_porcentual_orden",
      "20261104150200_cobro_plataforma_porcentual_funciones",
      "20261106120000_plan_periodo_facturacion",
      "20261106130000_plan_de_la_empresa_pendiente_sin_plan",
      "20261106140000_plan_aplicar_cambio_empresa_enum",
      "20261106150000_historial_accion_plan_cambio_empresa_cancelado",
      "20261107120000_slt42_pais_telefono_y_zona",
      "20261107120100_slt42_tipo_documento_por_pais",
      "20261107120200_slt42_usuario_documento_unico_por_tipo",
      "20261107130000_historial_tope_intentos",
      "20261107130100_organizacion_tope_intentos",
      "20261108120000_slt94_fulfillment_enums",
      "20261108120100_slt94_se_recoge_en_tienda",
      "20261108120200_slt94_fulfillment_movimiento",
      "20261108120300_slt94_fulfillment_triggers",
      "20261109120000_cobro_plataforma_traza",
      "20261110120000_bug_report",
      "20261111120000_bug_report_status",
      "20261111130000_factura_plataforma_job_enum",
      "20261111130100_factura_plataforma",
      "20261112120000_bug_report_image",
      "20261113120000_cobro_plataforma_sin_valor_empresa",
      "20261114120000_pago_independiente_efectivo",
      "20261114120000_plan_cambio_por_empresa",
      "20261115120000_pago_satelite_enum",
      "20261115120100_pago_satelite_checks",
      "20261116120000_pago_plataforma_confirmacion",
      "20261117120000_factura_plataforma_aviso_enums",
      "20261117120000_plan_borrador",
      "20261119120000_historial_accion_ordenes_retiradas_a_central",
      // SLT-212: el instante del cobro de la plataforma en UTC (solo `CREATE OR REPLACE` de tres funciones).
      "20261119120100_cobro_plataforma_ocurrido_utc",
      // SLT-214: la tabla `plan_beneficio`, el paso del borrador y `plan_de_la_empresa`; no toca `orden_traspaso_mensajero`.
      "20261120120000_plan_beneficio",
      // SLT-221: dos tipos del historial y `valor_anterior`/`valor_nuevo` a 254.
      "20261120130000_slt221_historial_correo_cedula",
      // SLT-224: correccion unica de `orden.zona_id` en la central (UPDATE de `orden`, INSERT en
      // `historial_accion`, respaldo en `respaldo_slt224`). No toca `orden_traspaso_mensajero`.
      "20261121120000_slt224_zona_de_ordenes_en_central",
      // SLT-143: la tabla `pago_plataforma_anulacion` y el pago por fuera; no toca `orden_traspaso_mensajero`.
      "20261121130000_pago_plataforma_por_fuera",
      // SLT-215: el valor `plan_niveles_cerrar` de `job_tipo` y las tablas y funciones de los niveles por volumen;
      // no tocan `orden_traspaso_mensajero`.
      "20261121140000_plan_nivel_job_enum",
      "20261121140100_plan_nivel",
      // SLT-221: la tabla del cambio de correo pendiente; no toca `orden_traspaso_mensajero`.
      "20261122120000_slt221_usuario_cambio_correo",
      // SLT-225: los tipos `zona_desactivada`/`zona_reactivada` y la marca `zona.activa` con sus dos
      // triggers; no tocan `orden_traspaso_mensajero`.
      "20261123120000_historial_zona_desactivada",
      "20261123120100_zona_activa",
      // SL-21: seis columnas de moneda e impuesto en `pais` y el relleno de CR; no toca `orden_traspaso_mensajero`.
      "20261124120000_sl21_pais_moneda_impuesto",
      // SLT-247 (2026-11-20): el valor `retorno_por_rechazo_cierre` del enum del historial; no toca
      // `orden_traspaso_mensajero`.
      "20261124130000_orden_historial_origen_retorno_rechazo_cierre",
      // SLT-226: los dos valores del historial de plataforma (sola, por el 55P04) y las tablas `cobro_intento` y
      // `cobro_webhook_evento` con sus funciones; no tocan `orden_traspaso_mensajero`.
      "20261124140000_cobro_historial_enum",
      "20261124140100_cobro_intento",
    ]);
  });
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("427/T3 — la tabla, tal y como Postgres la tiene", () => {
  let prisma: PrismaClient;
  let ROL_MENSAJERO: string;
  let ROL_MAESTRO: string;
  let TIPO_IDENT: string;
  // SLT-180 (R1042): tienda y zona se SIEMBRAN en la tx del caso (en `sembrarOrden`); ya no se lee
  // «la primera orden» de la base.
  let FKS: { estatusId: string; tiendaId: string; zonaId: string; provinciaId: string; cantonId: string };

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const roles = await prisma.rol.findMany({
      where: { value: { in: ["mensajero", "maestro"] } },
      select: { id: true, value: true },
    });
    ROL_MENSAJERO = roles.find((r) => r.value === "mensajero")?.id ?? "";
    ROL_MAESTRO = roles.find((r) => r.value === "maestro")?.id ?? "";
    if (!ROL_MENSAJERO || !ROL_MAESTRO) {
      throw new Error("faltan los roles `mensajero`/`maestro` en el catalogo: corre el seed.");
    }
    // SLT-180: el catalogo se lee por su clave, no «el primero que salga».
    const tipo = await prisma.tipoIdentificacion.findUnique({
      where: { value: "cedula" },
      select: { id: true },
    });
    if (!tipo) throw new Error("no hay `tipo_identificacion` «cedula» en la base: corre el seed.");
    TIPO_IDENT = tipo.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function sembrarUsuario(tx: TxDeTest, rolId: string, etiqueta: string): Promise<string> {
    const sufijo = `${etiqueta}-${randomUUID().slice(0, 8)}`;
    const u = await tx.usuario.create({
      data: {
        nombre: `Corpus427T3 ${etiqueta}`,
        email: `corpus427t3.${sufijo}@example.test`,
        telefono: "88880000",
        passwordHash: "x",
        cedula: `T3-427-${sufijo}`,
        tipoIdentificacionId: TIPO_IDENT,
        rolId,
      },
      select: { id: true },
    });
    return u.id;
  }

  async function sembrarOrden(tx: TxDeTest): Promise<string> {
    // SLT-180 (R1044): la fila con la que se miden el CHECK y los RESTRICT cuelga de una tienda y
    // una zona sembradas aqui; control positivo que nombra la fila si la siembra no llega.
    FKS = await crearFksDeOrden(tx);
    expect(
      await tx.usuario.count({ where: { id: FKS.tiendaId } }),
      "SLT-180: la tienda sembrada no esta en la base",
    ).toBe(1);
    expect(
      await tx.zona.count({ where: { id: FKS.zonaId } }),
      "SLT-180: la zona sembrada no esta en la base",
    ).toBe(1);
    const o = await tx.orden.create({
      data: {
        numGuia: 950_000_000 + Math.floor(Math.random() * 40_000_000),
        numRemision: `T3-427-${randomUUID().slice(0, 12)}`,
        destinatario: "Corpus 427 T3",
        telefonoDest: "88880000",
        producto: "caja",
        estatusId: FKS.estatusId,
        tiendaId: FKS.tiendaId,
        zonaId: FKS.zonaId,
        provinciaId: FKS.provinciaId,
        cantonId: FKS.cantonId,
      },
      select: { id: true },
    });
    return o.id;
  }

  it("⭑ (a) las columnas son las del diseno, con sus NOT NULL", async () => {
    const columnas = await prisma.$queryRawUnsafe<
      { column_name: string; is_nullable: string; udt_name: string }[]
    >(
      `SELECT column_name, is_nullable, udt_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orden_traspaso_mensajero'
        ORDER BY column_name`,
    );

    // AUTOCOMPROBACION: si la tabla no existiera, la lista saldria vacia y todo lo de abajo pasaria.
    expect(columnas.length).toBeGreaterThan(0);

    const porNombre = Object.fromEntries(columnas.map((c) => [c.column_name, c]));
    expect(Object.keys(porNombre).sort()).toEqual([
      "actor_rol",
      "actor_usuario_id",
      "created_at",
      "id",
      "lote_id",
      "mensajero_anterior_id",
      "mensajero_nuevo_id",
      "motivo",
      "orden_id",
      // SLT-187: la empresa, anadida por SL-17 (`20261022130100_organizacion_id_en_negocio`), NOT NULL.
      "organizacion_id",
    ]);
    // TODAS NOT NULL: no hay estado irrepresentable que admitir.
    for (const c of columnas) expect(c.is_nullable, c.column_name).toBe("NO");
    // El rol del actor es el ENUM NATIVO, no texto libre: `actor_rol` congela un valor del catalogo.
    expect(porNombre.actor_rol.udt_name).toBe("rol_value");
  });

  it("⭑ (f) R30: la tabla NO tiene `updated_at` ni `deleted_at` — es append-only", async () => {
    const columnas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orden_traspaso_mensajero'`,
    );
    expect(columnas.length).toBeGreaterThan(0);
    const nombres = columnas.map((c) => c.column_name);
    expect(nombres).not.toContain("updated_at");
    expect(nombres).not.toContain("deleted_at");
    // CONTROL: la columna que SI tiene que estar, para que lo de arriba no sea verde por vacio.
    expect(nombres).toContain("created_at");
  });

  it("⭑ (d) `relrowsecurity` es TRUE: la RLS quedo encendida", async () => {
    const filas = await prisma.$queryRawUnsafe<{ rls: boolean }[]>(
      `SELECT c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'orden_traspaso_mensajero'`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].rls).toBe(true);
  });

  it("⭑ (e) los CINCO indices existen, por nombre", async () => {
    const filas = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'orden_traspaso_mensajero'
        ORDER BY indexname`,
    );
    const nombres = filas.map((f) => f.indexname);
    expect(nombres.length).toBeGreaterThan(0);
    for (const idx of INDICES) expect(nombres, idx).toContain(idx);
    // Y la PK.
    expect(nombres).toContain("orden_traspaso_mensajero_pkey");
  });

  it("⭑⭑ (b) R7: el CHECK RECHAZA origen == destino, y falla por ESE motivo", async () => {
    const error = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const ordenId = await sembrarOrden(tx);
      const mensajero = await sembrarUsuario(tx, ROL_MENSAJERO, "mismo");
      const actor = await sembrarUsuario(tx, ROL_MAESTRO, "actor");
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden_traspaso_mensajero"
             ("id","orden_id","mensajero_anterior_id","mensajero_nuevo_id","actor_usuario_id",
              "actor_rol","motivo","lote_id")
           VALUES ($1,$2,$3,$3,$4,'maestro'::"rol_value",$5,$6)`,
          randomUUID(),
          ordenId,
          mensajero,
          actor,
          "un traspaso a la misma persona no es un traspaso",
          randomUUID(),
        );
        return null;
      } catch (e) {
        return e as Error;
      }
    });

    expect(error).not.toBeNull();
    // Falla por EL CHECK, no por cualquier otra cosa: el nombre de la constraint esta en el mensaje.
    expect(String(error)).toContain("orden_traspaso_mensajero_distinto_check");
  });

  it("CONTROL de (b): con DOS mensajeros distintos la MISMA insercion pasa", async () => {
    // Anti-vacuidad obligatoria: sin esto, el `toContain` de arriba pasaria aunque la insercion
    // fallara por una FK mal sembrada o por una columna que falta.
    const ok = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const ordenId = await sembrarOrden(tx);
      const anterior = await sembrarUsuario(tx, ROL_MENSAJERO, "ant");
      const nuevo = await sembrarUsuario(tx, ROL_MENSAJERO, "nue");
      const actor = await sembrarUsuario(tx, ROL_MAESTRO, "act");
      await tx.$executeRawUnsafe(
        `INSERT INTO "orden_traspaso_mensajero"
           ("id","orden_id","mensajero_anterior_id","mensajero_nuevo_id","actor_usuario_id",
            "actor_rol","motivo","lote_id")
         VALUES ($1,$2,$3,$4,$5,'maestro'::"rol_value",$6,$7)`,
        randomUUID(),
        ordenId,
        anterior,
        nuevo,
        actor,
        "el traspaso valido, con su motivo de mas de diez caracteres",
        randomUUID(),
      );
      return tx.ordenTraspasoMensajero.count({ where: { ordenId } });
    });
    expect(ok).toBe(1);
  });

  it("⭑⭑ (c) las CUATRO FK son RESTRICT: borrar cualquiera de los tres usuarios FALLA", async () => {
    // Quien llevaba un paquete es EVIDENCIA y no se pierde al dar de baja a un usuario. Se prueban
    // los TRES extremos de usuario, uno por uno: una sola FK mal puesta a `SetNull` o `Cascade`
    // borraria la historia en silencio.
    for (const cual of ["anterior", "nuevo", "actor"] as const) {
      const error = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const ordenId = await sembrarOrden(tx);
        const anterior = await sembrarUsuario(tx, ROL_MENSAJERO, "ant");
        const nuevo = await sembrarUsuario(tx, ROL_MENSAJERO, "nue");
        const actor = await sembrarUsuario(tx, ROL_MAESTRO, "act");
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden_traspaso_mensajero"
             ("id","orden_id","mensajero_anterior_id","mensajero_nuevo_id","actor_usuario_id",
              "actor_rol","motivo","lote_id")
           VALUES ($1,$2,$3,$4,$5,'maestro'::"rol_value",$6,$7)`,
          randomUUID(),
          ordenId,
          anterior,
          nuevo,
          actor,
          "el traspaso cuyo rastro no se puede perder al dar de baja",
          randomUUID(),
        );
        const victima = cual === "anterior" ? anterior : cual === "nuevo" ? nuevo : actor;
        try {
          await tx.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, victima);
          return null;
        } catch (e) {
          return e as Error;
        }
      });

      expect(error, `borrar el usuario \`${cual}\` deberia fallar`).not.toBeNull();
      // Y por SU FK, no por otra: el nombre de la constraint esta en el mensaje.
      const fk =
        cual === "actor"
          ? "orden_traspaso_mensajero_actor_usuario_id_fkey"
          : `orden_traspaso_mensajero_mensajero_${cual}_id_fkey`;
      expect(String(error), `se esperaba ${fk}`).toContain(fk);
    }
  });

  it("⭑ (c) la cuarta FK: borrar la ORDEN con rastro tambien FALLA (RESTRICT)", async () => {
    const error = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const ordenId = await sembrarOrden(tx);
      const anterior = await sembrarUsuario(tx, ROL_MENSAJERO, "ant");
      const nuevo = await sembrarUsuario(tx, ROL_MENSAJERO, "nue");
      const actor = await sembrarUsuario(tx, ROL_MAESTRO, "act");
      await tx.$executeRawUnsafe(
        `INSERT INTO "orden_traspaso_mensajero"
           ("id","orden_id","mensajero_anterior_id","mensajero_nuevo_id","actor_usuario_id",
            "actor_rol","motivo","lote_id")
         VALUES ($1,$2,$3,$4,$5,'maestro'::"rol_value",$6,$7)`,
        randomUUID(),
        ordenId,
        anterior,
        nuevo,
        actor,
        "el rastro que impide el borrado fisico de la orden",
        randomUUID(),
      );
      try {
        await tx.$executeRawUnsafe(`DELETE FROM "orden" WHERE "id" = $1`, ordenId);
        return null;
      } catch (e) {
        return e as Error;
      }
    });

    expect(error).not.toBeNull();
    expect(String(error)).toContain("orden_traspaso_mensajero_orden_id_fkey");
  });

  it("CONTROL de (c): un usuario SIN rastro SI se puede borrar", async () => {
    // Anti-vacuidad: sin esto, los `not.toBeNull()` de arriba pasarian aunque `DELETE FROM usuario`
    // fallara siempre por cualquier otra dependencia.
    const error = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const suelto = await sembrarUsuario(tx, ROL_MENSAJERO, "suelto");
      try {
        await tx.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, suelto);
        return null;
      } catch (e) {
        return e as Error;
      }
    });
    expect(error).toBeNull();
  });

  it("⭑ el motivo admite 300 caracteres (el tope del borde) sin truncarse", async () => {
    const largo = "m".repeat(300);
    const guardado = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const ordenId = await sembrarOrden(tx);
      const anterior = await sembrarUsuario(tx, ROL_MENSAJERO, "ant");
      const nuevo = await sembrarUsuario(tx, ROL_MENSAJERO, "nue");
      const actor = await sembrarUsuario(tx, ROL_MAESTRO, "act");
      const fila = await tx.ordenTraspasoMensajero.create({
        data: {
          ordenId,
          mensajeroAnteriorId: anterior,
          mensajeroNuevoId: nuevo,
          actorUsuarioId: actor,
          actorRol: "maestro",
          motivo: largo,
          loteId: randomUUID(),
        },
        select: { motivo: true },
      });
      return fila.motivo;
    });
    expect(guardado).toHaveLength(300);
  });
});
