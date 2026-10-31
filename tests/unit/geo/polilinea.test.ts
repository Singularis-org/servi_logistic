import { describe, it, expect } from "vitest";
import {
  codificarPolilinea,
  decodificarPolilinea,
  distanciaTotalM,
  distanciaHaversineKm,
  distanciaMinimaAPolilineaM,
} from "@/lib/geo/polilinea";

// Feature 92 (seguimiento) — codificador/decodificador del "Encoded Polyline Algorithm
// Format" de Google. Es el formato que permite dibujar una ruta SIN llamar a ningun
// proveedor: una polilinea no es mas que una lista de lat/lng comprimida.
//
// EL VECTOR DE ABAJO ES EL DE LA DOCUMENTACION OFICIAL DE GOOGLE. Si este test se pone rojo,
// la polilinea que generamos ha dejado de ser compatible con los decodificadores de terceros
// (google.maps, Leaflet, Mapbox) y el mapa dibujaria basura.

const PUNTOS_OFICIALES = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
];
const ENCODED_OFICIAL = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

describe("codificar — compatibilidad con el formato de Google", () => {
  it("reproduce EXACTAMENTE el vector de la documentacion oficial", () => {
    expect(codificarPolilinea(PUNTOS_OFICIALES)).toBe(ENCODED_OFICIAL);
  });

  it("una lista vacia produce una cadena vacia (no lanza)", () => {
    expect(codificarPolilinea([])).toBe("");
  });

  it("un solo punto se codifica como su posicion absoluta", () => {
    const encoded = codificarPolilinea([{ lat: 9.93, lng: -84.09 }]);
    expect(decodificarPolilinea(encoded)).toEqual([{ lat: 9.93, lng: -84.09 }]);
  });
});

describe("decodificar — inversa exacta", () => {
  it("decodifica el vector oficial a sus coordenadas", () => {
    const puntos = decodificarPolilinea(ENCODED_OFICIAL);
    expect(puntos).toHaveLength(3);
    puntos.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(PUNTOS_OFICIALES[i].lat, 5);
      expect(p.lng).toBeCloseTo(PUNTOS_OFICIALES[i].lng, 5);
    });
  });

  it("ida y vuelta conserva las coordenadas con precision de ~1 m", () => {
    // Coordenadas reales de reparto urbano: la precision de 5 decimales debe bastar para
    // que dos paradas de la misma calle no colapsen en el mismo punto.
    const originales = [
      { lat: 9.93333, lng: -84.08333 },
      { lat: 9.93341, lng: -84.08298 },
      { lat: 9.94012, lng: -84.07711 },
    ];
    const vuelta = decodificarPolilinea(codificarPolilinea(originales));
    expect(vuelta).toHaveLength(originales.length);
    vuelta.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(originales[i].lat, 5);
      expect(p.lng).toBeCloseTo(originales[i].lng, 5);
    });
  });

  it("cadena vacia -> lista vacia", () => {
    expect(decodificarPolilinea("")).toEqual([]);
  });

  it("una cadena TRUNCADA devuelve los puntos leidos, sin lanzar", () => {
    // El mapa es una ayuda visual: media ruta dibujada es mejor que una pantalla rota.
    const completa = codificarPolilinea(PUNTOS_OFICIALES);
    const truncada = completa.slice(0, completa.length - 3);
    expect(() => decodificarPolilinea(truncada)).not.toThrow();
    expect(decodificarPolilinea(truncada).length).toBeLessThan(3);
  });
});

describe("distancias", () => {
  it("la distancia total suma los tramos en linea recta", () => {
    const puntos = [
      { lat: 9.93, lng: -84.09 },
      { lat: 9.94, lng: -84.08 },
      { lat: 9.95, lng: -84.07 },
    ];
    const esperado = Math.round(
      (distanciaHaversineKm(puntos[0], puntos[1]) +
        distanciaHaversineKm(puntos[1], puntos[2])) *
        1000,
    );
    expect(distanciaTotalM(puntos)).toBe(esperado);
  });

  it("con menos de dos puntos la distancia es 0, nunca NaN", () => {
    expect(distanciaTotalM([])).toBe(0);
    expect(distanciaTotalM([{ lat: 9.93, lng: -84.09 }])).toBe(0);
  });
});

// SLT-59 (R3, R4) — distancia minima de la posicion del mensajero a la linea de su ruta. Es la
// medida de «desviarse de la ruta dada»: si saliera grande para alguien que va POR la ruta, cada
// disparo pagaria una reoptimizacion; si saliera pequena para alguien que se aparto, el orden
// se quedaria viejo. Las referencias se calculan con Haversine, no con la funcion que se prueba.
describe("SLT-59 — distanciaMinimaAPolilineaM", () => {
  /** Grados de longitud que suman `metros` hacia el este a la latitud `lat`. */
  const gradosLngParaMetros = (metros: number, lat: number) =>
    metros / ((6371 * 1000 * Math.PI) / 180) / Math.cos((lat * Math.PI) / 180);
  /** Grados de latitud que suman `metros` hacia el norte. */
  const gradosLatParaMetros = (metros: number) => metros / ((6371 * 1000 * Math.PI) / 180);

  // Un tramo norte-sur de ~5,5 km sobre el meridiano -84.0.
  const TRAMO = [
    { lat: 9.9, lng: -84.0 },
    { lat: 9.95, lng: -84.0 },
  ];

  it("un punto SOBRE el segmento esta a ~0 m", () => {
    expect(distanciaMinimaAPolilineaM({ lat: 9.92, lng: -84.0 }, TRAMO)).toBeLessThan(0.5);
  });

  it("un punto al costado esta a la distancia perpendicular conocida", () => {
    const lateral = { lat: 9.92, lng: -84.0 + gradosLngParaMetros(500, 9.92) };
    const pie = { lat: 9.92, lng: -84.0 };
    const esperado = distanciaHaversineKm(lateral, pie) * 1000;
    expect(esperado).toBeCloseTo(500, 0);
    expect(Math.abs(distanciaMinimaAPolilineaM(lateral, TRAMO) - esperado)).toBeLessThan(1);
  });

  it("un punto MAS ALLA de un extremo mide hasta ese extremo, no hasta la recta infinita", () => {
    // Sobre la prolongacion del meridiano: a la recta le distaria 0, al segmento 1200 m.
    const pasado = { lat: 9.95 + gradosLatParaMetros(1200), lng: -84.0 };
    const esperado = distanciaHaversineKm(pasado, TRAMO[1]) * 1000;
    expect(Math.abs(distanciaMinimaAPolilineaM(pasado, TRAMO) - esperado)).toBeLessThan(1);
    expect(distanciaMinimaAPolilineaM(pasado, TRAMO)).toBeGreaterThan(1000);
  });

  it("con varios segmentos se queda con el MAS cercano", () => {
    // Una L: norte y luego este. El punto queda junto al segundo tramo, lejos del primero.
    const ele = [...TRAMO, { lat: 9.95, lng: -83.95 }];
    const junto = { lat: 9.95 - gradosLatParaMetros(300), lng: -83.97 };
    const esperado = distanciaHaversineKm(junto, { lat: 9.95, lng: -83.97 }) * 1000;
    expect(Math.abs(distanciaMinimaAPolilineaM(junto, ele) - esperado)).toBeLessThan(1);
  });

  it("con UN solo punto es la distancia Haversine a ese punto", () => {
    const a = { lat: 9.93, lng: -84.09 };
    const b = { lat: 9.94, lng: -84.08 };
    expect(distanciaMinimaAPolilineaM(a, [b])).toBeCloseTo(distanciaHaversineKm(a, b) * 1000, 6);
  });

  it("vertices repetidos (uniones de tramos) no producen NaN", () => {
    const repetidos = [TRAMO[0], TRAMO[0], TRAMO[1]];
    expect(Number.isNaN(distanciaMinimaAPolilineaM({ lat: 9.92, lng: -84.0 }, repetidos))).toBe(false);
    expect(distanciaMinimaAPolilineaM({ lat: 9.92, lng: -84.0 }, repetidos)).toBeLessThan(0.5);
  });

  it("sin vertices devuelve +Infinity (no inventa una linea)", () => {
    expect(distanciaMinimaAPolilineaM({ lat: 9.92, lng: -84.0 }, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it("sobre una polilinea decodificada (ida y vuelta) mide igual que sobre los puntos", () => {
    // Es el camino real: la linea de referencia llega CODIFICADA desde la cabecera de la ruta.
    const ruta = [
      { lat: 9.93333, lng: -84.08333 },
      { lat: 9.93841, lng: -84.08298 },
      { lat: 9.94012, lng: -84.07711 },
    ];
    const decodificada = decodificarPolilinea(codificarPolilinea(ruta));
    const sobre = { lat: 9.93587, lng: -84.083155 }; // punto medio del primer segmento
    const lejos = { lat: 9.95, lng: -84.07711 };
    expect(distanciaMinimaAPolilineaM(sobre, decodificada)).toBeLessThan(2);
    // La precision del formato (~1 m) no puede mover la medida mas de un par de metros.
    expect(
      Math.abs(
        distanciaMinimaAPolilineaM(lejos, decodificada) - distanciaMinimaAPolilineaM(lejos, ruta),
      ),
    ).toBeLessThan(2);
    expect(distanciaMinimaAPolilineaM(lejos, decodificada)).toBeCloseTo(
      distanciaHaversineKm(lejos, ruta[2]) * 1000,
      -1,
    );
  });
});
