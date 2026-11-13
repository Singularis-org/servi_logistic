// SLT-125 (T1.2; design §7) — LA ENTRADA DE LA REFERENCIA DE LAS DESCARGAS DE COSTA RICA.
//
// Un conjunto de DTO de Costa Rica que cubre las 7 descargas que nombran lugares: órdenes, satélite,
// novedades, ayuda, cierre de día (sus 5 secciones), cierres admin (hoja fundida) y cobertura.
//
// `scripts/capturar-referencia-descargas.ts` lo pasó por el código de ANTES de SLT-125 y guardó el
// resultado en `referencia.json`. `equivalencia-descargas-cr.test.ts` pasará este mismo conjunto, ya
// con `lugarRuta`, por el código nuevo y exigirá el mismo CSV byte a byte y las mismas celdas del XLSX.
// Por eso este archivo no puede cambiar de valores sin regenerar la referencia, y la referencia no se
// regenera nunca: si hay que tocarlo, se para y se pregunta.
//
// Cada caso declara su `lugar` (los tres pasos con su id). Los DTO de hoy no llevan `lugarRuta` (no
// existe en sus tipos); el test de equivalencia lo arma desde `lugar`, sin inventar otro nombre.
//
// Variantes: con y sin distrito, nombres con tilde, zona vacía, una dirección con coma y comillas
// (el escape del CSV) y cierres con y sin `ubicacion_snapshot`. Los datos personales son inventados.
//
// NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge. Puro: sin base ni red.

import type { CierreDetalleGestion, CierreResultado, IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreGestionDescargaDTO } from "@/lib/interfaces/services/ICierresAdminService";
import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import type { CoberturaDistritoDTO } from "@/lib/types/cobertura";
import type { PasoDeRuta } from "@/lib/types/geografia-nodo";
import type { NovedadDTO } from "@/lib/types/novedad";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import { etiquetasDePais, type EtiquetasGeograficas } from "@/lib/types/pais";

/** Las de la fila `CR` de `db/migrations/20261026130000_pais/migration.sql`. */
export const ETIQUETAS_CR_DESCARGAS: EtiquetasGeograficas = etiquetasDePais({
  nivel1Singular: "Provincia",
  nivel1Plural: "Provincias",
  nivel2Singular: "Cantón",
  nivel2Plural: "Cantones",
  nivel3Singular: "Distrito",
  nivel3Plural: "Distritos",
});

/** El lugar de un caso: los tres niveles de Costa Rica, con el distrito opcional como en `orden`. */
export interface LugarCR {
  provincia: PasoDeRuta;
  canton: PasoDeRuta;
  distrito: PasoDeRuta | null;
}

/** Del nivel 1 al lugar: la `lugarRuta` que el test de equivalencia añadirá a cada DTO. */
export function rutaDeLugar(lugar: LugarCR): PasoDeRuta[] {
  return lugar.distrito === null ? [lugar.provincia, lugar.canton] : [lugar.provincia, lugar.canton, lugar.distrito];
}

export interface CasoCR {
  clave: string;
  lugar: LugarCR;
  /** `""` es la zona vacía. */
  zona: string;
  numGuia: number | null;
  numRemision: string;
  destinatario: string;
  telefono: string;
  direccion: string | null;
  producto: string;
  tienda: string;
}

const paso = (id: string, nombre: string): PasoDeRuta => ({ id, nombre });

export const CASOS_CR: readonly CasoCR[] = [
  {
    clave: "carmen",
    lugar: { provincia: paso("cr-1", "San José"), canton: paso("cr-101", "San José"), distrito: paso("cr-10101", "Carmen") },
    zona: "Zona Central",
    numGuia: 125001,
    numRemision: "REM-125-001",
    destinatario: "Destinatario Uno",
    telefono: "70000001",
    direccion: "Avenida 2, calle 5",
    producto: "Caja pequeña",
    tienda: "Tienda Prueba",
  },
  {
    clave: "tildes",
    lugar: {
      provincia: paso("cr-1", "San José"),
      canton: paso("cr-119", "Pérez Zeledón"),
      distrito: paso("cr-11901", "San Isidro de El General"),
    },
    zona: "Zona Sur",
    numGuia: 125002,
    numRemision: "REM-125-002",
    destinatario: "Destinatario Dos",
    telefono: "70000002",
    direccion: "Del parque 100 m sur, casa \"verde\"",
    producto: "Paquete; frágil",
    tienda: "Tienda Prueba",
  },
  {
    clave: "sin-distrito",
    lugar: { provincia: paso("cr-7", "Limón"), canton: paso("cr-702", "Pococí"), distrito: null },
    zona: "Zona Atlántico",
    numGuia: null,
    numRemision: "REM-125-003",
    destinatario: "Destinatario Tres",
    telefono: "70000003",
    direccion: null,
    producto: "Sobre",
    tienda: "Tienda Prueba",
  },
  {
    clave: "zona-vacia",
    lugar: { provincia: paso("cr-2", "Alajuela"), canton: paso("cr-202", "San Ramón"), distrito: paso("cr-20211", "Ángeles") },
    zona: "",
    numGuia: 125004,
    numRemision: "REM-125-004",
    destinatario: "Destinatario Cuatro",
    telefono: "70000004",
    direccion: "Frente a la escuela",
    producto: "Caja mediana",
    tienda: "Tienda Ñandú",
  },
  {
    clave: "sin-distrito-zona-vacia",
    lugar: { provincia: paso("cr-4", "Heredia"), canton: paso("cr-403", "Santo Domingo"), distrito: null },
    zona: "",
    numGuia: 125005,
    numRemision: "REM-125-005",
    destinatario: "Destinatario Cinco",
    telefono: "70000005",
    direccion: "Barrio Socorro, 50 m oeste",
    producto: "Caja grande",
    tienda: "Tienda Ñandú",
  },
];

const CREADA = new Date("2026-11-10T20:30:00.000Z");

// ─── Órdenes (`/ordenes`) ────────────────────────────────────────────────────────────────────

function ordenDe(c: CasoCR, i: number): OrdenListItemDTO {
  const { provincia, canton, distrito } = c.lugar;
  return {
    id: `orden-${c.clave}`,
    numGuia: c.numGuia,
    numRemision: c.numRemision,
    estatusId: "estatus-1",
    estatusValue: "en_preparacion",
    destinatario: c.destinatario,
    telefonoDest: c.telefono,
    tiendaId: "tienda-1",
    tiendaNombre: c.tienda,
    zonaId: `zona-${i}`,
    // Zona vacía: sin relación resuelta (abajo) y con el nombre en `""`.
    zonaNombre: c.zona,
    provinciaId: provincia.id,
    cantonId: canton.id,
    distritoId: distrito?.id ?? null,
    producto: c.producto,
    peso: i % 2 === 0 ? 1.5 : null,
    notas: i === 1 ? "Llamar antes, por favor" : null,
    direccion: c.direccion,
    montoCobrar: 15000 + i * 1000,
    fleteConIva: "2260.00",
    comisionConIva: "0.00",
    intentosEntrega: i,
    createdAt: CREADA,
    updatedAt: CREADA,
    fechaRepartoISO: i === 0 ? "2026-11-11" : null,
    fechaReprogramacion: i === 2 ? "2026-11-12" : null,
    relaciones: {
      estatus: { id: "estatus-1", value: "en_preparacion" },
      tienda: { id: "tienda-1", nombre: c.tienda, tarifa: null },
      zona: c.zona === "" ? null : { id: `zona-${i}`, nombre: c.zona, esCentral: i === 0 },
      provincia: { id: provincia.id, nombre: provincia.nombre },
      canton: { id: canton.id, nombre: canton.nombre },
      distrito: distrito === null ? null : { id: distrito.id, nombre: distrito.nombre },
      mensajeroAsignado: i === 0 ? { id: "mensajero-1", nombre: "Mensajero Uno" } : null,
    },
  };
}

export const ORDENES_CR: readonly OrdenListItemDTO[] = CASOS_CR.map(ordenDe);

// ─── Bodega satélite ──────────────────────────────────────────────────────────────────────────

export const SATELITE_CR: readonly RecepcionSateliteDTO[] = CASOS_CR.map((c, i) => {
  const orden = ordenDe(c, i);
  return {
    ...orden,
    estatusValue: "en_bodega_satelite",
    direccion: c.direccion,
    montoCobrar: orden.montoCobrar ?? null,
    zonaNombre: c.zona,
    provinciaNombre: c.lugar.provincia.nombre,
    cantonNombre: c.lugar.canton.nombre,
    distritoNombre: c.lugar.distrito?.nombre ?? null,
    prioridad: i === 3,
    fechaRepartoISO: null,
  };
});

// ─── Novedades y ayuda (`/novedades`) ─────────────────────────────────────────────────────────

export const NOVEDADES_CR: readonly NovedadDTO[] = CASOS_CR.map((c, i) => ({
  id: `orden-${c.clave}`,
  numGuia: c.numGuia,
  numRemision: c.numRemision,
  estatusValue: "novedad",
  destinatario: c.destinatario,
  telefonoDest: c.telefono,
  direccion: c.direccion,
  producto: c.producto,
  peso: null,
  montoCobrar: i === 2 ? null : 9000 + i * 500,
  latitud: null,
  longitud: null,
  notas: null,
  tiendaNombre: c.tienda,
  zonaNombre: c.zona,
  provinciaNombre: c.lugar.provincia.nombre,
  cantonNombre: c.lugar.canton.nombre,
  distritoNombre: c.lugar.distrito?.nombre ?? null,
  sinpeNumero: "",
  sinpeNombre: "",
  secuenciaRuta: null,
  intentosEntrega: i,
  causa: i === 0 ? "not_found" : i === 1 ? "wrong_address" : null,
  intentosContacto: i % 3,
  mensajeroNombre: i === 4 ? null : "Mensajero Uno",
}));

// ─── Cierre de día (mensajero, en vivo) ──────────────────────────────────────────────────────

const RESULTADOS: readonly CierreResultado[] = [
  "entregado",
  "reprogramado",
  "novedad",
  "devolucion_a_origen_por_rechazo",
  "incidente",
];

/** Un ingreso del modelo viejo, con su `fleteConIva` en texto como lo manda el servidor. */
const INGRESO: IngresoEmpresaDTO = {
  montoCobrar: "15000.00",
  cobraComision: false,
  esCentral: true,
  esZonaEspecial: false,
  fleteOrigen: "normal",
  fleteDevolucionOrigen: "normal",
  flete: "2000.00",
  ivaFlete: "260.00",
  fleteDevolucion: null,
  ivaFleteDevolucion: null,
  comisionCod: null,
  ivaComisionCod: null,
  fleteConIva: "2260.00",
  fleteDevolucionConIva: null,
  comisionConIva: null,
  total: "2260.00",
  fulfillment: "0.00",
  ivaFulfillment: "0.00",
  tarifa: null,
  tarifaModelo: "viejo",
};

export const CIERRE_DIA_CR: readonly CierreDetalleGestion[] = CASOS_CR.map((c, i) => {
  const resultado = RESULTADOS[i]!;
  const entregado = resultado === "entregado";
  return {
    gestionId: `gestion-${c.clave}`,
    ordenId: `orden-${c.clave}`,
    fechaGestion: "2026-11-11",
    numGuia: c.numGuia,
    numRemision: c.numRemision,
    destinatario: c.destinatario,
    direccion: c.direccion,
    zonaNombre: c.zona,
    provinciaNombre: c.lugar.provincia.nombre,
    cantonNombre: c.lugar.canton.nombre,
    distritoNombre: c.lugar.distrito?.nombre ?? null,
    producto: c.producto,
    tiendaNombre: c.tienda,
    resultado,
    montoRecibido: entregado ? "15000.00" : null,
    metodoPago: entregado ? "efectivo" : null,
    pagos: entregado ? [{ metodo: "efectivo", monto: "15000.00" }] : [],
    motivo: entregado ? null : "Motivo de prueba",
    fechaReprogramacion: resultado === "reprogramado" ? "2026-11-13" : null,
    evidenciaUrl: null,
    evidenciaUrls: resultado === "devolucion_a_origen_por_rechazo" ? ["https://evidencia.invalid/1"] : [],
    pagoMensajero: resultado === "incidente" ? null : "1500.00",
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: resultado === "incidente" ? "danado" : null,
    indemnizacion: null,
    ingresoEmpresa: i === 2 ? null : INGRESO,
  };
});

// ─── Cierres admin (hoja fundida) ────────────────────────────────────────────────────────────

export const CIERRES_ADMIN_CR: readonly CierreGestionDescargaDTO[] = CASOS_CR.map((c, i) => {
  const resultado = RESULTADOS[i]!;
  const entregado = resultado === "entregado";
  return {
    mensajeroNombre: "Mensajero Uno",
    cierreSolicitadoAt: "2026-11-11T23:10:00.000Z",
    fechaGestion: "2026-11-11",
    diaReparto: i === 4 ? null : "2026-11-11",
    fechaCreacionOrden: "2026-11-10",
    numGuia: c.numGuia,
    numRemision: c.numRemision,
    destinatario: c.destinatario,
    direccion: c.direccion,
    zonaNombre: c.zona,
    provinciaNombre: c.lugar.provincia.nombre,
    cantonNombre: c.lugar.canton.nombre,
    distritoNombre: c.lugar.distrito?.nombre ?? null,
    producto: c.producto,
    tiendaNombre: c.tienda,
    intentosContactoTienda: 0,
    intentosEntrega: i,
    resultado,
    montoRecibido: entregado ? "15000.00" : null,
    pagos: entregado ? [{ metodo: "efectivo", monto: "15000.00" }] : [],
    motivo: entregado ? null : "Motivo de prueba",
    fechaReprogramacion: resultado === "reprogramado" ? "2026-11-13" : null,
    esRechazoSla: false,
    causaIncidente: resultado === "incidente" ? "danado" : null,
    indemnizacion: null,
    pagoMensajero: resultado === "incidente" ? null : "1500.00",
    ingresoBodegaRechazo: null,
    ingresoEmpresa: i === 2 ? null : INGRESO,
  };
});

/** Un nivel de `cierre_detail.ubicacion_snapshot` (forma v1 de SLT-43 §2.6). */
export interface NivelSnapshotCR {
  profundidad: number;
  tipo: string;
  nombre: string;
  id: string;
}

const TIPOS_CR = ["Provincia", "Cantón", "Distrito"] as const;

/**
 * El `ubicacion_snapshot` de cada fila de `CIERRES_ADMIN_CR`, por índice: `null` es una fila de un
 * cierre anterior a SLT-125, que se lee de las tres columnas. Va aparte porque el DTO de hoy no lo
 * lleva. Sus nombres son los de las columnas: en Costa Rica, leer el snapshot no cambia la celda (R26).
 */
export const SNAPSHOTS_CIERRES_ADMIN_CR: readonly ({ v: 1; niveles: NivelSnapshotCR[] } | null)[] = CASOS_CR.map(
  (c, i) =>
    i % 2 === 1
      ? null
      : {
          v: 1,
          niveles: rutaDeLugar(c.lugar).map((p, k) => ({ profundidad: k + 1, tipo: TIPOS_CR[k]!, nombre: p.nombre, id: p.id })),
        },
);

// ─── Cobertura (configuración de zonas) ──────────────────────────────────────────────────────

/** Una fila por distrito del catálogo, con y sin cobertura, y con cada motivo de nivel. */
export const COBERTURA_CR: readonly CoberturaDistritoDTO[] = [
  {
    provincia: "San José",
    canton: "San José",
    distrito: "Carmen",
    disponible: true,
    cobertura: true,
    motivo: null,
    zonas: ["Zona Central"],
    zonaUnica: { nombre: "Zona Central", esCentral: true, tieneTarifaGeneral: true },
    zonaEspecial: false,
  },
  {
    provincia: "San José",
    canton: "Pérez Zeledón",
    distrito: "San Isidro de El General",
    disponible: true,
    cobertura: true,
    motivo: null,
    zonas: ["Zona Sur"],
    zonaUnica: { nombre: "Zona Sur", esCentral: false, tieneTarifaGeneral: false },
    zonaEspecial: true,
  },
  {
    provincia: "Alajuela",
    canton: "San Ramón",
    distrito: "Ángeles",
    disponible: true,
    cobertura: false,
    motivo: "sin_zona",
    zonas: [],
    zonaUnica: null,
    zonaEspecial: false,
  },
  {
    provincia: "Limón",
    canton: "Pococí",
    distrito: "Guápiles",
    disponible: true,
    cobertura: false,
    motivo: "varias_zonas",
    zonas: ["Zona Atlántico", "Zona Caribe"],
    zonaUnica: null,
    zonaEspecial: false,
  },
  {
    provincia: "Puntarenas",
    canton: "Osa",
    distrito: "Puerto Cortés",
    disponible: false,
    cobertura: false,
    motivo: "provincia_retirada",
    zonas: [],
    zonaUnica: null,
    zonaEspecial: false,
  },
  {
    provincia: "Heredia",
    canton: "Santo Domingo",
    distrito: "Santo Tomás",
    disponible: false,
    cobertura: false,
    motivo: "canton_retirado",
    zonas: ["Zona Norte"],
    zonaUnica: { nombre: "Zona Norte", esCentral: false, tieneTarifaGeneral: true },
    zonaEspecial: false,
  },
  {
    provincia: "Cartago",
    canton: "Paraíso",
    distrito: "Orosí",
    disponible: false,
    cobertura: false,
    motivo: "distrito_retirado",
    zonas: [],
    zonaUnica: null,
    zonaEspecial: false,
  },
];
