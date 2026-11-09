# review SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — S1 «Detalle de cierre único: componente base»

reviewer · 2026-11-09 · rama `feature/SLT-95-detalle-cierre-rediseno` · diff `origin/dev...HEAD`
(código en 82ba546b y 8f0a4d87). Alcance: solo la sección S1 de `tasks.md` y los R marcados [S1]
(R1-R16, R20) más R71/R72. Las demás rebanadas son SLT-100 a SLT-115.

## Checklist

- [x] Ruta: completa (complexity high, toca la presentación del dinero). requirements + design + tasks.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: `Cuenta.tsx`
      frente a `CascadaDinero` está justificado en la alternativa descartada 5 y en la tabla de
      sustituciones (S16 retira la vieja).
- [ ] Tasks: T0.1-T3.2 `[x]`; **T4.1 sigue `[ ]`** (B2).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 13/40 archivos, 3123/1000 líneas, con
      `tamano-pr-aceptado` de Carlos (2026-11-09) en `progress/features/SLT-95.md`.
- [ ] Trazabilidad: todos los R de S1 tienen test, pero **R2 solo está verificado en parte** (B1).
- [x] Mapa R → test en `progress/impl_SLT-95.md`.
- [x] Tests propios corridos contra `slt95_s1`: 6 archivos, 132/132 (los 3 nuevos, B7 de
      `DineroIdentidadesEnPantalla`, `liquidacion-money-safe` y `CierreBodegaDetalleCascadas`).
      Guardias `superficie-de-uso` y `cierre-detalle-superficies`: 22/22. Typecheck, lint y guardias
      completas: gate del leader en verde (INIT_EXIT=0).
- [x] Dinero intacto (R72): nada en `lib/`, `db/`, `app/api/` ni migraciones. El movimiento de
      `lineasCascadaCentral`/`lineasCascadaDueno` a `cascadas-bodega.ts` es equivalente: comparé el
      bloque borrado con el nuevo sin las importaciones y sin `export`, y son idénticos línea a
      línea. `CierreBodegaDetalleCascadas.test.tsx` no está en el diff y sigue verde.
- [x] R71: ningún `Number(`/`parseFloat`/`toFixed` en `components/private/cierres/`. El censo de
      money-safe se amplía con auto-captura de la carpeta y contraprueba sobre `Cuenta.tsx`.
- [x] Sin literales de país ni moneda pintados (rótulos por `money()`, `IMPUESTO_ROTULO`,
      `METODO_LABEL`, `EMPRESA.enFrase`). Nada de Ordenex. Sin dependencias nuevas.
- [x] Trato «tú»: ninguna forma de «vos» ni de «usted» en los textos nuevos.
- [ ] **E2E locales: sin constancia** (B3).
- [x] Comentarios: explican el porqué.
- MCP del grafo: no lo consulté. Trabajé con Grep/Read y git sobre el worktree.

## Mutaciones (aplicadas por mí, cada una revertida con `git checkout`; `git status` limpio al final)

| Mutación | Resultado |
|---|---|
| Dinero: el subtotal «Sale de lo recaudado» de la cuenta factura toma `fleteConIva` en vez de `cobradoSobreRecaudado` | **muerta**, 5 rojos (vista, DOM y 3 de B7) |
| Audiencia: la franja de bodega cambia el texto de la satélite por el de la central y al revés | **muerta**, 1 rojo |
| Audiencia: el título «Tu cierre del día» se pierde con audiencia mensajero | **muerta**, 1 rojo |
| R8: contextos de las cifras (conciliación, pago a mensajeros, dos notas de «Le queda», «Tu ganancia», «Gestiones»), 6 mutaciones | todas muertas |
| R4: vencido central, `motivoBloqueo` en curso, bloqueo vencido del mensajero | las 3 muertas |
| R12: pie con paquetes y nodo de conciliación · R14: rótulos según el modelo (2) · R10: «Corregir» solo en rechazado · `conPago` sin estado aprobado | todas muertas |
| Adaptadores: paquetes de barridas, incidentes sin indemnizar, mensajeros distintos | las 3 muertas |
| **R2: `fechasMensajero` deja de pintar la resolución («Aprobado/Rechazado <fecha> por <quién>»)** | **SOBREVIVE**, 100/100 verde |
| **R2: `fechasBodega` deja de pintar «Recibido <fecha> por <quién>»** | **SOBREVIVE**, 100/100 verde |

## Hallazgos

### BLOQUEANTE

- **B1 — R2 verificado solo en parte.** R2 pide la identidad completa en la cabecera: fechas de
  solicitud y de resolución con quién resolvió, y en bodega quién lo solicitó, el número de
  mensajeros y la fecha de recibido. Los tests solo comprueban el badge de estado, el título y
  «destino · folio · Solicitado <fecha>». Las dos mutaciones de arriba quedan verdes, y ningún test
  afirma tampoco el subtítulo de bodega («Bodega satélite · lo solicitó Sara Satélite · 2
  mensajeros») ni la fecha de vencido («Del … · venció sin solicitarse»).
  **Qué falta:** en `DetalleCierre.test.tsx`, aserciones con literales sobre:
  1. un cierre aprobado y otro rechazado con `resueltoAt` y `resueltoPorNombre`;
  2. una bodega con `conciliadoAt` y `conciliadoPorNombre`;
  3. el subtítulo de bodega;
  4. la línea de vencido.

  Cada una debe matar su mutación, y la prueba de que la mata va anotada en `impl_SLT-95.md`.
- **B2 — T4.1 sin marcar.** `CHECKPOINTS.md > Completa` exige todas las tasks en `[x]`. El gate ya
  está verde según el leader y R72 está comprobado arriba, así que solo falta marcarla y anotar la
  salida del gate en `impl_SLT-95.md`.
- **B3 — Falta la constancia de los E2E locales** (`docs/perfil-agentes.md > Todos los agentes` y
  `> reviewer`). El diff toca una pantalla montada, `CierresBodegaAdminModule.tsx` de
  `/cierres-admin`, y las funciones que pintan sus cascadas de dinero. `impl_SLT-95.md` no recoge
  ningún E2E corrido. No hace falta cambiar código: basta correr en base desechable nueva, con
  `NEXT_PUBLIC_APP_URL` como en `gate.yml`, al menos:
  - los specs que leen esas cascadas o ese detalle: `e2e/ajuste-pago-mensajero-cierre.spec.ts`,
    `e2e/cierre-bodega-satelite.spec.ts` y `e2e/cierres-admin.spec.ts`;
  - el grupo `--project=dinero`.

  La salida va a `impl_SLT-95.md`. Sin esto, el leader no abre el PR según la regla del perfil.

### menor

- **m1 — Contradicción en el spec: R9 frente a R14/R16** (la decisión 1 del implementador). La última
  cláusula de R9 («una misma cifra no con dos rótulos dentro de una pestaña») choca con lo que R14 y
  R16 piden de forma literal:
  - `cobradoSobreRecaudado` aparece como «Se lo cobra la empresa» y como «Sale de lo recaudado»;
  - en bodega, `paraLaCentral` aparece como «A la central» y «Para la central»;
  - `totales.general` aparece como «Total general»;
  - `totalIngresoBodegaRechazos` aparece como «A la bodega satélite» y «Gana la bodega satélite».

  El canvas aprobado hace lo mismo (`Main.dc.html`), aunque su nota n2, regla 2, dice «Cada cifra
  una vez, un nombre». Seguir R14/R16 y el canvas es correcto para S1: no es un defecto del
  implementador. Hay que llevarlo a Carlos y corregir R9 (o R14/R16) antes de SLT-100 «Detalle de
  cierre único en /cierres-admin (mensajeros)» y de SLT-104 (S6 «Detalle de cierre de bodega en el
  detalle único (central)»), que son las que lo hacen visible.
- **m2 — Barra de reparto sin % hasta SLT-111 «Cifras del servidor: reparto en % y señales de la
  cola»** (la decisión 2 del implementador). Se acepta: calcular el % en el cliente rompe R71, y R70 lo
  manda al servidor. Hasta entonces el reparto pinta solo la leyenda, lo que se aparta del canvas.
  Conviene que Carlos lo sepa cuando lo vea en Preview con SLT-100. El camino con porcentajes
  (`conBarra`) no tiene test. Lo cubre SLT-111.
- **m3 — `@sin-superficie` en los 6 módulos: aceptables como puente hasta SLT-100.** Es el mecanismo
  que documenta la guardia `superficie-de-uso` (anotación junto al export, motivo real, no es una
  allowlist). Las 6 nombran a la ficha que monta el componente, y la guardia obliga a quitarlas en
  cuanto `DetalleCierre` sea alcanzable desde una ruta. Recomendación: que el `tasks.md` de SLT-100
  lo diga en una task explícita.
- **m4 — Fechas en formato «2026-11-07 18:42»;** el canvas usa «07/11/2026 18:42». Es coherente con
  lo que el módulo pinta hoy (`fechaCalendarioCR`). Conviene confirmarlo con Carlos en el Preview de
  SLT-100.
- **m5 — «12 entregas · 7 vuelven o con novedad»;** el canvas dice «12 entregadas». El cambio lo
  fuerza la guardia del estado retirado (8f0a4d87) y el comentario explica el porqué. Aceptable.
- **m6 — «y quién» de la resolución (R2) no llega del servidor.** `ICierresAdminService` solo expone
  `resueltoAt`, y `vistaMensajeroDesdeAdmin` no rellena `resueltoPorNombre`. El componente lo
  soporta, pero en SLT-100 la cabecera saldrá sin nombre. T0.2 no lo listó entre los campos que
  había que confirmar. Hay que anotarlo para SLT-100 (o para la rebanada fullstack que corresponda).
- **m7 — `metodo: "SINPE"` en `metodosVisibles`.** Es la clave del método de pago del dominio, y el
  texto sale de `METODO_LABEL`, así que no es un literal pintado. Para no repetir la unión a mano,
  convendría tiparlo con el tipo de método existente.

## Respuestas a los puntos pedidos

1. **Trazabilidad:** todos los R de S1 mapean a un test real, salvo R2, que está parcial (B1). Las
   mutaciones pedidas, una de dinero o cascada y una de props o audiencia (más 18 adicionales),
   mueren. Las dos que sobreviven son de R2.
2. **Dinero:** sin cambios de cálculo. El movimiento a `cascadas-bodega.ts` es equivalente y sus
   tests siguen iguales y en verde.
3. **Canvas:**
   - Nombres de las cifras: los del canvas.
   - Formato de cascada: operador delante, subtotal punteado y total en negrita.
   - Métodos en 0: ocultos. Trato: «tú».
   - Reutiliza `Dialog`, `Tabs`, `Badge`, `Button`, `EstadoCierreBadge`, `RetieneReprogramadasBadge`
     y `ConciliacionAcciones` (por nodo). No inventa controles.
   - Desvíos: m1, m2, m4 y m5, todos justificados.
4. **`@sin-superficie`:** aceptables (m3).
5. **Decisiones del implementador:** las dos se aceptan (m1 y m2). La de R9 es un defecto del spec
   que tiene que decidir Carlos.

## Veredicto

**RECHAZADO (CAMBIOS)**: B1 (tests de R2), B2 (T4.1) y B3 (constancia de los E2E). El código de S1
es correcto. Lo que falta son tests, una marca en `tasks.md` y evidencia, sin cambios de lógica.
