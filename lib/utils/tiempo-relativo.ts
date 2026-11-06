// FICHA 409 (T1.1, design §3.4, R31/R32/R33) — EL INSTANTE RELATIVO DE UN AVISO, EN PALABRAS.
//
// MODULO PURO: sin Prisma, sin React, sin `next/*`, sin `Intl` y —lo importante— SIN LEER EL
// RELOJ. El «ahora» entra por parametro, asi que la funcion es determinista y se prueba con reloj
// fijo. Quien la llama es `NotificacionService.listar`, con el reloj YA inyectable que ese servicio
// tiene desde la 146.
//
// ⚠️ POR QUE SE RESUELVE EN EL SERVIDOR Y NO EN EL COMPONENTE (R31/R32). La campana se renderiza
// dentro de un layout de servidor, asi que un `Date.now()` en render produciria DOS textos
// distintos para el mismo nodo y romperia la hidratacion — la misma leccion que ya esta escrita en
// `hooks/usePreferenciaSonido.ts`. Podria argumentarse que la lista vive en un portal y solo se
// monta al abrir: eso seria una propiedad ACCIDENTAL del componente de popover, y el dia que
// alguien lo cambiara el fallo seria una discrepancia de hidratacion silenciosa. Una guardia
// (`notifications-bell-sin-reloj.guardia.test.ts`) impide que vuelva al cliente.
//
// CONSECUENCIA DECLARADA Y ACEPTADA: el texto se refresca con el sondeo de 60 s de la campana, asi
// que puede quedarse hasta un minuto congelado.
import { diferenciaEnDiasCalendario, fechaCalendario } from "@/lib/utils/calendario-zona";

const MS_POR_MINUTO = 60 * 1000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;

/**
 * R33 — el instante relativo con la granularidad del contrato visual
 * (`design-notificaciones/Main.dc.html`): «hace N min», «hace N h», «ayer», «hace N d».
 *
 * ⚠️ EL DISCRIMINANTE ES EL DIA CALENDARIO DE LA ZONA, NO «CUANTAS HORAS HAN PASADO» (R33,
 * ultima frase), y la diferencia se ve a las horas en las que a nadie le apetece pensarlo:
 *
 *   · un aviso de las 23:59 leido a las 00:01 lleva DOS MINUTOS, pero es de AYER;
 *   · uno de hace 20 horas leido a media tarde sigue siendo de HOY, y dice «hace 20 h».
 *
 * Un corte por «>= 24 h» se equivocaria en los dos. Por eso los dos instantes se pasan por
 * `fechaCalendario(instante, zona)` (`toISOString().slice(0,10)` esta en UTC y adelanta el dia).
 *
 * SLT-42 (R22, R23) — `zona` es la del pais de la empresa (la lee `NotificacionService`). Los dias
 * se cuentan en el CALENDARIO, asi que un dia de 23 o 25 h cuenta como uno.
 *
 * Con eso, la tabla entera:
 *   · mismo dia, < 1 min   -> «hace un momento» (un «hace 0 min» es texto roto);
 *   · mismo dia, < 1 h     -> «hace N min»;
 *   · mismo dia            -> «hace N h»;
 *   · dia anterior         -> «ayer»;
 *   · N dias atras         -> «hace N d».
 *
 * FUTURO: un `desde` posterior a `ahora` (reloj desajustado, fila sembrada a mano) NO produce
 * negativos ni un «hace -1 d»; cae en «hace un momento». La direccion segura del error es no
 * mentir con un numero.
 */
export function tiempoRelativo(desde: Date, ahora: Date, zona: string): string {
  const dias = Math.max(
    0,
    diferenciaEnDiasCalendario(fechaCalendario(desde, zona), fechaCalendario(ahora, zona)),
  );
  if (dias >= 2) return `hace ${dias} d`;
  if (dias === 1) return "ayer";

  const transcurrido = ahora.getTime() - desde.getTime();
  if (transcurrido < MS_POR_MINUTO) return "hace un momento";
  if (transcurrido < MS_POR_HORA) return `hace ${Math.floor(transcurrido / MS_POR_MINUTO)} min`;
  return `hace ${Math.floor(transcurrido / MS_POR_HORA)} h`;
}
