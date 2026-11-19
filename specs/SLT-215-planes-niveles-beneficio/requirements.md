# SLT-215 — planes-niveles-beneficio · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-215-planes-niveles-beneficio
>
> **Alcance:** niveles de beneficio por volumen de órdenes en cada plan: modelo y migración,
> paso «Niveles» en el formulario del plan (crear y editar, por cambio programado) y columna en
> la tabla de planes del superadmin; cierre mensual que calcula el nivel de cada empresa,
> con historial de subidas y bajadas.
>
> **Lo que NO entra:** el descuento en el cobro de cada orden, la factura y «Mi plan»
> (SLT-216), incluido el ajuste de órdenes ya cobradas cuando un cierre corre tarde; zona horaria
> por empresa (SLT-90); fijar un nivel a mano (no se hace).
>
> Sembrado por `/afinar-feature` el 2026-11-19. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no
> los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Glosario

- **Nivel 0**: la empresa no tiene ningún nivel (cobra sin descuento). No es un nivel del plan: no tiene meta.
- **Nivel n** (n ≥ 1): el n-ésimo nivel del plan, en su orden. Las metas crecen con n.
- **Niveles que corre una empresa**: los de su versión propia del plan si la tiene durante un cambio a medias
  (SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período») y, si no, los
  del plan.
- **Mes**: un mes de calendario con bordes a las 00:00 del día 1 en la zona del período de facturación (hoy la
  hora de la plataforma, −06:00; SLT-86 «Planes: período de facturación de calendario», design §3.1).
- **Cargo vigente al cierre de un mes**: un cargo del cobro de la plataforma (SL-40 «Cobro de la plataforma por
  orden») que no tiene un reverso posterior registrado antes del fin de ese mes.
- **Último mes cerrado** respecto de un instante: el mes anterior al mes que contiene ese instante.

## Requisitos (EARS)

### Los niveles de un plan

- **R1.** El sistema DEBE guardar para cada plan una lista ordenada de 0 a 10 niveles (P2). Cada nivel tiene:
  - una meta: el número de órdenes efectivas al mes, entero, de al menos 1;
  - un descuento, que es un porcentaje o un monto fijo, nunca los dos.

  El número de cada nivel es su posición en la lista, desde 1.
- **R2.** El sistema DEBE dar, para el nivel n de una lista, los descuentos de los niveles 1 a n en orden: los
  descuentos se acumulan y cada uno se calcula sobre el cobro base (ejemplo de la decisión: base 200, nivel 2 con
  10 % y 10 % → 160). Aplicarlos al cobro es de SLT-216 «Planes: descuento por nivel en el cobro, la factura y «Mi
  plan»».
- **R3.** SI la meta de un nivel no es un entero de al menos 1, ENTONCES el sistema DEBE rechazar el guardado con
  «Escribe una meta de al menos 1 orden.» en `niveles.<i>.meta`. SI la meta no es mayor que la del nivel anterior,
  ENTONCES DEBE rechazarlo con «La meta debe ser mayor que la del nivel anterior.» en `niveles.<i>.meta`.
- **R4.** SI el descuento de un nivel es un porcentaje que no está entre 0 (excluido) y 100 (incluido) con hasta dos
  decimales, o un monto que no es mayor que 0 con hasta diez cifras enteras y dos decimales, ENTONCES el sistema
  DEBE rechazar el guardado con el error en `niveles.<i>.descuento.porcentaje` o `niveles.<i>.descuento.monto`.
  SI un nivel trae porcentaje y monto a la vez, ENTONCES DEBE rechazarlo con «Un descuento es porcentaje o monto
  fijo, no los dos.»
- **R5.** SI una lista trae más de 10 niveles, ENTONCES el sistema DEBE rechazar el guardado con «Un plan admite
  hasta 10 niveles.» en `niveles`.
- **R6.** La base DEBE rechazar un nivel que llegue sin pasar por la app con alguno de estos defectos: número fuera
  de 1 a 10, meta menor que 1, ningún descuento o los dos, porcentaje fuera de (0, 100] o monto no positivo. La
  tabla de niveles del plan DEBE quedar cerrada al rol de la app (`servi_app`).

### Formulario por pasos

- **R7.** El formulario del plan DEBE tener un paso «Niveles» justo después de «Beneficios», al crear y al editar.
  Al editar va antes de «Cuándo rige».
- **R8.** En el paso «Niveles», el superadmin DEBE poder:
  - agregar un nivel con «Agregar nivel», al final y con el descuento en porcentaje;
  - escribir su meta;
  - elegir si el descuento es porcentaje o monto fijo y escribir su valor;
  - quitar un nivel; los de después se renumeran.

  Cada fila se rotula «Nivel n». MIENTRAS la lista tiene 10 niveles, «Agregar nivel» DEBE estar deshabilitado.
- **R9.** MIENTRAS la lista está vacía, el paso DEBE mostrar «Este plan no tiene niveles.» y DEBE dejar guardar y
  continuar con la lista vacía.
- **R10.** CUANDO el superadmin pulsa «Guardar y continuar» en «Niveles», el sistema DEBE validar el paso con
  R3–R5 y guardarlo en el borrador del servidor. SI hay errores, ENTONCES el formulario no avanza y pinta cada error
  junto a su campo.
- **R11.** CUANDO se abre o se retoma un borrador con el paso «Niveles» guardado, el formulario DEBE mostrar esos
  niveles en su orden, con su meta y su descuento.
- **R12.** SI se confirma un borrador sin el paso «Niveles» guardado, ENTONCES el sistema DEBE responder
  `pasos_pendientes` con `niveles`.
- **R13.** CUANDO se edita un plan sin borrador, el paso «Niveles» DEBE abrir con los niveles vigentes del plan.
- **R14.** Al crear, el paso «Revisar» DEBE listar los niveles en orden; sin niveles dice «Sin niveles». Al
  editar, la fila «Niveles» DEBE salir solo si los niveles cambian, como «antes → después».

### Alta, edición y rastro

- **R15.** CUANDO se confirma la creación de un plan, el plan DEBE quedar con los niveles del borrador, en su
  orden.
- **R16.** CUANDO se confirma la edición de un plan, los niveles DEBEN ir en la versión del cambio programado
  (SLT-135 «Planes: sin «De inmediato» al editar un plan») y la lista del plan no cambia al programar. MIENTRAS el
  cambio está a medias, cada empresa DEBE correr los niveles de la versión que corre: la nueva si ya recibió el
  cambio y la anterior si no.
- **R17.** CUANDO el cambio programado se promueve al plan, la lista de niveles del plan DEBE quedar igual a la de
  la versión.
- **R18.** SI una versión, programada o propia de una empresa, no trae niveles, ENTONCES el sistema DEBE tratarla
  como «sin cambio en los niveles»: valen los del plan.
- **R19.** CUANDO una edición cambia los niveles, el rastro del plan DEBE guardar la lista de antes y la de después.
  CUANDO se crea un plan con al menos un nivel, la fila «creado» del rastro DEBE incluirlos y el detalle del plan
  pinta «Niveles: <nivel 1>; <nivel 2>; …». Un alta sin niveles no añade nada al rastro.
- **R20.** CUANDO un cambio de plan cambia los niveles, las líneas «Esto es lo que cambia:» DEBEN incluir una línea
  «Niveles por volumen: <antes> → <después>», donde cada lado es la lista de R21 separada por «; » o «Sin niveles»
  (P5).

### Tabla de planes del superadmin

- **R21.** El listado de planes del superadmin DEBE tener una columna «Niveles», después de «Beneficios», con todos
  los niveles del plan, uno por línea: «Nivel n: desde <meta> órdenes, −<p> %» o «Nivel n: desde <meta> órdenes,
  −<monto>», con el monto en el formato del costo por orden y sin moneda. Sin niveles, la celda dice «Sin niveles».

### Órdenes efectivas

- **R22.** El sistema DEBE contar como órdenes efectivas de una empresa en un tramo `[desde, hasta)` las órdenes
  distintas de esa empresa con un cargo registrado en el tramo que sigue vigente en `hasta`. Una orden cuenta una
  sola vez aunque tenga varios cargos en el tramo. Las órdenes anuladas y no recuperadas antes de `hasta` no
  cuentan. Las canceladas por la API conservan su cargo (SL-40 P3) y cuentan (P3).
- **R23.** El sistema DEBE calcular el mes con la zona del período de facturación de hoy (−06:00), la misma que usa
  `plan_inicio_periodo_calendario`, y con una sola definición, de modo que cuando SLT-90 mueva la zona el cierre la
  siga.
- **R24.** SI la empresa entró en su plan después del inicio del mes, ENTONCES el cierre de ese mes DEBE contar solo
  las órdenes desde su entrada y compararlas con la meta completa.

### Cierre mensual

- **R25.** CUANDO se cierra un mes de una empresa y el nivel más alto cuya meta cumplió es mayor que su nivel actual,
  el sistema DEBE subirla directo a ese nivel, con inicio en las 00:00 del día 1 del mes siguiente, y poner a 0 su
  cuenta de meses sin cumplir.
- **R26.** CUANDO se cierra un mes de una empresa con nivel n ≥ 1 y no cumplió la meta del nivel n, el sistema DEBE
  sumar 1 a su cuenta de meses sin cumplir. CUANDO esa cuenta llega a 2, el sistema DEBE bajarla al nivel n − 1, con
  inicio en las 00:00 del día 1 del mes siguiente, y poner la cuenta a 0.
- **R27.** CUANDO se cierra un mes de una empresa con nivel n ≥ 1 que cumplió la meta del nivel n sin cumplir la de
  uno más alto, el sistema DEBE dejarla en el nivel n y poner su cuenta a 0.
- **R28.** MIENTRAS una empresa está en el nivel 0, el cierre NO DEBE bajarla. MIENTRAS el plan que corre no tiene
  niveles, la empresa DEBE quedar en el nivel 0 y el cierre no escribe historial.
- **R29.** El sistema DEBE correr el cierre una vez al día (P1). En cada corrida DEBE cerrar, en orden, cada mes
  terminado que la empresa tenga pendiente, y NO DEBE cerrar dos veces el mismo mes de una empresa: correrlo otra
  vez, o en paralelo, no cambia nada. Un mes cerrado tarde da el mismo resultado y el mismo inicio (día 1) que
  cerrado a tiempo.
- **R30.** SI el cierre de una empresa falla, ENTONCES el sistema DEBE seguir con las demás y, al final, dar el
  trabajo por fallido con los ids de las empresas que fallaron, para que la cola lo reintente. Las que cerraron no
  se repiten.

### Recalcular por un cambio

- **R31.** CUANDO una empresa recibe un cambio programado que cambia los niveles que corre, el sistema DEBE, en la
  misma transacción:
  1. cerrar sus meses pendientes con los niveles de antes;
  2. poner su nivel en el más alto cuya meta nueva cumplió el último mes cerrado, contando todas las órdenes
     efectivas de ese mes;
  3. poner su cuenta a 0 y registrar el recálculo con motivo «cambio de niveles» e inicio en el instante en que
     recibe el cambio.
- **R32.** CUANDO a una empresa con plan se le aplica otro plan, el sistema DEBE hacer lo mismo que R31 con los
  niveles del plan nuevo (o de su versión, si entra con la de un cambio a medias), motivo «cambio de plan» e inicio
  en la fecha de efecto. Su entrada al plan pasa a ser esa fecha (R24).
- **R33.** CUANDO a una empresa sin plan se le asigna un plan, el sistema DEBE dejarla en el nivel 0, con la cuenta
  a 0 y su entrada en la fecha de efecto, sin historial; el mes de la entrada es el primero que se le cierra (P4).
- **R34.** CUANDO a una empresa solo le cambia el tipo de cobro, o recibe un cambio que no toca los niveles, el
  sistema NO DEBE tocar su nivel, su cuenta ni su entrada.

### Historial, acceso y datos existentes

- **R35.** El sistema DEBE registrar cada subida, bajada y recálculo con: el nivel nuevo, el nivel anterior, el
  instante en que empieza, el motivo («subida», «bajada», «cambio de niveles», «cambio de plan») y, si sale de un
  mes, el inicio de ese mes y sus órdenes efectivas. El historial solo se añade.
- **R36.** El nivel y el historial de una empresa DEBEN ser datos de esa empresa: con el rol `servi_app`, cada
  empresa solo lee los suyos y nadie los escribe. Solo los escriben el cierre y los recálculos: el sistema NO DEBE
  ofrecer ninguna forma de fijar un nivel a mano.
- **R37.** CUANDO se aplica la migración, cada empresa con plan DEBE quedar en el nivel 0, con la cuenta a 0, su
  entrada en la entrada a su plan vigente (`plan_ciclo_ancla_at`) y el mes de la migración como el primero que se le
  cierra, sin historial.

### De punta a punta

- **R38.** El superadmin DEBE poder hacer este recorrido en el navegador:
  1. crear un plan con 2 niveles, uno en porcentaje y otro en monto;
  2. verlos en la columna «Niveles» del listado, en orden;
  3. editar los niveles, y el cambio queda programado con su fecha sin cambiar todavía la columna.

## Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Niveles | R1–R6, R21, R28 |
| Órdenes efectivas | R22 |
| Subir | R25 |
| Bajar | R26, R27 |
| Historial | R35 |
| Editar niveles / cambiar de plan | R16–R18, R31, R32, R34 |
| Zona del cierre | R23 |
| Entrada a mitad de mes | R24, R33 |
| Nivel manual | R36 |
| Cierre fallido | R29, R30 |
| Pantalla | R7–R14, R21, R38 |
| Tamaño | `tasks.md > Archivos esperados` |
| Ruta | `design.md`, `tasks.md` |

## Preguntas abiertas

Las dos que venían de `/afinar-feature` (P1, P2) y las que salieron al escribir el spec (P3–P6). Cada una lleva
la propuesta del spec, que es la que siguen los requisitos hasta que el humano diga otra cosa.

- **P1. Hora del cron diario.** Propuesta: **00:20 de la plataforma (06:20 UTC)**, como trabajo recurrente de la
  cola (design §5).
  - Va 20 minutos después del borde del mes (00:00 −06:00), así que el día 1 cierra el mes que acaba de terminar.
  - No coincide con las 06:00 UTC de `corte-diario` y `generar-gastos-fijos`, ni con el barrido de cambios de plan
    (:00) ni con el cierre de facturas (:10). El resultado no depende de ese orden (R29, R31): solo reparte la
    carga.
  - Si falla, la cola reintenta con su backoff y, como mucho, la corrida del día siguiente lo recoge (R29).
- **P2. Límite de niveles por plan.** Propuesta: **10**. No hay un límite técnico. Pesa la lectura: la columna de
  R21 los pinta todos sin «Mostrar más», y la escala de «Mi plan» (SLT-216) también. Es un CHECK y una constante:
  subirlo después es barato.
- **P3. Órdenes canceladas por la API.** La decisión dice «sin canceladas», pero también «con cargo de plataforma
  vigente», y SL-40 P3 cerró que la cancelación por API se cobra y no genera reverso. Propuesta: **cuentan**, porque
  mandan el cargo vigente y lo que la plataforma cobra. Si deben quedar fuera, hay que excluirlas por su estado y
  R22 cambia.
- **P4. Primera asignación de un plan** (empresa sin plan). La decisión de recalcular con el último mes cerrado habla
  de «cambiar de plan». Propuesta: en la primera asignación la empresa **empieza en el nivel 0** y cuenta desde su
  entrada (R33), coherente con «Entrada a mitad de mes». Lo de antes de tener plan no cuenta.
- **P5. Las líneas «Esto es lo que cambia:»** salen en «Mi plan», en el correo a los maestros, en el rastro y en el
  detalle de empresa, y las arma una sola función. Propuesta: **una línea «Niveles por volumen: antes → después»**
  (R20), para que una edición que solo toca niveles no deje el rastro ni el aviso vacíos. La pantalla de niveles de
  «Mi plan» sigue siendo de SLT-216.
- **P6. Tamaño en líneas.** Unos 52 archivos (aceptado ~50) y unas **1 100 líneas de producción**, por encima del
  tope de 1 000: la migración pesa unas 450 (tres tablas, cuatro funciones y su `down.sql`). Propuesta: un solo PR,
  extendiendo la aceptación del tamaño a las líneas. La alternativa es partir el cierre mensual (R22–R37) en una
  segunda rebanada.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-19 | Niveles | 0..N por plan; cada uno con meta mensual de órdenes efectivas y descuento en % o monto fijo, nunca los dos; acumulables sobre el cobro base (200 → nivel 2 con 10 %+10 % = 160). Empresas sin plan, sin niveles. |
| 2026-11-19 | Órdenes efectivas | Del mes, con cargo de plataforma vigente (sin canceladas, anuladas ni reversadas). |
| 2026-11-19 | Subir | Al cerrar el mes, directo al nivel más alto cumplido; rige desde el día 1 del mes siguiente. |
| 2026-11-19 | Bajar | 1 nivel tras 2 meses seguidos sin cumplir la meta del nivel actual; un mes que cumple reinicia la cuenta. |
| 2026-11-19 | Historial | Se registra cada inicio de nivel con fecha y motivo. |
| 2026-11-19 | Editar niveles / cambiar de plan | Por cambio programado (SLT-135); al recibirlo, el nivel se recalcula con el último mes cerrado y las metas nuevas. |
| 2026-11-19 | Zona del cierre | La misma que usa hoy el período de facturación; se mueve con SLT-90. |
| 2026-11-19 | Entrada a mitad de mes | Cuenta normal: órdenes desde su entrada contra la meta completa. |
| 2026-11-19 | Nivel manual | No; solo automático. |
| 2026-11-19 | Cierre fallido | Cron diario idempotente: cierra en orden los meses pendientes y nunca repite uno. Aunque se calcule tarde, el nivel rige desde el día 1; ajustar lo ya cobrado es de SLT-216. |
| 2026-11-19 | Pantalla | En esta ficha: paso «Niveles» en el formulario del plan (como «Beneficios» de SLT-214) y columna en la tabla. |
| 2026-11-19 | Tamaño | ~50 archivos; un PR sobre el tope (humano). |
| 2026-11-19 | Ruta | Completa: dinero, migración y cron. |
