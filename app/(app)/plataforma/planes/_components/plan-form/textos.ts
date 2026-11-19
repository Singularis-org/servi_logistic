import { ROL_LABELS } from "@/lib/auth/rol-label";
import type { RolConTope, TipoCobro } from "@/lib/types/planes";

import { TEXTOS_PLAN } from "../plan-vista";

// SLT-130 (design §2): vive aparte de `PlanForm.tsx` porque los pasos lo necesitan y `PlanForm` importa
// los pasos; en `PlanForm.tsx` sería un import circular. `PlanForm` lo re-exporta.

/** Textos del formulario, en un solo sitio para cuando llegue la i18n. */
export const TEXTOS_PLAN_FORM = {
  nombre: "Nombre",
  visibilidad: "Visibilidad",
  publico: "Público",
  custom: "Custom",
  empresa: "Empresa",
  empresaPlaceholder: "Elige la empresa",
  sinEmpresas: "No se pudieron cargar las empresas.",
  topes: "Topes",
  topesAyuda: "Vacío = sin límite.",
  topeVacio: "Sin límite",
  rol: (rol: RolConTope) => TEXTOS_PLAN.rol(ROL_LABELS[rol]),
  apiKeys: "API keys activas",
  modulos: "Módulos incluidos",
  // SLT-66 (R9): el precio informativo de SL-24 se llama «costo base».
  precio: "Costo base",
  sinPrecio: "Sin precio",
  monto: "Con monto",
  mensual: "Costo base mensual",
  /** SLT-86 (R23; design §7.1): un descuento por período, en lugar del pago anual. */
  descuento: (tipo: TipoCobro) => `Descuento ${tipo}`,
  costoPorOrden: "Costo por orden",
  costoPorOrdenAyuda: "Vacío: se aplica el valor global de la plataforma.",
  /** SLT-83 (design §6.1; R20): el modo del costo por orden. */
  cobroPorOrden: "Cobro por orden",
  cobroFijo: "Fijo",
  cobroPorcentual: "Porcentual",
  porcentajePorOrden: "Porcentaje",
  sufijoPorcentaje: "%",
  minimoPorOrden: "Mínimo",
  /** SLT-118 (R35): la periodicidad de las facturas de órdenes del plan; las opciones, las del tipo de cobro. */
  periodicidadOrdenes: "Facturación de órdenes",
  /** SLT-135 (R14): la etiqueta del campo de fecha de «Cuándo rige» cuando no cambia el precio. */
  programado: "A partir de",
  fechaAyuda: "Rige desde las 00:00 de ese día, hora de la plataforma.",
  guardar: "Guardar",
  programar: "Programar cambio",
  crear: "Crear plan",
  /** Ajuste planes-custom (D4): solo si la empresa elegida todavía no tiene plan. */
  inicioCiclo: "Inicio del período",
  inicioCicloAyuda: "El período de la empresa empieza ese día, hora de la plataforma.",
  revisa: "Revisa los campos marcados.",
  /** Ajuste planes-custom (D13): el mismo texto que el modal de primera asignación (SLT-58 P11). */
  vistaPreviaNoCargo: "No se pudo comprobar el consumo de la empresa",
  /** Ajuste planes-custom (D17): el mismo texto que el modal de primera asignación (SLT-58 P11). */
  reintentar: "Reintentar",

  /** SLT-130 (R7): el título de cada paso; el de «Revisar» depende del modo. */
  pasos: {
    general: "General",
    precio: "Precio y descuentos",
    orden: "Cobro por orden",
    topes: "Topes",
    modulos: "Módulos",
    vigencia: "Cuándo rige",
    revisarCrear: "Revisar y crear",
    revisarEditar: "Revisar y programar",
  },
  /** SLT-130 (R9): la ayuda de la visibilidad deshabilitada al editar. */
  visibilidadFija: "No se cambia después de crear el plan.",
  /** SLT-130 (R12): la lista de descuentos vacía. */
  sinDescuentos: "Sin descuentos. Todas las empresas pagan el costo base completo.",
  /** SLT-130 (R16): el valor del plan guardado bajo un campo que cambia. */
  hoy: (valor: string) => `Hoy: ${valor}`,
  /** SLT-130 (R22, R23; design §6): las claves de «Revisar» que no son la etiqueta de un campo. */
  descuentos: "Descuentos",
  topeDeRol: (rol: RolConTope) => `Tope de ${ROL_LABELS[rol]}`,
  topeDeApiKeys: "Tope de API keys",
  ninguno: "Ninguno",
  sinCambios: "Sin cambios.",
  /** SLT-130 (R22, R23): el subtítulo de «Revisar»; `boton` es el texto vigente del botón final. */
  revisarAlCrear: (boton: string) => `Así queda el plan. No existe hasta que pulses «${boton}».`,
  revisarAlEditar: (boton: string) => `Esto es lo que cambia. Nada se aplica hasta que pulses «${boton}».`,
  /** SLT-130 (R28): por qué el botón final está bloqueado mientras se lee la vista previa del custom. */
  comprobandoConsumo: "Comprobando el consumo de la empresa…",
  irATopes: "Ir a Topes",
  /** SLT-130 (design §4): la navegación entre pasos. */
  anterior: "Anterior",
  siguiente: "Siguiente",
  /** SLT-130 (R10, R11; design §5): cada línea de la lista de descuentos y el botón para añadir otra. */
  periodoDelDescuento: "Período",
  valorDelDescuento: "Valor",
  tipoDelDescuento: "Tipo del descuento",
  descuentoFijo: "Fijo",
  descuentoPorciento: "%",
  quitarDescuento: (tipo: TipoCobro) => `Quitar descuento ${tipo}`,
  agregarDescuento: "Agregar descuento",

  // SLT-144 (design §9): el borrador del servidor. `pasoGuardado` y `marcaSinGuardar` viven en
  // `TEXTOS_FORMULARIO_POR_PASOS`, porque los pinta el componente compartido.
  guardarYContinuar: "Guardar y continuar",
  estadoBorrador: (n: number, m: number) => `Borrador · ${n} de ${m} pasos guardados`,
  sinGuardarAun: "Aún sin guardar",
  guardadoEl: (fecha: string) => `Borrador guardado el ${fecha}`,
  avisoBorrador: "Borrador: se guarda al continuar, pero no se aplica a ninguna empresa hasta el último paso.",
  faltanPasos: (titulos: string) => `Faltan pasos por guardar: ${titulos}.`,
  /** SLT-144 (R8): el enlace al primer paso que falta guardar. */
  irAPaso: (titulo: string) => `Ir a ${titulo}`,
  borradorDe: (quien: string, fecha: string) => `Borrador de ${quien}, guardado el ${fecha}`,
  descartarYEmpezar: "Descartar y empezar de nuevo",
  confirmarDescarte: "¿Descartar el borrador? Se borran todos sus pasos guardados. No se puede deshacer.",
  descartar: "Descartar",
  cancelar: "Cancelar",
  /** SLT-144 (R16): descartar falló; el mensaje se queda en el diálogo. */
  noSeDescarto: "No se pudo descartar el borrador. Inténtalo de nuevo.",
  borradorYaNoExiste: "Este borrador ya no existe: se confirmó o se descartó en otra pantalla.",
  borradorNuevo:
    "El borrador que tenías abierto ya se programó o se descartó en otra pantalla. Lo que acabas de guardar abrió un borrador nuevo.",
  pasosAjenos: "Otro superadmin guardó pasos de este borrador: se cargaron sus valores.",
  noSeGuardoElPaso: "No se pudo guardar el paso. Inténtalo de nuevo.",
  cargandoBorrador: "Cargando el borrador…",
  errorBorrador: "No se pudo leer el borrador.",
  /** SLT-144 (design §4.5): retomar una creación que ya no existe. */
  borradorNoExiste: "Este borrador ya no existe.",
  cerrar: "Cerrar",
  calculandoFechas: "Calculando la fecha de cada empresa…",
  errorFechas: "No se pudo calcular la fecha de cada empresa.",
  sinEmpresasDelPlan: (fecha: string) => `Este plan no tiene empresas: el cambio pasa al plan el ${fecha}.`,
  columnaEmpresa: "Empresa",
  columnaPeriodo: "Período",
  columnaRecibe: "Recibe el cambio el",
} as const;
