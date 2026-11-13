import { describe, expect, it } from "vitest";

import { destinoDeOrden } from "@/app/(app)/mis-asignaciones/_components/pos-card/pos-format";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-125 (design §5 fila «Destino de navegación»; R14, R15) — el texto del destino de navegación de la
// tarjeta POS: la dirección y TODA la ruta de la orden, del lugar más hondo al nivel 1, unidos por «, »
// como hoy. Sin `lugarRuta`, los tres nombres de hoy. Los textos esperados son literales; los nombres de
// los países de 2 y 4 niveles son inventados (R42).

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: "Ana",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    producto: "Caja",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    ...over,
  };
}

const ruta = (...nombres: string[]) => nombres.map((nombre, i) => ({ id: `n-${i + 1}`, nombre }));

describe("R14 — destino de navegación: dirección + ruta del más hondo al nivel 1", () => {
  it("país de 2 niveles", () => {
    const orden = makeOrden({
      direccion: "Calle 30 #12",
      provinciaNombre: "Bolívar",
      cantonNombre: "Cartagena",
      distritoNombre: null,
      lugarRuta: ruta("Bolívar", "Cartagena"),
    });
    expect(destinoDeOrden(orden).texto).toBe("Calle 30 #12, Cartagena, Bolívar");
  });

  it("país de 4 niveles (la ruta de la orden llega al nivel 3 hasta SLT-48)", () => {
    const orden = makeOrden({
      direccion: "Av. Libertad 99",
      provinciaNombre: "Costa",
      cantonNombre: "Litoral",
      distritoNombre: "Viña",
      lugarRuta: ruta("Costa", "Litoral", "Viña"),
    });
    expect(destinoDeOrden(orden).texto).toBe("Av. Libertad 99, Viña, Litoral, Costa");
  });

  it("una ruta de 4 pasos entra entera, del más hondo al nivel 1", () => {
    const orden = makeOrden({ direccion: "Lote 4", lugarRuta: ruta("Alfa", "Beta", "Gama", "Delta") });
    expect(destinoDeOrden(orden).texto).toBe("Lote 4, Delta, Gama, Beta, Alfa");
  });

  it("sin dirección ni nombres vacíos: lo que falta se omite", () => {
    const orden = makeOrden({ direccion: null, lugarRuta: ruta("Alfa", "", "Gama") });
    expect(destinoDeOrden(orden).texto).toBe("Gama, Alfa");
  });

  it("las coordenadas no cambian", () => {
    const orden = makeOrden({ latitud: 9.93, longitud: -84.08, lugarRuta: ruta("Alfa", "Beta") });
    expect(destinoDeOrden(orden)).toMatchObject({ lat: 9.93, lng: -84.08 });
  });
});

describe("R15 — Costa Rica: el mismo texto que hoy", () => {
  it("con la ruta de 3 niveles", () => {
    const orden = makeOrden({ lugarRuta: ruta("San José", "Escazú", "San Rafael") });
    expect(destinoDeOrden(orden).texto).toBe("200m sur de la iglesia, San Rafael, Escazú, San José");
  });

  it("sin `lugarRuta`, los tres nombres de hoy dan la misma cadena", () => {
    expect(destinoDeOrden(makeOrden()).texto).toBe("200m sur de la iglesia, San Rafael, Escazú, San José");
  });

  it("una orden sin distrito (P7)", () => {
    const conRuta = makeOrden({ distritoNombre: null, lugarRuta: ruta("San José", "Escazú") });
    const sinRuta = makeOrden({ distritoNombre: null });
    expect(destinoDeOrden(conRuta).texto).toBe("200m sur de la iglesia, Escazú, San José");
    expect(destinoDeOrden(sinRuta).texto).toBe("200m sur de la iglesia, Escazú, San José");
  });
});
