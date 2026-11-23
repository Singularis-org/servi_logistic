// SLT-190 «Recoger y Recolección según el canvas» (R850, R851, DS1) — el filtro «Tienda»: opciones
// a partir de las órdenes cargadas (sin repetir, orden alfabético) y filtrado por tienda compuesto
// con el término del buscador.
import { describe, it, expect } from "vitest";

import {
  filtrarPorTienda,
  opcionesTienda,
} from "@/app/(app)/mis-asignaciones/_components/filtro-tienda";
import { filtrarAsignaciones } from "@/app/(app)/mis-asignaciones/_components/mis-asignaciones-buscador";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

function orden(id: string, tiendaNombre: string, destinatario: string): MiAsignacionDTO {
  return {
    id,
    numGuia: Number(id.replace(/\D/g, "")) || null,
    numRemision: `REM-${id}`,
    estatusValue: "recolectando",
    destinatario,
    telefonoDest: "70001111",
    direccion: null,
    producto: "Caja",
    peso: 1,
    montoCobrar: null,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre,
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Montes de Oca",
    distritoNombre: null,
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
    marcarLuego: false,
    intentosEntrega: 0,
  };
}

describe("SLT-190 R850 — opciones del filtro «Tienda»", () => {
  it("sin repetir y en orden alfabético (español, sin distinguir acentos ni mayúsculas)", () => {
    const lista = [
      orden("1", "Zapatería Sol", "Ana"),
      orden("2", "Ópticas Luna", "Beto"),
      orden("3", "Zapatería Sol", "Carla"),
      orden("4", "almacén Centro", "Dani"),
    ];
    expect(opcionesTienda(lista)).toEqual(["almacén Centro", "Ópticas Luna", "Zapatería Sol"]);
  });

  it("une todas las listas de la pantalla (Recolección: por recolectar + recogidos hoy)", () => {
    const porRecolectar = [orden("1", "Tienda B", "Ana")];
    const recogidosHoy = [orden("2", "Tienda A", "Beto"), orden("3", "Tienda B", "Carla")];
    expect(opcionesTienda(porRecolectar, recogidosHoy)).toEqual(["Tienda A", "Tienda B"]);
  });

  it("sin órdenes, sin opciones; un nombre vacío no es una opción", () => {
    expect(opcionesTienda([])).toEqual([]);
    expect(opcionesTienda([orden("1", "  ", "Ana")])).toEqual([]);
  });
});

describe("SLT-190 R851 — filtrar por tienda", () => {
  const lista = [
    orden("1", "Tienda A", "Ana Rojas"),
    orden("2", "Tienda B", "Ana Mora"),
    orden("3", "Tienda A", "Beto Solís"),
  ];

  it("deja solo las órdenes de la tienda elegida, en su orden", () => {
    expect(filtrarPorTienda(lista, "Tienda A").map((o) => o.id)).toEqual(["1", "3"]);
  });

  it("`\"\"` = todas", () => {
    expect(filtrarPorTienda(lista, "").map((o) => o.id)).toEqual(["1", "2", "3"]);
  });

  it("se compone con el término del buscador (término AND tienda)", () => {
    const conTermino = filtrarAsignaciones(lista, "ana");
    expect(filtrarPorTienda(conTermino, "Tienda A").map((o) => o.id)).toEqual(["1"]);
    expect(filtrarPorTienda(conTermino, "Tienda B").map((o) => o.id)).toEqual(["2"]);
  });
});
