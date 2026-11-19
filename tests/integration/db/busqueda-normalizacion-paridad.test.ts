import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { normalizarTerminoBusqueda } from "@/lib/utils/busqueda-orden";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
} from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";

// Feature 169 / T1.6 — PARIDAD entre la normalizacion de Postgres (la columna generada
// `orden.busqueda_texto`) y la de Node (`normalizarTerminoBusqueda`).
//
// Es el guardian del riesgo nº 3 del design, y el unico fallo de esta feature que puede
// ocurrir sin que nada pete: si las dos normalizaciones divergen aunque sea en un
// caracter, el buscador "no encuentra" ordenes que existen, sin error, sin log y sin forma
// de deducirlo leyendo codigo. Por eso NO se compara el SQL con una copia del SQL: se
// insertan filas de verdad, se lee lo que Postgres calculo y se compara con lo que calcula
// TypeScript sobre el mismo texto.
//
// Todo corre dentro de una transaccion que SIEMPRE se revierte: cero filas residuales.
// Sin `DATABASE_URL` el bloque se salta (la suite no exige Postgres levantado).

/** Espacio duro U+00A0. Se construye por codigo: en el fuente seria invisible. */
const NBSP = String.fromCharCode(0x00a0);

interface CasoOrden {
  numGuia: number | null;
  numRemision: string;
  telefonoDest: string;
  destinatario: string;
  /** Sexto segmento (migracion `*_orden_busqueda_producto`). Casi ningun caso lo varia. */
  producto?: string;
}

/** Producto de los casos que no lo varian: participa igual, pero no es lo que miden. */
const PRODUCTO_POR_DEFECTO = "producto de prueba";

/**
 * El MISMO texto que concatena la columna generada, en el MISMO orden y con el MISMO
 * separador: guia, remision, telefono tal cual, telefono en solo-digitos, destinatario y
 * producto. Se escribe aqui (y no en `lib/`) a proposito: si viviera junto al
 * normalizador, este test estaria comparando el codigo consigo mismo. Aqui compara contra
 * la BASE.
 */
function textoConcatenado(caso: CasoOrden): string {
  return [
    caso.numGuia === null ? "" : String(caso.numGuia),
    caso.numRemision,
    caso.telefonoDest,
    caso.telefonoDest.replace(/[^0-9]/g, ""),
    caso.destinatario,
    caso.producto ?? PRODUCTO_POR_DEFECTO,
  ].join(" ");
}

const SUFIJO = `p169-${Date.now().toString(36)}`;

const CORPUS: { nombre: string; caso: CasoOrden }[] = [
  {
    nombre: "mayusculas puras",
    caso: {
      numGuia: 1234567,
      numRemision: `REM-${SUFIJO}-A`,
      telefonoDest: "88880000",
      destinatario: "JUAN PEREZ",
    },
  },
  {
    nombre: "tildes en minuscula y mayuscula",
    caso: {
      numGuia: 2234567,
      numRemision: `REM-${SUFIJO}-B`,
      telefonoDest: "60011234",
      destinatario: "José HERNÁNDEZ Solís",
    },
  },
  {
    nombre: "enye y cedilla en ambas cajas",
    caso: {
      numGuia: 3234567,
      numRemision: `REM-${SUFIJO}-C`,
      telefonoDest: "70012345",
      destinatario: "PEÑA Gonçalves Muñoz Ç",
    },
  },
  {
    nombre: "las 24 letras acentuadas del mapa, seguidas",
    caso: {
      numGuia: 4234567,
      numRemision: `REM-${SUFIJO}-D`,
      telefonoDest: "22223333",
      destinatario:
        "áàäâãéèëêíìïîóòöôõúùüûñç " +
        "ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ",
    },
  },
  {
    nombre: "telefono con separadores",
    caso: {
      numGuia: 5234567,
      numRemision: `REM-${SUFIJO}-E`,
      telefonoDest: "(506) 8888-0000",
      destinatario: "Ana Rojas",
    },
  },
  {
    nombre: "espacios repetidos y tabulador (R8)",
    caso: {
      numGuia: 6234567,
      numRemision: `REM-${SUFIJO}-F`,
      telefonoDest: "8888  0000",
      destinatario: "  Ana   María\tRojas  ",
    },
  },
  {
    nombre: "salto de linea dentro del dato",
    caso: {
      numGuia: 7234567,
      numRemision: `REM-${SUFIJO}-G`,
      telefonoDest: "88881111",
      destinatario: "Linea1\nLinea2",
    },
  },
  {
    nombre: "guia NULA (orden sin guia asignada)",
    caso: {
      numGuia: null,
      numRemision: `REM-${SUFIJO}-H`,
      telefonoDest: "88882222",
      destinatario: "Sin Guía Todavía",
    },
  },
  {
    nombre: "caracteres FUERA del mapa (no se pliegan en ningun lado)",
    caso: {
      numGuia: 8234567,
      numRemision: `REM-${SUFIJO}-I`,
      telefonoDest: "88883333",
      destinatario: "Bjørn Łukasz Åse Straße",
    },
  },
  {
    nombre: "comodines de LIKE dentro del dato",
    caso: {
      numGuia: 9234567,
      numRemision: `REM-${SUFIJO}-100%_J`,
      telefonoDest: "88884444",
      destinatario: "100% _raro_ \\backslash",
    },
  },
  {
    // El caso que obligo a NO escribir la clase '\s' en el SQL: la '\s' de Postgres es
    // '[[:space:]]' y depende del ctype de la base. Verificado: el Postgres 18 local
    // (msvc) SI colapsa el NBSP; un build glibc (Supabase) NO. Con la clase explicita
    // los dos lados lo dejan intacto en CUALQUIER base, y la paridad deja de depender del
    // servidor donde corra la consulta.
    nombre: "espacio duro NBSP: ninguno de los dos lados lo colapsa",
    caso: {
      numGuia: 10234567,
      numRemision: `REM-${SUFIJO}-K`,
      telefonoDest: "88885555",
      destinatario: `Ana${NBSP}${NBSP}Rojas`,
    },
  },
  {
    // El sexto segmento pasa por el MISMO plegado que los demas: es lo que distingue esta
    // via de un `ILIKE` sobre la columna cruda, que baja la caja pero deja el acento y
    // haria que "cafe" no encontrara "Café".
    nombre: "producto con acentos, mayusculas y espacios de sobra",
    caso: {
      numGuia: 11234567,
      numRemision: `REM-${SUFIJO}-L`,
      telefonoDest: "88886666",
      destinatario: "Diego Alfaro",
      producto: "  CAJA de   Café Añejo\tÑ  ",
    },
  },
];

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("paridad SQL <-> TypeScript de la normalizacion de busqueda", () => {
  let prisma: PrismaClient;
  // SLT-181 — lo que la tx del `beforeAll` sembro y encontro, para el control positivo.
  let sembrado: { tiendas: number; zonas: number; ordenes: number };
  let calculado: Map<string, string | null>;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    calculado = await enTransaccionRevertida(prisma, async (tx) => {
      // SLT-181 — tienda y zona nacen en ESTA transaccion (nada de leer la primera orden de la base).
      const base = await crearFksDeOrden(tx);
      sembrado = {
        tiendas: await tx.usuario.count({ where: { id: base.tiendaId } }),
        zonas: await tx.zona.count({ where: { id: base.zonaId } }),
        ordenes: 0,
      };
      const salida = new Map<string, string | null>();
      for (const { nombre, caso } of CORPUS) {
        const creada = await tx.orden.create({
          data: {
            numGuia: caso.numGuia,
            numRemision: caso.numRemision,
            destinatario: caso.destinatario,
            telefonoDest: caso.telefonoDest,
            producto: caso.producto ?? PRODUCTO_POR_DEFECTO,
            estatusId: base.estatusId,
            tiendaId: base.tiendaId,
            zonaId: base.zonaId,
            provinciaId: base.provinciaId,
            cantonId: base.cantonId,
          },
          select: { id: true },
        });
        // Lectura CRUDA: el `omit` global del cliente esconde la columna a proposito
        // (R28), asi que la unica forma de verla es por SQL. Que haga falta esto ya es
        // evidencia de que el `omit` esta puesto.
        const filas = await tx.$queryRawUnsafe<{ busqueda_texto: string | null }[]>(
          'SELECT "busqueda_texto" FROM "orden" WHERE "id" = $1',
          creada.id,
        );
        salida.set(nombre, filas[0]?.busqueda_texto ?? null);
      }
      sembrado.ordenes = await tx.orden.count({ where: { tiendaId: base.tiendaId } });
      return salida;
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("la base tiene ordenes de las que tomar las FKs (si no, no hay nada que probar)", () => {
    // SLT-181 — control positivo: lo sembrado en la tx del `beforeAll` estaba en la base.
    expect(sembrado, "no hay ninguna fila en `orden` de la que copiar las FKs: siembra la base local").toBeDefined();
    expect(sembrado.tiendas, "SLT-181: la tienda sembrada no esta en la base").toBe(1);
    expect(sembrado.zonas, "SLT-181: la zona sembrada no esta en la base").toBe(1);
    expect(sembrado.ordenes, "SLT-181: las ordenes del corpus no se sembraron").toBe(CORPUS.length);
  });

  for (const { nombre, caso } of CORPUS) {
    it(`Postgres y Node producen el MISMO texto - ${nombre}`, () => {
      const enLaBase = calculado.get(nombre);
      const enNode = normalizarTerminoBusqueda(textoConcatenado(caso));
      expect(enLaBase).not.toBeNull();
      expect(enLaBase).toBe(enNode);
    });
  }

  it("la columna nunca es NULL, ni siquiera con la guia sin asignar", () => {
    for (const { nombre } of CORPUS) expect(calculado.get(nombre)).not.toBeNull();
  });

  it("el texto indexado esta en minusculas y sin las tildes del mapa", () => {
    const conTildes = calculado.get("tildes en minuscula y mayuscula") as string;
    expect(conTildes).toContain("jose hernandez solis");
    expect(conTildes).not.toMatch(/[áéíóúÁÉÍÓÚñÑçÇ]/);
  });

  it("el telefono con separadores queda TAMBIEN en forma solo-digitos (R13)", () => {
    const conSeparadores = calculado.get("telefono con separadores") as string;
    expect(conSeparadores).toContain("(506) 8888-0000");
    expect(conSeparadores).toContain("50688880000");
  });

  it("un dato con espacios repetidos queda con espacios simples (R8)", () => {
    const conEspacios = calculado.get("espacios repetidos y tabulador (R8)") as string;
    expect(conEspacios).toContain("ana maria rojas");
    expect(conEspacios).not.toContain("  ");
  });
});
