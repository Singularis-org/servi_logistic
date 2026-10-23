# SL-37 — Rastreo público: fecha UTC con «GMT+00:00»

> Zona: backend · Complejidad: small · Rama: `feature/SL-37-rastreo-fecha-utc`
>
> **Alcance.** `formatearEnZona` (`lib/services/RastreoPublicoService.ts`) arma la fecha ISO-8601 con
> `Intl.DateTimeFormat(..., { timeZoneName: "longOffset" })`. En UTC, Node 24.13.0 devuelve «GMT» y
> Node 24.21.0 (CI) devuelve «GMT+00:00». El código solo convertía la cadena vacía en `Z`, así que en
> CI la fecha salía con `+00:00` y `tests/unit/services/rastreo-publico-service.test.ts` fallaba.
>
> **Lo que NO entra.** Cambiar el formato de salida, el locale o cualquier otra zona.
>
> Revisado antes de especificar: no hay spec previo en `specs/` sobre este desfase.

## Requisitos (EARS)

- **R1.** CUANDO `Intl` devuelva para el desfase cualquiera de las tres formas de UTC —«» (vacío),
  «GMT» o «GMT+00:00»— el sistema DEBERÁ escribir el desfase como `Z`.
- **R2.** CUANDO `Intl` devuelva un desfase distinto de cero («GMT±HH:MM»), el sistema DEBERÁ
  escribirlo como `±HH:MM`, igual que antes.

## Preguntas abiertas

Ninguna. Arreglo aprobado por el humano (Carlos, 2026-10-22).
