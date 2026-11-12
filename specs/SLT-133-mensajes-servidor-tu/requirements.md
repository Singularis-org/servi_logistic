# SLT-133 «Mensajes del servidor de cierres en tú y con tildes» — requirements (ruta ligera)

> Ruta: **ligera** (`complexity: low`, zona backend). Escrito por spec_author el 2026-11-11 sobre el
> árbol del worktree `SLT-133-mensajes-servidor-tu` (rama de `dev` tras el merge de SLT-103, `7bedada3`).
>
> **Rebanada 2** de SLT-103 «Diálogos del módulo de cierres y trato tú» (PA1, Carlos, 2026-11-11).
> Los R56, R141 (segunda frase), R144 (filas L1-N1) y R146 son **copia tal cual** de
> `specs/SLT-103-dialogos-trato-tu/requirements.md > Fuera de alcance` / `> Requisitos (EARS)`, con su
> número. `## Definiciones` y `## Anexo A` viven en ese archivo; aquí se citan. La rebanada 3 es
> SLT-134 «Textos de pantalla de cierres en tú, con guardia».

## Lo que ya existe

Buscado en el board (`feature_list.json`: «SLT-133», «SLT-134», «trato», «voseo»), en `specs/`
(«ConsolidacionBodegaService», «MSG_CATALOGO», «voseo») y en el código (Grep: el grafo no se consultó;
`lib/`, `app/`, `tests/`, `e2e/`).

- Ninguna otra ficha cambia estos mensajes. SLT-103 los dejó aquí (`## Inventario`, filas SLT-133).
- **`ConsolidacionBodegaService` no existe en el código.** Es el nombre del madre (SLT-95) para
  `CierreBodegaService` (`SLT-103 > Definiciones`); solo aparece en `specs/`. No hay textos extra.
- Los tests que hoy afirman los textos viejos están listados en `## Tests que afirman hoy el texto viejo`.

## Alcance

- Cambiar a «tú» y con tildes los mensajes de `CierreDiaService`, `CierreBodegaService` y
  `CierresAdminService` de las filas L1-N1 del `## Anexo A` de SLT-103, `MSG_CATALOGO` incluido (L10, PA5).
- Actualizar al texto nuevo los tests que hoy afirman el viejo, también los de pantalla que reciben el
  mensaje del servidor, y añadir un test con el literal nuevo para cada mensaje que hoy no lo tiene.

## Lo que NO entra

- Cualquier cambio de lógica, importe, estado, permiso, `status`, campo de respuesta o contrato (D5, R146).
- Los textos de pantalla (filas A1-K4 del Anexo A) y la guardia `cierres-trato-tu`: SLT-134.
- Los mismos textos sin tilde en servicios **fuera del censo** (`MSG_CATALOGO_INCOMPLETO` y similares,
  ver `## Inventario`, nota 2): se dejan así (decisión P1).
- Comentarios del código (no son texto; `SLT-103 > Definiciones`).

## Inventario (grep sobre `dev` de hoy, 2026-11-11)

Grep de literales de cadena sobre los tres servicios, leyendo cada coincidencia. **Coincide con el
inventario de SLT-103:** 7 constantes con voseo (6 textos distintos: L3 se repite en dos servicios) y
6 sin voseo pero sin tildes (las 5 de L5-L9 más `MSG_CATALOGO`). 13 constantes, 12 filas del Anexo A.

| Fila | Archivo · constante · línea hoy | Problema | Texto viejo | Texto nuevo (Anexo A) |
|---|---|---|---|---|
| L1 | `CierreDiaService.ts` `MSG_PENDIENTES` 83-84 | voseo (Tenés, gestionalos) | Tenés paquetes en reparto que todavía no gestionaste; gestionalos antes de cerrar. | Tienes paquetes en reparto que todavía no gestionaste; gestiónalos antes de cerrar. |
| L2 | `CierreDiaService.ts` `MSG_VACIO` 85 | voseo (tenes) | No tenes gestiones pendientes de cierre. | No tienes gestiones pendientes de cierre. |
| L3 | `CierreDiaService.ts` `MSG_SIN_ZONA` 90 | voseo (tenes) | No tenes una zona asignada; contacta a tu administrador. | No tienes una zona asignada; contacta a tu administrador. |
| L3 | `CierreBodegaService.ts` `MSG_SIN_ZONA` 38 | voseo (tenes) | No tenes una zona asignada; contacta a tu administrador. | No tienes una zona asignada; contacta a tu administrador. |
| L4 | `CierreDiaService.ts` `MSG_GESTION_DE_LA_TIENDA` 113-114 | voseo (Escribile) | Esta orden la resolvió la tienda; solo ella puede corregirlo. Escribile por el chat de la orden. | Esta orden la resolvió la tienda; solo ella puede corregirlo. Escríbele por el chat de la orden. |
| L5 | `CierreDiaService.ts` `MSG_DUPLICADO` 89 | tildes | Ese cierre ya se envio a aprobacion; actualiza la pagina. | Ese cierre ya se envió a aprobación; actualiza la página. |
| L6 | `CierreDiaService.ts` `MSG_YA_EN_CIERRE` 99 | tildes | Esta gestion ya esta incluida en un cierre solicitado; no se puede deshacer. | Esta gestión ya está incluida en un cierre solicitado; no se puede deshacer. |
| L7 | `CierreDiaService.ts` `MSG_YA_DESHECHA` 100 | tildes | Esta gestion ya fue deshecha. | Esta gestión ya fue deshecha. |
| L8 | `CierreDiaService.ts` `MSG_NO_ES_LA_ULTIMA` 101 | tildes | Esta orden tiene una gestion mas reciente; hay que deshacer esa primero. | Esta orden tiene una gestión más reciente; hay que deshacer esa primero. |
| L9 | `CierreDiaService.ts` `MSG_ORDEN_BORRADA` 103 | tildes | Esta orden fue eliminada; ya no se puede deshacer su gestion. | Esta orden fue eliminada; ya no se puede deshacer su gestión. |
| L10 | `CierreDiaService.ts` `MSG_CATALOGO` 115 | tildes (PA5) | catalogo de estados incompleto (seed pendiente) | catálogo de estados incompleto (seed pendiente) |
| M1 | `CierreBodegaService.ts` `MSG_PENDIENTES` 30-31 | voseo (resolve) | Primero resolve los cierres de tus mensajeros antes de cerrar la bodega. | Primero resuelve los cierres de tus mensajeros antes de cerrar la bodega. |
| N1 | `CierresAdminService.ts` `MSG_CONFIRMACION_SIN_GUIA` 225-226 | voseo (Avisá) | Este paquete no tiene número de guía y no se puede confirmar. Avisá a un administrador. | Este paquete no tiene número de guía y no se puede confirmar. Avisa a un administrador. |

Notas:
1. El resto de mensajes de los tres servicios ya está en «tú» y con tildes (`MSG_ORDEN_MOVIDA`,
   `MSG_VACIO` de bodega, los `MSG_*` de `CierresAdminService`): no se tocan. Ningún componente de
   `app/` compara estos textos (Grep de `includes`/`===`/`match` sobre ellos: 0); la pantalla los pinta tal cual.
2. **Fuera del censo, mismo texto sin tilde:** «catalogo de estados incompleto (seed pendiente)» está
   en 10 sitios de 9 archivos de `lib/services/` (`AsignacionSateliteService`, `GuiaAsignacionService` ×3,
   `MisAsignacionesService`, `RecepcionSateliteService`, `TraspasoMensajeroService`,
   `mensajes-incidente-admin`, `mensajes-correccion-fecha-reprogramacion`, `mensajes-correccion-dia-reparto`,
   `mensajes-deshacer-asignacion`). Tras esta ficha convivirán «catálogo» (cierres) y «catalogo» (resto). Se deja así (decisión P1).

## Tests que afirman hoy el texto viejo

Grep sobre `tests/` y `e2e/` (2026-11-11). **8 archivos**; ningún E2E.

| Archivo | Líneas · fila |
|---|---|
| `tests/unit/services/cierre-dia-service.test.ts` | 1205, 1285 (L4); 2248, 2251, 2271 (L1). L993 usa `/ya fue deshecha/i` (L7): sigue verde, pero no es literal exacto. |
| `tests/unit/services/cierre-dia-477-resolicitud.test.ts` | 33 (L5) |
| `tests/unit/services/cierre-dia-477-deshacer.test.ts` | 32 (L6), 34 (L4), 35 (L8), 37 (L9) |
| `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts` | 299, 552 (N1) |
| `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts` | 166 (L6) |
| `tests/integration/db/cierre-rechazo-tienda-totales.test.ts` | 404 (L2) |
| `tests/integration/db/tarifas-valor-propio-caminos.test.ts` | 1022 (L3, `CierreDiaService`) |
| `tests/components/CierreDiaModule.test.tsx` | 373, 380 (L1 como `motivoBloqueo`); 1315, 1321 (L10 en el toast) |

Sin literal exacto hoy (hay que añadirlo): L2 y L3 en unidad de `CierreDiaService`; L7; L10 en
unidad (`cierre-dia-service.test.ts` l.1383 solo mira `status`); M1 y L3 de bodega
(`cierre-bodega-service.test.ts` l.125 `toBeTruthy`, l.134 `toBeDefined`).

**No se tocan** (texto de pantalla, SLT-134): `CierreDiaModule.test.tsx` l.1619/1686 y
`CierreDiaModule477Correccion.test.tsx` l.269 (J3); `CierresAdminConfirmacionFisica.test.tsx` l.779/1519
(B3). **Tampoco** los tests de servicios fuera del censo que afirman «catalogo…» (`guia-asignacion-service`,
`asignacion-satelite-service`, `traspaso-mensajero-service`, `GenerarGuiaModal`,
`guia-decision-error-message`).

## Decisiones cerradas (heredadas de SLT-103; no reabrir)

| # | Fecha · quién | Decisión | Requisitos |
|---|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. | R146 |
| D6 (regla 7) | canvas n2 (v2) | Un solo trato en todo el módulo: «tú». | R56, R144 |
| PA1 | 2026-11-11 · Carlos | Tres fichas; SLT-133 = mensajes del servidor. | R56, R144 (filas L1-N1), R147 |
| PA5 | 2026-11-11 · Carlos / spec_author | `MSG_CATALOGO` llega a la pantalla: va aquí como fila L10. | R144 (L10), R147 |
| P1 | 2026-11-11 · leader | «catalogo de estados incompleto (seed pendiente)» sin tilde en los 9 servicios fuera de cierres (`## Inventario`, nota 2) se deja así. | R147 |

## Requisitos (EARS)

Copia tal cual de SLT-103 (R56, R141, R144, R146); R147 es de esta ficha. SLT-134 numera desde R148.

- **R56** [S5] — Todos los textos del módulo (pantallas, diálogos, toasts, avisos y mensajes del
  servidor que el módulo muestra) DEBEN usar el trato «tú» y llevar sus tildes. Ningún texto del módulo
  DEBE contener voseo («Indicá», «tenés», «podés», «resolvé»…).

  *En SLT-133 se cumple para los mensajes del servidor de `CierreDiaService`, `CierreBodegaService` y
  `CierresAdminService` (filas L1-N1); la pantalla es SLT-134.*
- **R141, segunda frase** — CUANDO un mensaje del servidor de `## Anexo A` cambia de texto, su `status`
  y el campo donde viaja (`motivo`, `fieldErrors`, `message`) NO DEBEN cambiar.

  *La primera frase (sin saldo) se cumplió en SLT-103. Aquí cubre las 13 constantes de `## Inventario`;
  el campo incluye `motivoBloqueo` (L1, M1), `fieldErrors.zona` (L3), `fieldErrors.estatus` (L10) y
  `fieldErrors[<ordenId>]` (N1).*
- **R144** (filas L1-N1) — Cada texto del `## Inventario` DEBE quedar exactamente como dice
  `## Anexo A`: la misma frase, cambiando solo la forma verbal o el pronombre a «tú» y añadiendo las
  tildes que faltan.
- **R146** — Los cambios de esta ficha NO DEBEN cambiar ningún importe, estado, permiso, clave de
  traducción ni contrato de servicio: solo textos, el visor y el resumen de R140.

  *En SLT-133: solo textos (el visor y R140 eran de SLT-103).*
- **R147** — Los textos sin tilde de servicios fuera del censo de `SLT-103 > Definiciones` (nota 2 del
  `## Inventario`) NO DEBEN cambiar en esta ficha.

## Tasks

- [ ] **T1 — Textos de `CierreDiaService`** (L1-L10, 10 constantes). Hecho: las 10 constantes dicen
  exactamente el texto nuevo de `## Inventario`; ningún otro cambio en el archivo salvo los comentarios
  de esas líneas si citan el texto viejo; `pnpm run typecheck` verde.
- [ ] **T2 [P] — Textos de `CierreBodegaService`** (M1, L3). Hecho: igual que T1 para 2 constantes.
- [ ] **T3 [P] — Texto de `CierresAdminService`** (N1). Hecho: igual que T1 para 1 constante.
- [ ] **T4 — Tests de unidad de servicio** (depende de T1-T3). Hecho:
  - los 4 archivos de unidad de `## Tests que afirman hoy el texto viejo` afirman el texto nuevo;
  - se añade un test con literal exacto para L2, L3 (día), L7, L10 en `cierre-dia-service.test.ts`
    y para M1 y L3 (bodega) en `cierre-bodega-service.test.ts`;
  - **cada literal se escribe a mano en el test**, nunca importado ni leído de la constante del servicio;
  - cada test afirma también `status` y el campo donde viaja el mensaje (R141), con `toEqual` sobre el
    objeto o sobre el campo, no `toContain` ni regex;
  - `pnpm exec vitest related --run` sobre los tres servicios en verde.
- [ ] **T5 — Tests de integración** (depende de T1). Hecho: los 3 archivos de `tests/integration/db/`
  afirman el texto nuevo y pasan contra una base desechable (no la de desarrollo; `.env` copiado al
  worktree antes del gate).
- [ ] **T6 — Test de pantalla** (depende de T1). Hecho: `tests/components/CierreDiaModule.test.tsx`
  l.373/380 y l.1315/1321 usan el texto nuevo, escrito a mano, tanto en la respuesta simulada como en la
  aserción de lo que se pinta; J3 (l.1619/1686) no se toca.
- [ ] **T7 — Contraprueba de los tests.** Hecho: con cada constante devuelta a su texto viejo, al
  menos un test por fila (L1-N1) se pone en rojo; anotado en `progress/features/SLT-133.md` (sin dejar
  el cambio en el árbol).
- [ ] **T8 — R147 y gate.** Hecho: los tests de servicios fuera del censo que afirman «catalogo…»
  siguen verdes sin tocarse; `git diff --stat` solo muestra archivos de `## Archivos esperados`;
  `./init.sh` verde.

Trazabilidad prevista:

| R | Test |
|---|---|
| R56 | los tests de T4-T6, uno por fila L1-N1 (literal nuevo sin voseo) |
| R141 (2.ª) | T4: `status` + campo en cada test de servicio; T5 en integración |
| R144 | T4-T6 (texto exacto por fila) + T7 (contraprueba) |
| R146 | T8 (`git diff --stat` acotado a textos) + suite verde sin cambios en tests de importes |
| R147 | T8 (tests de `guia-asignacion-service`, `asignacion-satelite-service`, `traspaso-mensajero-service` verdes sin cambios) |

## Archivos esperados

Producción:
- `lib/services/CierreDiaService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/services/CierresAdminService.ts`

Tests:
- `tests/unit/services/cierre-dia-service.test.ts`
- `tests/unit/services/cierre-dia-477-resolicitud.test.ts`
- `tests/unit/services/cierre-dia-477-deshacer.test.ts`
- `tests/unit/services/cierre-bodega-service.test.ts`
- `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts`
- `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-totales.test.ts`
- `tests/integration/db/tarifas-valor-propio-caminos.test.ts`
- `tests/components/CierreDiaModule.test.tsx`

Arnés:
- `specs/SLT-133-mensajes-servidor-tu/requirements.md`
- `progress/features/SLT-133.md`

## Tamaño

14 archivos (3 de producción, 9 de tests, 2 del arnés) y ~120-180 líneas de diff: el 35 % de
`gate.tamano_pr` (40) y < 20 % de 1 000 líneas. **La ruta ligera basta:** solo cambian textos; no toca
dinero, permisos, esquema ni migraciones (los servicios son de cierres, pero ningún cálculo ni
autorización cambia, R146). `tests/components/CierreDiaModule.test.tsx` lo toca también SLT-134 (J3):
como SLT-134 depende de esta, van en serie.

## Preguntas abiertas

Ninguna. P1 la resolvió el leader el 2026-11-11 (`## Decisiones cerradas`).
