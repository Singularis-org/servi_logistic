import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { IGeoRepository } from "@/lib/interfaces/repositories/IGeoRepository";
import type {
  ArchivoDivision,
  CargarDivisionServiceResult,
  ICargaDivisionService,
} from "@/lib/interfaces/services/ICargaDivisionService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { parseSpreadsheet, type ParsedSpreadsheet } from "@/lib/parsers/spreadsheet";
import {
  DIVISION_MAX_BYTES,
  DIVISION_MAX_ERRORES,
  DIVISION_TOPE_DE_FILAS_CSV,
} from "@/lib/types/division-csv";
import { filaDeRegistro, planificarDivision, revisarCabeceraDivision } from "@/lib/utils/division-csv";

// SL-20 (design §5, §6; R24–R28) — la carga de la division geografica de un pais por CSV.
//
// Los pasos van del mas barato al mas caro, y cada uno corta antes de que el siguiente gaste nada:
// rol → extension y tamaño → UTF-8 → parseo → cabecera → numero de filas → plan → escritura. Hasta
// el plan no se lee la base, y hasta la escritura no se escribe; con un solo error no se escribe
// nada (R25).
//
// El rol lee `ROLES_PLATAFORMA` por import (guardia `superadmin-fuera-de-empresa`): una empresa
// nunca carga geografia (R37). SLT-46 (R39): antes de leer el archivo y antes de tocar la base.
//
// SLT-46 (design §4.3, §5; R30–R34): el pais tiene P tipos (2–10), y la cabecera exige
// `nivel_<k>`/`codigo_nivel_<k>` de 1 a P. Como P sale de la base, la cabecera se revisa DESPUES de
// leer la division del pais, y no antes como en SL-20; el resto del archivo (extension, tamaño,
// UTF-8, parseo, numero de filas) sigue antes, sin leer nada. Para CR, P = 3: las seis columnas, los
// mismos mensajes y los mismos avisos.
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

/** Lo que el servicio necesita del repositorio de geografia: la carga por profundidad (§4.4). */
export type CargaDivisionRepo = Pick<IGeoRepository, "leerDivisionDePais" | "importarDivision">;

type Rechazo = { status: "archivo_rechazado"; motivo: string };

export class CargaDivisionService implements ICargaDivisionService {
  constructor(private readonly repo: CargaDivisionRepo) {}

  async cargar(
    paisId: string,
    archivo: ArchivoDivision,
    actor: Actor,
  ): Promise<CargarDivisionServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const hoja = await leerArchivo(archivo);
    if ("status" in hoja) return hoja;

    const division = await this.repo.leerDivisionDePais(paisId);
    if (division === null) return { status: "not_found" };

    // R30: las columnas obligatorias son las de los P tipos del pais; las demas, aviso (R34).
    const p = division.tipos.length;
    const { faltan, avisos } = revisarCabeceraDivision(hoja.headers, p);
    if (faltan.length > 0) return rechazo(`Faltan columnas obligatorias: ${faltan.join(", ")}.`);

    const filas = hoja.rows.map((r, i) => filaDeRegistro(hoja.numerosDeFila[i], r, p));
    const resultado = planificarDivision(filas, division.nodos, division.tipos);
    if ("errores" in resultado) {
      return {
        status: "invalido",
        errores: resultado.errores.slice(0, DIVISION_MAX_ERRORES),
        total: resultado.errores.length,
        avisos,
      };
    }

    const resumen = await this.repo.importarDivision(paisId, resultado.plan, actor.usuarioId);
    return { status: "ok", ...resumen, avisos };
  }
}

/**
 * R28: del archivo a la hoja leida, o el motivo por el que el archivo entero no sirve. Todo lo que no
 * depende del pais: la cabecera, que si, la revisa `cargar` con los tipos del pais.
 */
async function leerArchivo(archivo: ArchivoDivision): Promise<Rechazo | ParsedSpreadsheet> {
  if (!/\.csv$/i.test(archivo.nombre.trim())) {
    return rechazo("El archivo tiene que ser .csv.");
  }
  if (archivo.bytes.byteLength > DIVISION_MAX_BYTES) {
    return rechazo(`El archivo pesa más de ${DIVISION_MAX_BYTES / (1024 * 1024)} MB.`);
  }

  const texto = decodificarUtf8(archivo.bytes);
  if (texto === null) return rechazo("El archivo no está en UTF-8.");

  const hoja = await parsear(texto);
  if ("status" in hoja) return hoja;

  if (hoja.rows.length > DIVISION_TOPE_DE_FILAS_CSV) {
    return rechazo(`El archivo tiene más de ${DIVISION_TOPE_DE_FILAS_CSV} filas de datos.`);
  }
  return hoja;
}

/**
 * UTF-8 ESTRICTO: un byte que no es UTF-8 rechaza el archivo en vez de convertirse en «�» y entrar
 * como nombre de un distrito. El BOM se acepta y se quita (`ignoreBOM: false`, el defecto).
 */
function decodificarUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    if (e instanceof TypeError) return null;
    throw e;
  }
}

/** Texto literal (T3.1): sin el, el codigo «01» llegaria como 1. */
async function parsear(texto: string): Promise<Rechazo | ParsedSpreadsheet> {
  try {
    return await parseSpreadsheet(Buffer.from(texto, "utf8"), "csv", { textoLiteral: true });
  } catch (e) {
    // Un CSV que el lector no entiende es un archivo que no sirve, no un fallo del servidor; el
    // motivo del lector va en la respuesta porque es lo unico que ayuda a arreglarlo.
    return rechazo(`No se pudo leer el CSV: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function rechazo(motivo: string): Rechazo {
  return { status: "archivo_rechazado", motivo };
}
