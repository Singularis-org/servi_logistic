import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";
import { handleGeografiaApi } from "@/app/api/v2/geografia/route";
import { handleCrearOrdenV2 } from "@/app/api/v2/ordenes/route";
import {
  MSG_PAIS_NO_HABILITADO,
  msgCodigoNoEncontrado,
  msgCodigoRetirado,
  msgNivelNoEncontrado,
  msgNivelRetirado,
} from "@/lib/services/geo-ubicacion";
import {
  PAISES_DE_PRUEBA_GEO,
  activoEnCascada,
  claveDeRuta,
  residuosDePaisesDePrueba,
  type PaisDePruebaGeo,
} from "@/tests/fixtures/paises-de-prueba-geo";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "../db/_postgres-real";
import {
  conPaisDePrueba,
  cotizacionServiceDe,
  depsDeCarga,
  geografiaServiceDe,
  get,
  post,
  type ContextoDePaisDePrueba,
} from "./_v2-escenario";

// SLT-45 T5.8 (design §2.2, §6, §12; R5, R15, R22, R33) — LOS PAISES DE PRUEBA DE 2 Y 4 NIVELES.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte. La empresa de la key es de un pais que solo existe en los datos de test
// (`tests/fixtures/paises-de-prueba-geo.ts`): `XN` (2 niveles) o `XP` (4 niveles). Corren reales los
// bordes de v2 (catalogo, crear, lote, cotizacion) y de v1 (carga, cotizacion), sus servicios, el
// motor de ubicacion y el catalogo de la empresa; se sustituyen la autenticacion de la key, el
// Storage y la firma de URLs.
//
// Como se sabe que la resolucion ENCONTRO el nodo si todas las filas dicen «pais no habilitado»: el
// motor resuelve antes de aplicar la regla de guardado (design §2.2, pasos 1-3), y un nombre o un
// codigo que no encuentra, o que esta retirado, da OTRO mensaje. Por eso cada lote lleva, junto a los
// nodos validos, sus contrapruebas (nombre inexistente en cada nivel, codigo inexistente, retirados),
// y se exige el mensaje exacto de cada una.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Fila = Record<string, unknown>;

interface Respuesta {
  status: number;
  texto: string;
  cuerpo: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function respuesta(res: Response): Promise<Respuesta> {
  const texto = await res.text();
  return { status: res.status, texto, cuerpo: JSON.parse(texto) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let secuencia = 0;
function fila(ubicacion: Fila): Fila {
  secuencia += 1;
  return {
    num_remision: `R33-${secuencia}`,
    destinatario: `Destinatario ${secuencia}`,
    telefono: "80000001",
    direccion: `Direccion ${secuencia}`,
    producto: `Producto ${secuencia}`,
    peso: "1",
    monto_cobrar: "25900",
    ...ubicacion,
  };
}

const loteV2 = async (c: ContextoDePaisDePrueba, ordenes: Fila[]) =>
  respuesta(await handleCargaApi(post("/api/v2/ordenes/carga", { ordenes }), depsDeCarga(c.cli, c.autenticar), "v2"));

const crearV2 = async (c: ContextoDePaisDePrueba, orden: Fila) =>
  respuesta(await handleCrearOrdenV2(post("/api/v2/ordenes", { orden }), depsDeCarga(c.cli, c.autenticar)));

const cotizar = async (c: ContextoDePaisDePrueba, version: "v1" | "v2", ordenes: Fila[]) =>
  respuesta(
    await handleCotizacionApi(
      post(version === "v1" ? "/api/ordenes/api-key/cotizacion" : "/api/v2/ordenes/cotizacion", { ordenes }),
      { autenticar: c.autenticar, cotizacionService: cotizacionServiceDe(c.cli) },
      version,
    ),
  );

const cargaV1 = async (c: ContextoDePaisDePrueba, ordenes: Fila[]) =>
  respuesta(await handleCargaApi(post("/api/ordenes/api-key/carga", { ordenes }), depsDeCarga(c.cli, c.autenticar)));

const catalogo = async (c: ContextoDePaisDePrueba, pais: string) =>
  respuesta(
    await handleGeografiaApi(get(`/api/v2/geografia?pais=${pais}`), {
      autenticar: c.autenticar,
      geografiaService: geografiaServiceDe(c.cli),
    }),
  );

/** Ordenes y lotes de la empresa (RLS de `servi_app`): «sin crear nada» es los dos en cero. */
async function creado(c: ContextoDePaisDePrueba): Promise<{ ordenes: number; cargas: number }> {
  return { ordenes: await c.tx.orden.count(), cargas: await c.tx.carga.count() };
}

const errores = (r: Respuesta): unknown[] => r.cuerpo.errores.map((e: { errores: unknown }) => e.errores);
const enUbicacion = (mensaje: string) => ({ ubicacion: [mensaje] });

/** Mayusculas, sin tildes y con dobles espacios: lo que `normalize` tiene que absorber. */
const desnormalizado = (nombre: string): string =>
  nombre.normalize("NFD").replace(/\p{Mn}/gu, "").toUpperCase().replace(/ /g, "  ");

/** El nodo mas profundo y activo del pais (el primero que aparece). */
function masProfundo(def: PaisDePruebaGeo): string[] {
  const activos = def.nodos.filter((n) => activoEnCascada(def, n.ruta));
  return activos.reduce((a, n) => (n.ruta.length > a.ruta.length ? n : a)).ruta;
}

describeSiHayBase("SLT-45 R5, R15, R22, R33 — paises de prueba de 2 y 4 niveles (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    try {
      // Los paises de prueba solo existen dentro de cada transaccion revertida: fuera, cero.
      expect(await residuosDePaisesDePrueba(base)).toEqual({ paises: 0, tipos: 0, nodos: 0, organizaciones: 0 });
    } finally {
      await base?.$disconnect();
    }
  });

  describe.each(PAISES_DE_PRUEBA_GEO.map((def) => [def.niveles, def] as const))("pais de %i niveles", (_niveles, def) => {
    it(`R22/R33 (${def.id}): el catalogo devuelve el pais, sus tipos y TODOS sus nodos, de cualquier profundidad, con el activo en cascada`, async () => {
      await conPaisDePrueba(base, def, async (c) => {
        const r = await catalogo(c, def.id);
        expect(r.status).toBe(200);
        expect(r.cuerpo.pais).toEqual({ id: def.id, nombre: def.nombre });
        expect(r.cuerpo.tipos).toEqual(def.tipos);

        const esperados = def.nodos.map((n) => {
          const profundidad = n.ruta.length;
          return {
            id: c.pais.nodoPorRuta.get(claveDeRuta(n.ruta)),
            padreId: profundidad === 1 ? null : c.pais.nodoPorRuta.get(claveDeRuta(n.ruta.slice(0, -1))),
            profundidad,
            tipo: `nivel_${profundidad}`,
            nombre: n.ruta[profundidad - 1],
            codigoOficial: n.codigoOficial,
            activo: activoEnCascada(def, n.ruta),
          };
        });
        const porId = <T extends { id?: string }>(xs: T[]) => [...xs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        expect(porId(r.cuerpo.nodos)).toEqual(porId(esperados));
        expect(Math.max(...r.cuerpo.nodos.map((n: { profundidad: number }) => n.profundidad))).toBe(def.niveles);
        expect(esperados.some((n) => !n.activo)).toBe(true);
      });
    }, 120_000);

    it(`R22/R23 (${def.id}): la key de este pais no lee el catalogo de Costa Rica: mismo 404 que un pais inexistente`, async () => {
      await conPaisDePrueba(base, def, async (c) => {
        const cr = await catalogo(c, "CR");
        const inexistente = await catalogo(c, "ZZ");
        expect(cr.status).toBe(404);
        expect(cr.texto).toBe(inexistente.texto);
      });
    }, 120_000);

    it(`R33/R15 (${def.id}): por nombre y por codigo se encuentran nodos de TODA profundidad, y cada uno da «pais no habilitado»; sin crear nada`, async () => {
      await conPaisDePrueba(base, def, async (c) => {
        const filas: Fila[] = [];
        const esperado: unknown[] = [];
        const agregar = (ubicacion: Fila, mensaje: string) => {
          filas.push(fila(ubicacion));
          esperado.push(enUbicacion(mensaje));
        };

        // Cada nodo activo, por nombre y por codigo.
        const activos = def.nodos.filter((n) => activoEnCascada(def, n.ruta));
        for (const n of activos) {
          agregar({ ubicacion: n.ruta }, MSG_PAIS_NO_HABILITADO);
          if (n.codigoOficial !== null) agregar({ ubicacion_codigo: n.codigoOficial }, MSG_PAIS_NO_HABILITADO);
        }
        const profundo = masProfundo(def);
        expect(profundo).toHaveLength(def.niveles);
        // Normalizado nivel a nivel (mayusculas, sin tildes, dobles espacios).
        agregar({ ubicacion: profundo.map(desnormalizado) }, MSG_PAIS_NO_HABILITADO);

        // Contrapruebas: lo que no existe o esta retirado NO dice «pais no habilitado».
        for (let n = 1; n <= profundo.length; n++) {
          const ruta = [...profundo.slice(0, n - 1), "No Existe"];
          agregar({ ubicacion: ruta }, msgNivelNoEncontrado(n, "No Existe", n === 1 ? null : profundo[n - 2]));
        }
        agregar({ ubicacion_codigo: "NO-EXISTE" }, msgCodigoNoEncontrado("NO-EXISTE"));
        for (const n of def.nodos.filter((x) => !activoEnCascada(def, x.ruta))) {
          const nivel = n.ruta.findIndex((_, i) => !activoEnCascada(def, n.ruta.slice(0, i + 1))) + 1;
          agregar({ ubicacion: n.ruta }, msgNivelRetirado(nivel, n.ruta[nivel - 1]));
          if (n.codigoOficial !== null) agregar({ ubicacion_codigo: n.codigoOficial }, msgCodigoRetirado(n.codigoOficial));
        }

        const r = await loteV2(c, filas);
        expect(r.status).toBe(200);
        expect(r.cuerpo).toMatchObject({ total: filas.length, creadas: 0, duplicadas: 0, conError: filas.length, ordenes: [], filas: [] });
        expect(errores(r)).toEqual(esperado);
        expect(await creado(c)).toEqual({ ordenes: 0, cargas: 0 });
      });
    }, 120_000);

    it(`R15/R33 (${def.id}): crear, lote y cotizacion de v2 responden «pais no habilitado» para cada orden y no crean ninguna`, async () => {
      await conPaisDePrueba(base, def, async (c) => {
        const profundo = masProfundo(def);
        const raiz = def.nodos[0];
        const filas = () => [fila({ ubicacion: profundo }), fila({ ubicacion: [raiz.ruta[0]] }), fila({ ubicacion_codigo: raiz.codigoOficial })];

        const rCrear = await crearV2(c, fila({ ubicacion: profundo }));
        const rLote = await loteV2(c, filas());
        const rCot = await cotizar(c, "v2", filas());
        for (const r of [rCrear, rLote, rCot]) expect(r.status).toBe(200);

        expect(rCrear.cuerpo).toMatchObject({ total: 1, creadas: 0, conError: 1, ordenes: [], cargaId: null });
        expect(errores(rCrear)).toEqual([enUbicacion(MSG_PAIS_NO_HABILITADO)]);
        expect(rLote.cuerpo).toMatchObject({ total: 3, creadas: 0, conError: 3, ordenes: [], cargaId: null });
        expect(errores(rLote)).toEqual(Array(3).fill(enUbicacion(MSG_PAIS_NO_HABILITADO)));
        expect(rCot.cuerpo).toMatchObject({ total: 3, cotizadas: 0, conError: 3, filas: [] });
        expect(errores(rCot)).toEqual(Array(3).fill(enUbicacion(MSG_PAIS_NO_HABILITADO)));

        expect(await creado(c)).toEqual({ ordenes: 0, cargas: 0 });
      });
    }, 120_000);

    it(`R5 (${def.id}): la carga y la cotizacion de v1 rechazan cada fila con «pais no habilitado» bajo \`ubicacion\`, sin crear nada`, async () => {
      await conPaisDePrueba(base, def, async (c) => {
        const profundo = masProfundo(def);
        // La terna de v1 con nombres reales del pais (los que haya) y con nombres que no existen: la
        // forma del pais se comprueba antes de resolver, asi que las dos dan lo mismo.
        const filas = () => [
          fila({ provincia: profundo[0], canton: profundo[1], distrito: profundo[2] ?? profundo[1] }),
          fila({ provincia: "No Existe", canton: "No Existe", distrito: "No Existe" }),
        ];

        const rCarga = await cargaV1(c, filas());
        const rCot = await cotizar(c, "v1", filas());
        for (const r of [rCarga, rCot]) expect(r.status).toBe(200);

        expect(rCarga.cuerpo).toMatchObject({ total: 2, creadas: 0, duplicadas: 0, conError: 2, ordenes: [], filas: [], cargaId: null });
        expect(errores(rCarga)).toEqual(Array(2).fill(enUbicacion(MSG_PAIS_NO_HABILITADO)));
        expect(rCot.cuerpo).toMatchObject({ total: 2, cotizadas: 0, conError: 2, filas: [] });
        expect(errores(rCot)).toEqual(Array(2).fill(enUbicacion(MSG_PAIS_NO_HABILITADO)));
        // Ni `provincia`, ni `canton`, ni `distrito`: la clave es `ubicacion`.
        for (const r of [rCarga, rCot]) {
          for (const e of r.cuerpo.errores) expect(Object.keys(e.errores)).toEqual(["ubicacion"]);
        }

        expect(await creado(c)).toEqual({ ordenes: 0, cargas: 0 });
      });
    }, 120_000);
  });
});
