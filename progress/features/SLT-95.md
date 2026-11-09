# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-95 | detalle-cierre-rediseno | frontend | high | feature/SLT-95-detalle-cierre-rediseno | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-95-detalle-cierre-rediseno/`. Rama desde `dev` (e9aa915f).

## Evaluación
Tarjeta: zone frontend, complexity high. La descripción incluye piezas que pueden tocar servidor (pago al mensajero en Incidente de /cierre-dia y su Excel; títulos de Excel según modelo; verFulfillment por audiencia en bodega): el spec confirma la zona.

## Decisiones
- 2026-11-08, Carlos: canvas aprobado https://claude.ai/artifact/2Nci9ebPPdHs58rHZTwz7C. Opción A: UN componente (tipo mensajero|bodega) para «Ver detalle» y «Ver / decidir» del mensajero y «Ver / decidir» de bodega. Fila desplegada opción 2: 4 tarjetas en 2x2, «Ver cómo se calculó» = una tarjeta por concepto. «Le queda a la empresa» es la única cifra de ganancia; se quita «Debe». Métodos de pago en 0 no se muestran. Sin cambios de dinero.
- Copia del canvas en `specs/SLT-95-detalle-cierre-rediseno/canvas/project/` (canvas.json con notas n1/n2 = diferencias por tipo y reglas; Main.dc.html = el componente; Fila2.dc.html = fila desplegada elegida).

- 2026-11-09, Carlos sobre el spec v1:
  - PA1: acepta el corte C → A1 → A2 → B (una ficha por rebanada).
  - PA2: TODAS las cifras del canvas van («ser fiel al diseño aprobado»): la rebanada D deja de ser opcional (fullstack).
  - PA3: la parte de bodega NO está diseñada: pasar por /design todo el flujo satélite — el cierre que aprueba la bodega satélite (sus mensajeros) y la consolidación satélite → central con sus componentes (A consolidar/Solicitados, conciliación, Marcar recibido/Corregir/Desmarcar, estado de cuenta). «No dejes nada por fuera.» Bodega no se especifica hasta que apruebe ese canvas.
  - PA4: NO se oculta «Rechazados por la tienda» sin rechazos; se muestra con su estado vacío.
  - PA7 (código muerto a chore aparte): aceptado.
  - PA5: se retira la impresión del detalle del admin (ficha 223): «creo que no lo están usando»; quien necesite algo usa el botón de descarga (Excel).
  - PA6: el Excel debe funcionar solo con el modelo nuevo; proponer un documento NUEVO para el modelo nuevo (diseño de columnas a aprobar por Carlos). Pendiente: qué pasa con los cierres del modelo viejo y si la empresa ya activó tarifas nuevas.

- 2026-11-09, Carlos tras ver el canvas de bodega: es un REDISEÑO COMPLETO del módulo de cierres, «no dejes absolutamente nada fuera». Lo que hace la satélite con sus mensajeros es lo mismo que hace la central con los suyos: componentes IGUALES con props distintas, nunca uno por rol. Se vuelve al diseño inicial para unificar: cola de cierres, detalle, fila de gestión y diálogos como componentes únicos parametrizados (tipo mensajero|bodega × rol central|satélite|mensajero). Faltaban: cola de la central, todos los diálogos de decisión y los de la central (registrar/anular pago, corregir métodos, corregir resultado).

- 2026-11-09, Carlos: las tarjetas con mucha información (fila desplegada, cálculo, conciliación) llevan el formato de las cascadas de la pestaña Dinero: partidas en líneas simples, «−»/«+» delante, raya y total en negrita. Barra de filtros y descarga = componentes existentes (BuscadorFiltros + DescargarDatasetButton).
- 2026-11-09, Carlos sobre el Excel: los cierres del modelo viejo SÍ se siguen descargando con el formato actual; el documento nuevo es para el modelo nuevo. No sabe si la empresa ya activó las tarifas nuevas (medir en prod con script de solo lectura).

- 2026-11-09, Carlos APROBÓ el canvas completo (versión 33 del artifact, commit en la rama): «ya revise el diseno y lo veo super bien, ahora si podemos arrancar». Incluye las notas de la página Central (cifras nuevas = rebanada D; cambios de comportamiento propuestos).

- 2026-11-09, medido en prod (script de solo lectura, corrido por Carlos): `tarifa_valor` = 0 filas; `cierre_detail` = 918 gestiones, TODAS `tarifa_modelo = viejo`. La empresa NO ha activado el modelo nuevo: hoy todo cierre en prod es del modelo viejo.

- 2026-11-09, Carlos sobre el spec v2: PA1 según recomendación (tarjetas de «Solicitados» fuera del filtro de fecha, la lista sí lo respeta); PA2 sí (la página muestra primero el cierre que pide acción); PA3 aprueba el Excel del modelo nuevo tal como está en design.md. La aprobación del spec queda pendiente de su respuesta sobre la versión del arnés.
- 2026-11-09, Carlos APROBÓ el spec v2 (F1.4), por escrito: «entonces spec aprobada, comienza». SLT-95 se queda con S1; S2–S17 van como fichas nuevas con sus dependencias.

- 2026-11-09, Carlos: «unificamos». Una cifra, un nombre: la barra de reparto usa el nombre de la cuenta/cifra («Se le paga hoy a la tienda», «Sale de lo recaudado», «Debe llegar a la central», «Pago a mensajeros», «Gana la bodega satélite»). R14 y R16 corregidos; resuelve el choque con R9 que marcó el reviewer.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre

<!-- tamano-pr-aceptado: 2026-11-09 · Carlos: «no separemos código para que no hayan daños, va dentro lo justo y necesario lo demás va en otro pr». S1 = componente base + sus tests (3122 líneas, ~1320 de tests). -->
