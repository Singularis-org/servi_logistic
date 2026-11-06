import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ChatConversacionRepository } from "@/lib/repositories/ChatConversacionRepository";
import { normalizarTelefono, sqlNormalizarTelefono, type ReglasTelefono } from "@/lib/utils/telefono-pais";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
} from "./_postgres-real";

// REGRESION — los entrantes de WhatsApp desde Costa Rica se perdian en silencio.
//
// QUE PASABA. `ChatWhatsappService.ingerirEventos` resuelve cada entrante llamando a
// `resolverOrdenActivaPorNumero(numero)`; si eso devuelve null, cuenta `sinResolver`, sigue y
// el webhook responde 200. Meta no reintenta un 200: el mensaje NO se guarda y no queda rastro
// de que existio. El lado del ENTRANTE viene normalizado por `normalizarTelefonoWa` (un local
// CR de 8 digitos sale como `506########`), pero el lado de la COLUMNA solo aplicaba
// `regexp_replace(telefono_dest, '[^0-9]', '', 'g')`, que NO prefija. Una orden guardada como
// `8888-7777` —el formato con el que el negocio carga las ordenes de CR— daba `88887777` y
// jamas casaba con `50688887777`. Con numeros colombianos no se notaba: ya se guardan con `57…`.
//
// POR QUE CONTRA POSTGRES REAL Y NO CON UN DOBLE. Lo que falla aqui es una EXPRESION SQL, no
// codigo TypeScript: el test unitario del repositorio mockea `$queryRaw`, asi que pasaba en
// verde con el SQL roto y seguiria pasando si el SQL se rompiera otra vez. La unica forma de
// demostrar que el WHERE encuentra la orden es hacer que el motor lo evalue.
//
// Todo corre dentro de una transaccion que SIEMPRE se revierte: si el test pasa, si falla o si
// el runner muere, no queda ni una fila en la base de desarrollo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// SLT-42 (R18, R19, R21): la normalizacion ya no es de Costa Rica sino del pais de la empresa. Se
// prueba con CR (los casos de siempre, que no pueden cambiar) y con un pais de prueba con OTRO
// prefijo y OTRO largo nacional, para que un `506` o un `8` escondidos en el SQL se pongan rojos.
const TEL_CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };
const TEL_XA: ReglasTelefono = { prefijo: "999", digitosNacionales: 7 };

const SUFIJO = `wa-cr-${Date.now().toString(36)}`;

/**
 * Numero de la prueba, IMPROBABLE a proposito: la base de desarrollo tiene ordenes reales y la
 * consulta devuelve `LIMIT 1`. Ademas la orden sembrada se asigna con un `asignado_at` FUTURO,
 * asi que gana el `ORDER BY asignado_at DESC` aunque alguna fila real compartiera el numero.
 */
const LOCAL = "89990001";
/** Lo que manda Meta en el webhook para ese numero: E.164 sin `+`. */
const ENTRANTE = "50689990001";
const ASIGNADO_FUTURO = new Date("2099-01-01T00:00:00.000Z");

interface Caso {
  nombre: string;
  /** Reglas del pais de la empresa con que se normaliza. */
  reglas: ReglasTelefono;
  /** Como quedo guardado `telefono_dest` en la orden. */
  guardado: string;
  /** Lo que llega del webhook. */
  entrante: string;
}

/** El mismo numero improbable en el pais de prueba: 7 digitos locales y prefijo `999`. */
const ENTRANTE_XA = "9997770001";

const CASOS: Caso[] = [
  // LA REGRESION: el formato con el que se cargan de verdad las ordenes de Costa Rica.
  { nombre: "local CR con separadores", reglas: TEL_CR, guardado: "8999-0001", entrante: ENTRANTE },
  { nombre: "local CR de 8 digitos", reglas: TEL_CR, guardado: LOCAL, entrante: ENTRANTE },
  { nombre: "local CR con espacios", reglas: TEL_CR, guardado: "8999 0001", entrante: ENTRANTE },
  // NO REGRESION: lo que ya funcionaba tiene que seguir funcionando.
  { nombre: "ya con indicativo 506", reglas: TEL_CR, guardado: ENTRANTE, entrante: ENTRANTE },
  { nombre: "con + y indicativo", reglas: TEL_CR, guardado: `+${ENTRANTE}`, entrante: ENTRANTE },
  { nombre: "internacional no CR", reglas: TEL_CR, guardado: "573001119999", entrante: "573001119999" },
  { nombre: "internacional no CR con +", reglas: TEL_CR, guardado: "+573001119999", entrante: "573001119999" },
  // SLT-42: una empresa de OTRO pais. Su local (7 digitos) se prefija con SU prefijo.
  { nombre: "local de otro pais con separadores", reglas: TEL_XA, guardado: "777-0001", entrante: ENTRANTE_XA },
  { nombre: "local de otro pais de 7 digitos", reglas: TEL_XA, guardado: "7770001", entrante: ENTRANTE_XA },
  { nombre: "otro pais con + y su indicativo", reglas: TEL_XA, guardado: `+${ENTRANTE_XA}`, entrante: ENTRANTE_XA },
  { nombre: "otro pais, numero de CR con +", reglas: TEL_XA, guardado: `+${ENTRANTE}`, entrante: ENTRANTE },
];

describeSiHayBase("resolucion del entrante de WhatsApp por telefono (Postgres real)", () => {
  let prisma: PrismaClient;
  let fks: FksDeOrden | null;
  let mensajeroId: string | null;
  let organizacionId: string | null;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    // SLT-42: las FKs, el mensajero y la empresa de la transaccion salen de LA MISMA empresa. Con
    // las FKs de cualquier orden + «el primer usuario» y la empresa nueva que crea `enTransaccionRevertida`, una
    // base con mas de una empresa cae en «referencia a otra empresa» (trigger de SL-17) antes de
    // llegar al SQL que este archivo prueba.
    const orden = await prisma.orden.findFirst({
      select: { organizacionId: true, estatusId: true, tiendaId: true, zonaId: true, provinciaId: true, cantonId: true },
    });
    organizacionId = orden?.organizacionId ?? null;
    fks = orden;
    const usuario =
      organizacionId === null
        ? null
        : await prisma.usuario.findFirst({ where: { organizacionId }, select: { id: true } });
    mensajeroId = usuario?.id ?? null;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /**
   * Siembra UNA orden con el telefono dado y resuelve el entrante contra el repositorio REAL.
   * Devuelve el id sembrado y lo que resolvio la consulta, y revierte todo al salir.
   */
  async function sembrarYResolver(
    guardado: string,
    entrante: string,
    opciones: { borrada?: boolean; sinMensajero?: boolean; reglas?: ReglasTelefono } = {},
  ) {
    const base = fks;
    const men = mensajeroId;
    const empresa = organizacionId;
    if (base === null || men === null || empresa === null) throw new Error("faltan FKs de orden o usuario");

    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const creada = await tx.orden.create({
        data: {
          numGuia: null, // nullable y @unique: dejarlo null evita chocar con guias reales
          numRemision: `REM-${SUFIJO}-${Math.random().toString(36).slice(2, 10)}`,
          destinatario: "Regresion Entrante CR",
          telefonoDest: guardado,
          producto: "caja",
          estatusId: base.estatusId,
          tiendaId: base.tiendaId,
          zonaId: base.zonaId,
          provinciaId: base.provinciaId,
          cantonId: base.cantonId,
          mensajeroAsignadoId: opciones.sinMensajero ? null : men,
          asignadoAt: opciones.sinMensajero ? null : ASIGNADO_FUTURO,
          deletedAt: opciones.borrada ? new Date() : null,
        },
        select: { id: true },
      });

      const repo = new ChatConversacionRepository(tx as unknown as PrismaClient);
      const resolucion = await repo.resolverOrdenActivaPorNumero(entrante, opciones.reglas ?? TEL_CR);
      return { ordenId: creada.id, resolucion };
    }, { organizacionId: empresa });
  }

  it("hay FKs de orden y un usuario del que colgar el mensajero", () => {
    // Contrapeso de todo el archivo: sin esto, `sembrarYResolver` lanzaria y los casos de abajo
    // fallarian por el motivo equivocado. Si la base esta vacia hay que sembrarla, no ignorarlo.
    expect(fks).not.toBeNull();
    expect(mensajeroId).not.toBeNull();
  });

  for (const caso of CASOS) {
    it(`resuelve la orden con el telefono guardado como ${caso.nombre} (${caso.guardado})`, async () => {
      const { ordenId, resolucion } = await sembrarYResolver(caso.guardado, caso.entrante, {
        reglas: caso.reglas,
      });

      expect(resolucion).not.toBeNull();
      expect(resolucion?.ordenId).toBe(ordenId);
      expect(resolucion?.mensajeroId).toBe(mensajeroId);
      // El hilo se keyea con la forma canonica, no con el crudo de la columna.
      expect(resolucion?.telefonoE164).toBe(normalizarTelefono(caso.guardado, caso.reglas));
      expect(resolucion?.telefonoE164).toBe(caso.entrante);
    });
  }

  it("un entrante de OTRO numero no cae en la orden sembrada", async () => {
    // El arreglo ensancha el match; esta es la contraprueba de que no lo ensancha de mas.
    const { ordenId, resolucion } = await sembrarYResolver("8999-0001", "50689990002");
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it("un entrante de 8 digitos NO casa con un numero internacional que termina igual", async () => {
    // `573...119999` normaliza a si mismo; un local CR con los mismos ultimos 8 digitos NO debe
    // atraerlo (si algun dia se matchea por sufijo, esto se pone rojo antes que produccion).
    const { ordenId, resolucion } = await sembrarYResolver("573001119999", "50601119999");
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it("SLT-42 R18: en una empresa de otro pais, un local de CR (8 digitos) NO se prefija con 506", async () => {
    // Con las reglas de CR `8999-0001` casaba con `50689990001`. Con las de un pais de 7 digitos
    // ese local no es «nacional» y se queda tal cual: si el SQL tuviera el `506` escrito, casaria.
    const { ordenId, resolucion } = await sembrarYResolver("8999-0001", ENTRANTE, { reglas: TEL_XA });
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it("SLT-42 R18: en una empresa de CR, un local de 7 digitos NO se prefija con el prefijo de otro pais", async () => {
    const { ordenId, resolucion } = await sembrarYResolver("777-0001", ENTRANTE_XA, { reglas: TEL_CR });
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it("no resuelve una orden BORRADA aunque el numero case (R25/D4)", async () => {
    const { ordenId, resolucion } = await sembrarYResolver("8999-0001", ENTRANTE, {
      borrada: true,
    });
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it("no resuelve una orden SIN mensajero asignado aunque el numero case (R25/D4)", async () => {
    const { ordenId, resolucion } = await sembrarYResolver("8999-0001", ENTRANTE, {
      sinMensajero: true,
    });
    expect(resolucion?.ordenId).not.toBe(ordenId);
  });

  it.each([
    ["Costa Rica", TEL_CR],
    ["un pais con otro prefijo y otro largo", TEL_XA],
  ] as const)("R19: `sqlNormalizarTelefono` y `normalizarTelefono` producen EL MISMO texto (%s)", async (_pais, reglas) => {
    // La guardia de la DUPLICACION. La normalizacion existe dos veces —una en TypeScript, para
    // el entrante; otra en SQL, para la columna— y solo casan si dicen lo mismo. Este caso corre
    // LA MISMA expresion que usa el repositorio (importada, no copiada) contra Postgres real y
    // la compara con la funcion de TypeScript sobre las formas que aparecen en la columna. Si
    // alguien toca una de las dos y no la otra, esto se pone rojo antes que produccion.
    const crudos = [
      "8999-0001",
      "89990001",
      "8999 0001",
      "+50689990001",
      "50689990001",
      "506 8999-0001",
      "573001119999",
      "+573001119999",
      "(506) 8999 0001",
      "123",
      "",
      // SLT-42: las formas del pais de prueba, y un `+` con espacios delante.
      "777-0001",
      "7770001",
      "999 777 0001",
      "+999 7770001",
      "9997770001",
      "999",
      "  +12025550143",
      "88887777x",
    ];

    // El prefijo y los digitos viajan como PARAMETROS ($1, $2), igual que en el repositorio.
    const filas = await prisma.$queryRawUnsafe<{ crudo: string; sql: string }[]>(
      `
      SELECT t.crudo, ${sqlNormalizarTelefono("t.crudo", 1, 2)} AS sql
      FROM unnest($3::text[]) AS t(crudo)
      `,
      reglas.prefijo,
      reglas.digitosNacionales,
      crudos,
    );

    expect(filas).toHaveLength(crudos.length);
    for (const fila of filas) {
      expect({ crudo: fila.crudo, normalizado: fila.sql }).toEqual({
        crudo: fila.crudo,
        normalizado: normalizarTelefono(fila.crudo, reglas),
      });
    }
  });
});
