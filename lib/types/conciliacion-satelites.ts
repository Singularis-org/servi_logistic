import { z } from "zod";

import { cierreBodegaConfig } from "@/lib/config/cierre-bodega";
import { montoPositivoSchema } from "@/lib/types/wallet";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 — LA CONCILIACION DE LAS CONSOLIDACIONES DE BODEGA: DTOs Y BORDE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// MODULO PURO: no importa Prisma en runtime, ni React, ni `lib/services`. Lo consumen el borde
// (zod), el servicio, el repositorio y —cuando llegue— la pantalla.
//
// MONEY-SAFE, Y SIN EXCEPCIONES: todo importe cruza como STRING de escala 2 en las DOS
// direcciones. Ningun `number` de dinero, ningun `Prisma.Decimal` fuera del repositorio, y ninguna
// resta en la pantalla (R20): `saldoSinConciliar` y `faltaPorRecibir` llegan YA CUADRADOS.
//
// ⚠️ EL SALDO MIDE EFECTIVO, NO `total_general`. Es la decision del humano sobre Q2 (2026-09-16) y
// va CONTRA el diseño original, asi que se escribe donde vive el contrato. Medido en produccion el
// 2026-09-15 sobre las 32 consolidaciones existentes:
//
//     total_general        ₡ 4.196.897   100 %
//     total_efectivo       ₡ 3.091.107    73,7 %   <- lo que VIAJA en el bulto
//     total_simpe          ₡ 1.105.790    26,3 %   <- entra directo a una cuenta
//     total_transferencia  ₡         0     0 %
//
// Una cuarta parte del consolidado NO viaja en el bulto: el SINPE llega a una cuenta. Con el saldo
// derivado de `total_general`, la pantalla ensenaria ₡1,1 M de deuda fantasma que nadie va a
// entregar en mano jamas. `total_general` se sigue mostrando como CONTEXTO —es lo que la bodega
// recaudo— pero no es lo que esta pendiente de llegar.
//
// ⚠️ LIMITE DECLARADO, y NO lo resuelve esta ficha: cuando la 429 se despliegue y cada bodega ponga
// su propio SINPE, el SINPE que recaude una satelite dejara de llegar a la central —entrara a la
// cuenta de la bodega—. Eso crea un pendiente nuevo que este diseño no cubre, porque ni viaja en el
// bulto ni esta en `total_efectivo`. Si el negocio lo quiere conciliar tambien, es otra ficha.

/**
 * Una bodega satelite en la tabla de saldos (R17/R21/R23).
 *
 * `diasDeLaMasAntigua` es `null` cuando no queda ninguna consolidacion sin conciliar: `null` es
 * «no hay cola», que NO es lo mismo que `0` («la mas vieja es de hoy»). Confundirlos ensenaria
 * «0 dias» en una bodega que no debe nada.
 */
export interface SaldoSateliteDTO {
  zonaId: string;
  zonaNombre: string;
  /**
   * SLT-73 (R5) — LA DEUDA de la satelite: Σ `paraLaCentral` de sus `cierre_dia` aprobados con
   * destino satelite (consolidados o no) − Σ `monto_recibido` de sus consolidaciones no rechazadas.
   * Puede ser negativa (la central le debe). Hasta SLT-73 era Σ(`total_efectivo` − recibido).
   */
  saldoSinConciliar: string;
  /**
   * SLT-73 (R6) — la parte de la deuda que sale de cierres aprobados SIN consolidar: Σ
   * `paraLaCentral` de los `cierre_dia` con `cierre_bodega_id IS NULL`. Con su signo.
   */
  aporteSinConsolidar: string;
  /**
   * SLT-73 (R6) — cuantos `cierre_dia` aprobados sin consolidar tiene la zona. Mayor que cero con
   * `aporteSinConsolidar` distinto de cero = la bodega NO esta al dia, aunque la deuda total sea 0.
   */
  cierresSinConsolidar: number;
  /** Σ `total_efectivo` de las consolidaciones no rechazadas: CONTEXTO, ya no la base del saldo. */
  totalEfectivo: string;
  /** Σ `total_general`: CONTEXTO (lo que la bodega recaudo), NO lo pendiente. Ver la cabecera. */
  totalConsolidado: string;
  /** Σ `monto_recibido` (los NULL no suman, que es justo lo que la formula quiere). */
  totalRecibido: string;
  /** R21 — cuantas consolidaciones siguen sin conciliar. */
  consolidacionesSinConciliar: number;
  /** R21 — dias naturales (calendario CR) de la mas antigua sin conciliar. `null` si no hay. */
  diasDeLaMasAntigua: number | null;
  /** ISO del `solicitado_at` de esa mas antigua. `null` si no hay ninguna pendiente. */
  fechaDeLaMasAntigua: string | null;
  /**
   * ⭑ La ULTIMA consolidacion de esta bodega que se marco como recibida. `null` = a esta bodega
   * no se le ha marcado ninguna nunca.
   *
   * ⚠️ NO ES `totalRecibido`, Y LA DIFERENCIA IMPORTA. `totalRecibido` es la SUMA historica de
   * todo lo que esta bodega ha entregado; esto es UNA fila: la ultima vez que llego un bulto,
   * con lo que traia. La columna de la pantalla se llama «Ultima recibida» y pintar ahi el
   * acumulado seria poner un numero de seis cifras bajo un rotulo que promete otro — el defecto
   * exacto que la ficha 359 encontro repetido en 13 pantallas.
   *
   * Es CONTEXTO, no deuda: dice que esta bodega SI entrega, y cuando fue la ultima vez. Una que
   * lleva dos meses sin una fila aqui es una conversacion distinta de una que entrego ayer.
   */
  ultimaRecibida: UltimaRecibidaDTO | null;
}

/**
 * ⭑ FICHA 431 — la ULTIMA consolidacion recibida de una bodega, ya cuadrada por el servidor.
 *
 * Los tres importes son STRING de escala 2 y `faltaPorRecibir` llega DERIVADO (R20): la pantalla
 * no resta para saber si esa ultima llego incompleta, lo pregunta sobre el string que ya le dan.
 */
export interface UltimaRecibidaDTO {
  /** ISO de `conciliado_at`: CUANDO se marco que llego, no cuando se consolido. */
  fecha: string;
  /** `monto_recibido` de ESA consolidacion: lo que se conto al recibir el bulto. */
  monto: string;
  /**
   * Lo ESPERADO de ESA consolidacion: `paraLaCentral` de su snapshot (SLT-73, R8). Hasta SLT-73
   * era su `total_efectivo`; el nombre del campo se conserva.
   */
  declarado: string;
  /**
   * R17/R18/R20 — `declarado` − `monto` de ESA fila, derivado en el servidor con la MISMA
   * `saldoDe` que el saldo de la bodega. Distinto de cero = esa ultima llego incompleta y la
   * pantalla lo dice («₡ 485.000 de ₡ 500.000»). Puede ser NEGATIVO (llego de mas).
   */
  faltaPorRecibir: string;
}

/**
 * ⭑ FICHA 431 (pasada de frontend) — LAS TRES CIFRAS DE CABECERA de `/wallet/satelites`.
 *
 * ⚠️ POR QUE EXISTE ESTE DTO, y no se suman las filas en la pantalla: R20 prohibe que el
 * navegador haga aritmetica de dinero, y las tres tarjetas son SUMAS sobre el conjunto entero de
 * bodegas. Sumar cinco `saldoSinConciliar` en el cliente seria exactamente la operacion que la
 * ficha 359 encontro rota en 13 pantallas. Las tres llegan YA CUADRADAS, como todo lo demas.
 *
 * Cada tarjeta lleva su CONTEO al lado a proposito: un importe sin cuantas filas lo componen no
 * se puede perseguir, y perseguir efectivo es para lo que existe esta pantalla.
 */
export interface ResumenSatelitesDTO {
  /**
   * Tarjeta 1 — «Pendiente de conciliar»: Σ de `saldoSinConciliar` de TODAS las bodegas satelite.
   * Es la misma formula (SLT-73 R5/R7: la deuda) aplicada al conjunto, asi que la suma de la columna
   * «Pendiente» de la tabla ES esta cifra. Puede ser NEGATIVA si llego mas de lo declarado.
   */
  pendienteTotal: string;
  /** Cuantas consolidaciones siguen SIN marcar (`conciliado_at IS NULL`). */
  consolidacionesSinConciliar: number;
  /** En cuantas bodegas distintas la deuda (SLT-73 R5) es distinta de cero. */
  bodegasConPendiente: number;
  /**
   * Tarjeta 2 — «Recibido este mes»: Σ `monto_recibido` de lo marcado DENTRO del mes en curso
   * del calendario de COSTA RICA, no del mes UTC ni del del navegador.
   *
   * ⚠️ Se corta por `conciliado_at` —cuando se marco— y NO por `solicitado_at`: la pregunta que
   * responde es «cuanto efectivo entro a la central este mes», y una consolidacion de agosto que
   * llego en septiembre entro en septiembre.
   */
  recibidoEsteMes: string;
  /** Cuantas consolidaciones se marcaron este mes. */
  consolidacionesRecibidasEsteMes: number;
  /**
   * Tarjeta 3 — «Con diferencia»: Σ de lo que FALTA en las consolidaciones YA marcadas por menos
   * de lo declarado (R18). Solo cuenta el faltante POSITIVO: una que llego de mas no compensa a
   * otra que llego de menos, porque son dos bultos distintos y dos conversaciones distintas.
   */
  diferenciaTotal: string;
  /** Cuantas consolidaciones llegaron incompletas. */
  consolidacionesConDiferencia: number;
}

/**
 * Una consolidacion en el desglose de su bodega (R22/R24).
 *
 * `conciliado` es `conciliadoAt !== null` ya derivado: la pantalla NO decide el estado comparando
 * campos. El vocabulario aprobado lo pone la capa de presentacion (R28): sin conciliar →
 * «Pendiente de conciliar»; conciliada y sin diferencia → «Recibido»; conciliada con
 * `faltaPorRecibir` distinto de cero → «Recibido incompleto».
 */
export interface ConsolidacionSateliteDTO {
  cierreBodegaId: string;
  /** ISO. Es la fecha por la que se mide la antiguedad de R21. */
  solicitadoAt: string;
  /** R22 — la composicion del total, para que se vea que parte viaja en el bulto. */
  totales: {
    efectivo: string;
    simpe: string;
    transferencia: string;
    general: string;
  };
  /** SLT-73 (R9) — `total_pago_mensajero`: lo que la satelite paga a sus mensajeros. */
  pagoMensajero: string;
  /** SLT-73 (R9) — `total_ingreso_bodega_rechazos`: lo que gana la satelite por rechazos (D7). */
  gananciaSatelite: string;
  /** SLT-73 (R8/R9) — `general − pagoMensajero − gananciaSatelite`: el neto que debe. */
  paraLaCentral: string;
  /** `null` = sin conciliar. NUNCA `"0.00"` por ausencia: cero recibido es otra cosa. */
  montoRecibido: string | null;
  /**
   * SLT-73 (R8) — `paraLaCentral` − COALESCE(`monto_recibido`, 0), DERIVADO EN EL SERVIDOR con la
   * misma `saldoDe` que `/cierres-admin`. Hasta SLT-73 era sobre `total_efectivo` (D3 lo reabrio).
   *
   * No suma `saldoSinConciliar`: la deuda de la bodega incluye ademas los cierres sin consolidar
   * (`aporteSinConsolidar`).
   *
   * Puede ser NEGATIVO (llego de mas). No se recorta a cero: mismo criterio con el que la ficha 393
   * decidio ensenar «Para la central» en negativo en vez de maquillarlo.
   */
  faltaPorRecibir: string;
  /** Derivado de `conciliadoAt !== null`. */
  conciliado: boolean;
  /**
   * SLT-76 (R3/R4) — ¿se ofrece «Desmarcar»? `conciliado && !consolidacionesConDinero.has(id)`,
   * DERIVADO EN EL SERVIDOR con el MISMO predicado con el que `revertirConciliacion` responde
   * `con_asientos` (asientos `cierre_dia` de sus cierres o un ajuste de diferencia). REQUERIDO: una
   * superficie que no lo lea no compila. `false` en toda consolidacion sin conciliar.
   */
  desmarcable: boolean;
  conciliadoAt: string | null;
  conciliadoPorNombre: string | null;
  /** Texto libre corto. No baja a las descargas ni entra al historial (R5 de la 362). */
  nota: string | null;
  /** Cuantos `cierre_dia` componen esta consolidacion. */
  cantidadCierres: number;
  /**
   * D40 — ¿alguno de esos `cierre_dia` tiene una gestion congelada con el modelo nuevo? Sale de
   * `cierre_detail.tarifa_modelo`, no del interruptor actual. Opcional en el tipo; ausente se lee como viejo.
   */
  incluyeModeloNuevo?: boolean;
}

// ── Schemas zod de borde ──

/**
 * R23 — la tabla de saldos. Sin filtros: el conjunto es «todas las bodegas satelite» y en
 * produccion son CINCO. `.strict()` mata cualquier clave colada.
 */
export const listarSaldosSatelitesSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce
      .number()
      .int()
      .positive()
      .default(cierreBodegaConfig.DEFAULT_PAGE_SIZE)
      .transform((n) => Math.min(n, cierreBodegaConfig.MAX_PAGE_SIZE)),
  })
  .strict();

export type ListarSaldosSatelitesInput = z.infer<typeof listarSaldosSatelitesSchema>;

/**
 * R29 — el mismo conjunto SIN paginar, para la descarga. DERIVADO del de su pagina quitando
 * `page`/`pageSize`, no reescrito: dos declaraciones del mismo alcance divergen a la primera
 * correccion.
 */
export const listarSaldosSatelitesCompletoSchema = listarSaldosSatelitesSchema
  .omit({ page: true, pageSize: true })
  .strict();

export type ListarSaldosSatelitesCompletoInput = z.infer<
  typeof listarSaldosSatelitesCompletoSchema
>;

/** R24 — el desglose de UNA bodega. `zonaId` es obligatorio: sin el no hay desglose que pedir. */
export const listarConsolidacionesSateliteSchema = z
  .object({
    zonaId: z.string().uuid(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce
      .number()
      .int()
      .positive()
      .default(cierreBodegaConfig.DEFAULT_PAGE_SIZE)
      .transform((n) => Math.min(n, cierreBodegaConfig.MAX_PAGE_SIZE)),
    /** Recorta a la cola de lo pendiente. Ausente = las dos poblaciones. */
    soloSinConciliar: z.coerce.boolean().optional(),
  })
  .strict();

export type ListarConsolidacionesSateliteInput = z.infer<
  typeof listarConsolidacionesSateliteSchema
>;

export const listarConsolidacionesSateliteCompletoSchema = listarConsolidacionesSateliteSchema
  .omit({ page: true, pageSize: true })
  .strict();

export type ListarConsolidacionesSateliteCompletoInput = z.infer<
  typeof listarConsolidacionesSateliteCompletoSchema
>;

/**
 * SLT-96 — el 0 EXACTO, con hasta 2 decimales ("0", "0.0", "0.00"). Sin signo: "-0" no es un monto.
 * Vive aparte de `montoPositivoSchema` porque esa pieza la comparten la wallet y los pagos de gestion,
 * que siguen rechazando el 0 a proposito.
 */
const montoCeroSchema = z.string().trim().regex(/^0+(.0{1,2})?$/);

/** SLT-96 — el aviso del borde cuando el monto de marcar/corregir no tiene forma de monto >= 0. */
export const MENSAJE_MONTO_RECIBIDO_FORMA = "El monto debe ser 0 o mayor, con hasta 2 decimales.";

/**
 * SLT-96 — el texto del desenlace `monto_cero_no_permitido`: se quiso registrar 0 en una consolidacion
 * cuyo declarado NO es 0. Lo decide el repositorio leyendo el snapshot; vive aqui, en el modulo puro,
 * para que el servicio lo devuelva y la pantalla lo pinte desde el MISMO sitio. Sin simbolo de moneda.
 */
export const MENSAJE_MONTO_CERO_CON_DECLARADO =
  "Solo se puede registrar 0 cuando lo declarado es 0.";

/**
 * SLT-96 — el monto de marcar y corregir: mayor que 0 (la pieza compartida, intacta) o el 0 exacto.
 * El borde NO conoce lo declarado, asi que el 0 pasa la forma y el repositorio decide si vale, dentro
 * de la transaccion de la escritura.
 */
const montoRecibidoSchema = z.union([montoPositivoSchema, montoCeroSchema], {
  error: MENSAJE_MONTO_RECIBIDO_FORMA,
});

/**
 * R9/R10 — MARCAR RECIBIDA (y CORREGIR, que comparte el schema).
 *
 * La 431 rechazaba el 0 («marcar recibi ₡0 no es una marca»). SLT-96 (Carlos, 2026-11-09) lo admite
 * SOLO cuando lo declarado de la consolidacion es 0: una satelite que no tenia nada que entregar
 * tiene que poder cerrarse. Esa condicion depende de la base, no de la entrada, asi que aqui solo se
 * admite la forma y `montoPositivoSchema` no se toca.
 *
 * `.strict()` es parte del contrato (R5): la peticion no puede aportar lo declarado.
 * La `nota` es opcional y se recorta: cero caracteres no es una nota, es ausencia.
 */
export const marcarConsolidacionRecibidaSchema = z
  .object({
    cierreBodegaId: z.string().uuid(),
    montoRecibido: montoRecibidoSchema, // STRING, >= 0, <= 2 decimales; el 0 lo filtra el repositorio
    nota: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type MarcarConsolidacionRecibidaInput = z.infer<typeof marcarConsolidacionRecibidaSchema>;

/** R12 — REVERTIR. No lleva monto: el que hubiera se BORRA (y queda en el historial). */
export const revertirConciliacionSchema = z
  .object({
    cierreBodegaId: z.string().uuid(),
  })
  .strict();

export type RevertirConciliacionInputBorde = z.infer<typeof revertirConciliacionSchema>;

/**
 * SLT-73 (R14, D11) — el texto del desenlace `con_asientos` de «Revertir»: la marca ya asento el
 * dinero de la consolidacion en los libros y la reversion se rechaza sin tocar nada. Vive aqui, en el
 * modulo puro, para que la accion lo devuelva y la pantalla lo pinte desde el MISMO sitio.
 */
export const MENSAJE_REVERTIR_CON_ASIENTOS =
  "Ya entró a la caja: corrige el monto en vez de revertir";
