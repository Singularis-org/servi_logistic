import type { GestionResultado, TarifaActor, TarifaConcepto } from "@prisma/client";

import { money, monedaConfig } from "@/lib/config/moneda";
import { CATALOGO_CONCEPTOS, type EntradaCatalogo } from "@/lib/tarifas/catalogo";
import type { ConceptoEsencial } from "@/lib/tarifas/faltantes";
import type { Referencia } from "@/lib/tarifas/referencia-vigente";
import type { ModoTarifa, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

/**
 * SLT-54 — los textos y formatos de la pantalla de Tarifas, en un solo sitio para un i18n futuro. Los nombres
 * de nivel geografico no estan aqui: salen de `useEtiquetasGeograficas` (R61).
 */

type Catalogo = Readonly<Record<string, EntradaCatalogo>>;

/** El orden de la maqueta, que no es el del enum: lo que mas se digita va arriba. */
const ORDEN_RESULTADO: readonly GestionResultado[] = [
  "entregado",
  "devolucion_a_origen_por_rechazo",
  "reprogramado",
  "novedad",
  "incidente",
];

const NOMBRE_RESULTADO: Partial<Record<GestionResultado, string>> = {
  entregado: "entregado",
  devolucion_a_origen_por_rechazo: "devolución a origen",
  reprogramado: "reprogramado",
  novedad: "novedad",
  incidente: "incidente",
};

const NOMBRE_SIN_RESULTADO: Partial<Record<TarifaConcepto, string>> = {
  tienda_fulfillment: "Fulfillment",
  tienda_comision_cod: "Comisión COD",
};

function humanizar(texto: string): string {
  const limpio = texto.replace(/_/g, " ");
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * R33: las filas salen del catalogo. Un concepto nuevo aparece sin tocar la pantalla, con un nombre derivado
 * de su resultado, y por eso aqui no hay un `Record` obligatorio por concepto.
 */
export function conceptosDeActor(actor: TarifaActor, catalogo: Catalogo = CATALOGO_CONCEPTOS): TarifaConcepto[] {
  const posicion = (concepto: string): number => {
    const resultado = catalogo[concepto]?.resultado ?? null;
    if (resultado === null) return ORDEN_RESULTADO.length + 1;
    const indice = ORDEN_RESULTADO.indexOf(resultado);
    return indice === -1 ? ORDEN_RESULTADO.length : indice;
  };
  return Object.keys(catalogo)
    .filter((c) => catalogo[c]?.actor === actor)
    .sort((a, b) => posicion(a) - posicion(b)) as TarifaConcepto[];
}

export function etiquetaConcepto(concepto: TarifaConcepto, catalogo: Catalogo = CATALOGO_CONCEPTOS): string {
  const entrada = catalogo[concepto];
  const resultado = entrada?.resultado ?? null;
  if (resultado === null) return NOMBRE_SIN_RESULTADO[concepto] ?? humanizar(concepto);
  const nombre = NOMBRE_RESULTADO[resultado] ?? resultado.replace(/_/g, " ");
  return entrada?.actor === "tienda" ? `Flete por ${nombre}` : `Por ${nombre}`;
}

export const PESTANAS: readonly { actor: TarifaActor; nombre: string }[] = [
  { actor: "tienda", nombre: "Cobro a la tienda" },
  { actor: "mensajero", nombre: "Pago al mensajero" },
  { actor: "satelite", nombre: "Pago a la satélite" },
];

export function etiquetaModo(modo: ModoTarifa): string {
  return modo === "monto" ? `Monto ${monedaConfig.simbolo}` : "%";
}

/** La maqueta: la comision se pacta en %. Un `3,5` en monto cobraria 3,5 de moneda por orden sin que nadie lo note. */
export function modoPorDefecto(concepto: TarifaConcepto): ModoTarifa {
  return concepto === "tienda_comision_cod" ? "porcentaje" : "monto";
}

const OTRO_FALTANTE: Record<ConceptoEsencial, string> = {
  tienda_flete_entregado: "flete por entregado",
  tienda_flete_rechazo: "flete por devolución a origen",
  mensajero_entregado: "pago al mensajero por entregado",
};

export function nombreEsencial(concepto: ConceptoEsencial): string {
  return OTRO_FALTANTE[concepto];
}

/** «a, b y c», como lo escribe la maqueta. */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** `"3.50"` → `3,5`; `"13.00"` → `13`. Sobre el texto: un porcentaje de dinero no pasa por `number`. */
export function porcentajeParaVer(valor: string): string {
  const sinCeros = valor.includes(".") ? valor.replace(/\.?0+$/, "") : valor;
  return sinCeros.replace(".", monedaConfig.separadorDecimal);
}

function conIva(texto: string, ivaPct: string | null): string {
  return ivaPct === null ? texto : `${texto} + ${porcentajeParaVer(ivaPct)} % IVA`;
}

/** R22: un importe, un porcentaje, «Varía», «No cobra», «No paga» o «Sin tarifa». */
export function textoReferencia(referencia: Referencia): string {
  switch (referencia.tipo) {
    case "monto":
      return conIva(money(referencia.valor), referencia.ivaPct);
    case "porcentaje":
      return conIva(`${porcentajeParaVer(referencia.valor)} %`, referencia.ivaPct);
    case "varia":
      return `Varía: ${money(referencia.desde)} a ${money(referencia.hasta)}`;
    case "no_cobra":
      return "No cobra";
    case "no_paga":
      return "No paga";
    case "sin_tarifa":
      return "Sin tarifa";
  }
}

export function textoValorSinIva(valor: Pick<TarifaValorDTO, "modo" | "valor">): string {
  return valor.modo === "monto" ? money(valor.valor) : `${porcentajeParaVer(valor.valor)} %`;
}

export function textoValor(valor: Pick<TarifaValorDTO, "modo" | "valor" | "ivaPct">): string {
  return conIva(textoValorSinIva(valor), valor.ivaPct);
}

export function textoEstadoZona(estado: "completa" | "faltan" | "sin_empezar", faltantes: number): string {
  if (estado === "completa") return "Completa";
  return estado === "sin_empezar" ? "Sin empezar" : `Faltan ${faltantes}`;
}

/** `2026-11-12` → `12-11-2026`, el formato de la maqueta. */
export function fechaParaVer(diaIso: string): string {
  return diaIso.split("-").reverse().join("-");
}

export const TEXTOS = {
  titulo: "Tarifas",
  soloMaestro: "Solo el maestro puede editar",
  sinPermiso: "No tienes permiso para acceder a esta sección.",
  errorCarga: "No se pudieron cargar las tarifas. No significa que no tengas: vuelve a intentarlo.",
  reintentar: "Reintentar",

  bandaTitulo: "Borrador: aún rigen las tarifas actuales",
  bandaDetalle: "Lo que digites aquí se guarda y no cambia ningún cobro ni pago hasta que lo actives.",
  activar: "Activar tarifas nuevas",
  enVigorNota: "Cada cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.",
  enVigorDesde: (fecha: string) => `En vigor desde el ${fecha}`,
  zonasCompletas: (m: number, t: number) => `${m} de ${t} zonas completas`,

  sinZonasTitulo: "Aún no hay zonas",
  sinZonasDetalle: "Las tarifas se digitan por zona. Crea la primera y vuelve aquí para ponerle sus valores.",
  sinZonasAccion: "Ir a Zonas",

  zonas: "Zonas",
  bodegaPrincipal: "Bodega principal",
  sinGrupos: "Sin grupos",
  gruposDeZona: (n: number) => (n === 1 ? "1 grupo" : `${n} grupos`),
  /** R61: el nivel lo nombra el país; `singular` y `plural` salen de `useEtiquetasGeograficas`. */
  grupoUnicoDeZona: (nombre: string, distritos: number, singular: string, plural: string) =>
    `${nombre}: ${distritos} ${distritos === 1 ? singular : plural}`,

  editando: "Editando",
  viendo: "Viendo",
  nivelZona: "Toda la zona",
  nivelTienda: "Tienda con precio propio…",
  nivelGrupo: (nombre: string, conteo: string) => `Grupo: ${nombre} (${conteo})`,
  tienda: "Tienda",
  elegirTienda: "Elige la tienda",
  aplicaEn: "Aplica en",
  todasSusZonas: "Todas sus zonas",
  grupoDeZona: (nombre: string) => `Grupo ${nombre}`,

  colConcepto: "Concepto",
  colModo: "Modo",
  colValor: "Valor",
  colIva: "IVA",
  colHoy: "Hoy rige",
  hoy: (texto: string) => `Hoy rige: ${texto}`,
  modoDe: (concepto: string) => `Modo de ${concepto}`,
  valorDe: (concepto: string) => `Valor de ${concepto}`,
  ivaDe: (concepto: string) => `IVA de ${concepto}`,

  sinDefinir: "Sin definir",
  usaZona: "Usa la zona",
  usaGeneral: "Usa general",
  vacioZona: "Un campo vacío queda sin definir.",
  vacioGrupo: "Un campo vacío usa el valor de la zona.",
  vacioTienda: "Un campo vacío usa el valor general.",
  ceroCobra: "Un 0 escrito cobra 0.",
  ceroPaga: "Un 0 escrito paga 0.",
  notaMensajero: "Sin IVA. Por defecto vale para todos los vehículos; se puede fijar un valor por vehículo.",
  notaSatelite: "Sin IVA. Pagas a la satélite solo por los resultados que definas.",

  guardarBorrador: "Guardar borrador",
  guardarCambios: "Guardar cambios",
  guardadoBorrador: "Borrador guardado. No cambia ningún cobro ni pago hasta que actives.",
  guardadoEnVigor: "Guardado. El cambio aplica desde el siguiente cierre; los cierres ya hechos no cambian.",
  guardadoParcial: "Lo demás se guardó. Revisa las filas marcadas: conservan lo que digitaste.",
  guardadoNinguno: "No se pudo guardar. Revisa las filas marcadas: conservan lo que digitaste.",
  errorGuardar: "No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo.",
  ivaObligatorio: "Digita el IVA de este cobro. Si no lleva, escribe 0.",
  filaNoExiste: "Este valor ya no existe. Recarga la pantalla.",
  filaSinPermiso: "No tienes permiso para cambiar este valor.",
  filaError: "No se pudo guardar este concepto. Vuelve a intentarlo.",

  tiendaSoloCobro: "Una tienda solo tiene cobro: el pago al mensajero y a la satélite se define por zona o por grupo.",
  tiendaSinElegir: "Elige la tienda para digitar su precio.",
  tiendaSinCuentas: "No hay cuentas de tienda. Crea una en Usuarios y vuelve aquí para ponerle su precio.",

  errorZona: "No se pudieron cargar los valores de esta zona.",
  descartarTitulo: "Hay cambios sin guardar",
  descartarDetalle: "Si cambias de zona o de nivel, se pierde lo digitado aquí.",
  descartarSi: "Descartar y seguir",
  descartarNo: "Seguir editando",

  porVehiculo: "Pagar distinto por vehículo",
  porVehiculoNota: "Un vehículo sin valor propio usa el de «Todos los vehículos».",
  sinVehiculos: "No hay vehículos en el catálogo: se dan de alta en la plataforma.",
  todosLosVehiculos: "Todos los vehículos",
  inactivo: "Inactivo",
  celdaDe: (concepto: string, columna: string) => `${concepto}, ${columna}`,
  enPorcentaje: "En %",
  enMonto: (simbolo: string) => `En ${simbolo}`,
  apagarTitulo: "Dejar de pagar distinto por vehículo",
  apagarDetalle: (n: number) =>
    n === 1 ? "Se quitará 1 valor por vehículo guardado." : `Se quitarán ${n} valores por vehículo guardados.`,
  apagarSi: "Quitar y apagar",
  apagarNo: "Cancelar",

  dialogoEfecto:
    "Desde el siguiente cierre, los cobros y pagos usan lo que digitaste. Los cierres ya hechos no cambian. Esta acción no se puede deshacer desde la pantalla; después corriges editando cada valor.",
  faltaEnZonas: (n: number) => (n === 1 ? "Falta por definir en 1 zona" : `Falta por definir en ${n} zonas`),
  avisoFaltantes: "Lo que falta se cobra y se paga en 0. Sin flete por entregado, la API responde «sin tarifa» para esa zona.",
  usaValorZona: (grupo: string, lista: string) => `Grupo ${grupo}: usa el valor de la zona en ${lista}`,
  completar: "Completar",
  casilla: "Entiendo que lo que falta quedará en 0 en cobros y pagos.",
  seguirDigitando: "Seguir digitando",
  activarConFaltantes: "Activar con lo que falta",
  activadas: "Tarifas nuevas activadas. Rigen desde el siguiente cierre.",
  yaActivadas: "Las tarifas nuevas ya estaban activadas.",
  listaCambio: "Lo que falta cambió mientras decidías. Revisa la lista y confirma.",
  errorActivar: "No se pudo activar. Nada cambió: vuelve a intentarlo.",
  activarSinPermiso: "Solo el maestro puede activar las tarifas nuevas.",

  gruposNota: "Lo que no definas en el grupo usa el valor de la zona.",
  gruposUnicidad: (distrito: string) => `Un ${distrito} está en un solo grupo por zona.`,
  crearGrupo: "Crear grupo",
  renombrar: "Renombrar",
  renombrarGrupo: "Renombrar grupo",
  borrar: "Borrar",
  nombreGrupo: "Nombre del grupo",
  sinGruposTitulo: "Esta zona no tiene grupos",
  sinGruposDetalle: "Crea un grupo si algunos lugares de la zona tienen otro precio. Lo demás sigue con el valor de la zona.",
  usaElDeLaZona: "Usa el de la zona",
  valoresPropios: (n: number) => (n === 1 ? "1 valor propio" : `${n} valores propios`),
  pagoMensajero: "Pago al mensajero",
  pagoSatelite: "Pago a la satélite",
  guardarGrupo: "Guardar",
  cancelar: "Cancelar",
  enOtroGrupo: (grupo: string) => `En el grupo ${grupo}`,
  marcaEspecial: "Zona especial hoy",
  marcaEspecialNota:
    "«Zona especial hoy» es lo que rige ahora y es de solo lectura: aquí no cambia. Si quieres repetir ese conjunto, elígelo en un grupo; empezará a contar al activar.",
  borrarGrupoTitulo: (nombre: string) => `Borrar el grupo ${nombre}`,
  borrarGrupoDetalle: (n: number) =>
    n === 0
      ? "El grupo no tiene valores propios."
      : n === 1
        ? "Se borra 1 valor con él. Sus lugares pasan a usar el valor de la zona."
        : `Se borran ${n} valores con él. Sus lugares pasan a usar el valor de la zona.`,
  errorGrupo: "No se pudo guardar el grupo. Vuelve a intentarlo.",
  grupoGuardado: "Grupo guardado.",
  grupoBorrado: "Grupo borrado.",

  tiendasTitulo: "Tiendas con precio propio",
  tiendasNota: "Gana sobre el grupo y la zona. Lo que no pacte la tienda usa el valor general.",
  anadirPrecio: "Añadir precio de tienda",
  colTienda: "Tienda",
  colAplica: "Aplica en",
  colFleteEntregado: "Flete por entregado",
  colFleteDevolucion: "Flete por devolución",
  colAcciones: "Acciones",
  usaValorGeneral: "Usa el valor general",
  editar: "Editar",
  quitar: "Quitar",
  editarPrecioDe: (tienda: string) => `Editar precio de ${tienda}`,
  quitarPrecioDe: (tienda: string) => `Quitar precio de ${tienda}`,
  tiendaDesconocida: "Cuenta retirada",
  sinPreciosTitulo: "Ninguna tienda tiene precio propio",
  sinPreciosDetalle: "Todas usan el valor de su zona. Añade un precio si pactaste otro con alguna.",
  quitarPrecioTitulo: (tienda: string, aplica: string) => `Quitar el precio de ${tienda} en ${aplica}`,
  quitarPrecioDetalle: (n: number) =>
    n === 1 ? "Se quita 1 valor. La tienda pasa a usar el valor general." : `Se quitan ${n} valores. La tienda pasa a usar el valor general.`,
  precioQuitado: "Precio de tienda quitado.",

  mensajerosTitulo: "Mensajeros con valor propio",
  mensajerosNota: "Gana sobre el grupo y la zona, en cualquier zona donde trabaje. Lo que no digites usa el valor de la zona.",
  mensajerosBase: "En % se calcula sobre el flete sin IVA que se le cobra a la tienda por esa gestión.",
  mensajerosSinActivar: "Lo que digites aquí no cambia ningún pago hasta que actives las tarifas nuevas.",
  mensajerosEnVigor: "Un cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.",
  anadirMensajero: "Añadir mensajero",
  colMensajero: "Mensajero",
  mensajerosVacioTitulo: "Ningún mensajero tiene valor propio",
  mensajerosVacioDetalle: "Todos usan el valor de su zona. Añade un mensajero si pactaste otro pago con él.",
  editarMensajeroDe: (nombre: string) => `Editar valor propio de ${nombre}`,
  quitarMensajeroDe: (nombre: string) => `Quitar valor propio de ${nombre}`,
  quitarMensajeroTitulo: (nombre: string) => `Quitar el valor propio de ${nombre}`,
  quitarMensajeroDetalle: (n: number) =>
    n === 1
      ? "Se quita 1 valor. El mensajero pasa a usar el valor de la zona."
      : `Se quitan ${n} valores. El mensajero pasa a usar el valor de la zona.`,
  mensajeroQuitado: "Valor propio quitado.",
  quitadoParcial: "Se quitó parte de los valores. Los que quedan no se pudieron quitar: vuelve a intentarlo.",
  errorQuitar: "No se pudo quitar el valor propio. Vuelve a intentarlo.",

  topeTitulo: "Intentos de entrega",
  topeAyuda: "Cuántos intentos se hacen antes de pasar una orden a rechazo. Rige al guardar, para todas las órdenes sin terminar.",
  topeAvisoAlBajar:
    "Guardar no rechaza ni cobra nada. Pero las novedades que ya alcancen este número se rechazan solas, sin más clics, unas en la siguiente corrida automática y otras al vencer su plazo, y ese rechazo genera cobro. Las órdenes en bodega que ya lo alcancen no se podrán asignar.",
  topeSoloLectura: "Lo cambia el maestro.",
  topeGuardar: "Guardar",
  topeGuardado: "Intentos de entrega guardados.",

  anadirMensajeroTitulo: "Añadir mensajero con valor propio",
  editarMensajeroTitulo: (nombre: string) => `Valor propio de ${nombre}`,
  elegirMensajero: "Elige el mensajero",
  sinMensajeros: "No hay mensajeros para añadir. Todos los activos ya tienen valor propio, o aún no hay ninguno: se crean en Usuarios.",
  mensajeroInactivoNota: "Este mensajero está inactivo: puedes cambiar o quitar sus valores, pero no añadir otros.",
  sinIva: "Sin IVA.",
  cerrar: "Cerrar",
} as const;
