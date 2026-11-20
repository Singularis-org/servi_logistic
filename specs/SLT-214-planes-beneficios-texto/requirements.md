# SLT-214 — planes-beneficios-texto · requirements.md

## Alcance

Cada plan tiene de 0 a N **beneficios de texto** con un ícono. El superadmin los configura en el formulario por
pasos del plan, al crear y al editar, en un paso propio. Se muestran en cuatro sitios:
- el listado de planes del superadmin: los 3 primeros y «Mostrar más»;
- el detalle del plan;
- «Mi plan» de la empresa;
- la lista de planes con la que la empresa cambia de plan.

Editarlos es una edición más del plan: va por el cambio programado con fecha, y cada empresa los ve al inicio de su
período. El aviso «Esto es lo que cambia:» y el correo a los maestros dicen qué beneficios se agregan y cuáles se
quitan.

**Lo que NO entra:**
- los niveles por volumen: SLT-215 «Planes: niveles de beneficio por volumen de órdenes»;
- el descuento por nivel: SLT-216 «Planes: descuento por nivel en el cobro, la factura y «Mi plan»»;
- la página pública de planes: SLT-116 «Planes: página pública de planes para elegir en la inscripción».

## Decisiones cerradas (no reabrir)

| Fecha | Tema | Decisión | Requisitos |
|---|---|---|---|
| 2026-11-19 | Qué es un beneficio | Texto libre, sin parámetros (p. ej. «Acceso anticipado», «Features nuevas», «Soporte 24 h»). | R1 |
| 2026-11-19 | Cuántos | De 0 a N por plan, sin tope de cantidad. | R1, R9 |
| 2026-11-19 | Largo del texto | De 1 a 120 caracteres. | R2, R6 |
| 2026-11-19 | Orden | Lo elige el superadmin, y en ese orden se muestran. | R1, R8, R15, R20, R22, R23 |
| 2026-11-19 | Ícono | Uno por beneficio, de un catálogo fijo de 12 de `lucide-react`, la librería que ya usa el proyecto. Sin dependencias nuevas. Son: equipo de trabajo, soporte (auriculares), reloj 24 h, rayo (acceso anticipado), estrella (novedades), escudo (seguridad), cohete, regalo, gráfica, camión, check y corazón. | R3, R5, R6 |
| 2026-11-19 | Ícono de «reloj 24 h» (P7) | `lucide-react` no trae un reloj de 24 h: se usa `Clock`. Los otros 11 usan nombres que existen en el paquete instalado (comprobado en `lucide-react.d.ts`, 1.75.0). | R5 |
| 2026-11-19 | Dónde se configuran | En el formulario por pasos del plan, al crear y al editar, con su borrador del servidor (SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa»). | R7–R14 |
| 2026-11-19 | Paso propio (P2) | «Beneficios» es un paso propio, después de «Módulos». Toca el `CHECK plan_borrador_pasos_conocidos`, `PASOS_DE_CREAR`, `PASOS_DE_EDITAR` y los E2E de planes. | R7, R12 |
| 2026-11-19 | Editar | Es una edición más: va por el cambio programado con fecha (SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período» y SLT-135 «Planes: sin «De inmediato» al editar un plan»). Cada empresa lo ve al inicio de su período. | R16–R18 |
| 2026-11-19 | Listado del superadmin (P3) | Sigue siendo una tabla. La fila lleva una columna «Beneficios» con los 3 primeros. «Mostrar más» despliega el resto ampliando el alto de la fila, y «Mostrar menos» la pliega. | R20, R21 |
| 2026-11-19 | Detalle del plan y «Mi plan» | Todos los beneficios con su ícono, en orden. | R22, R23 |
| 2026-11-19 | Aviso y correo del cambio (P4) | El aviso «Esto es lo que cambia» de «Mi plan» y el correo a los maestros listan «Se agrega: …» y «Se quita: …». | R25 |
| 2026-11-19 | Planes para cambiar de plan (P5) | La lista de planes de «Mi plan» con la que se cambia de plan (`CambioDePlan`) muestra los beneficios: 3 y «Mostrar más». | R24 |
| 2026-11-19 | Duplicados (P6) | No se permiten dos beneficios con el mismo texto en un plan. El error dice «Ya hay un beneficio con ese texto». La comparación ignora mayúsculas, tildes y espacios de más. | R4 |
| 2026-11-19 | Tamaño (P1) | Un solo PR, por encima del tope: unos 47 archivos y unas 750 líneas de producción. Sin corte. | — |
| 2026-11-19 | Fuera | Niveles por volumen (SLT-215), descuentos (SLT-216) y página pública (SLT-116). | — |
| 2026-11-19 | Aviso cuando solo cambian íconos u orden | La línea dice «Cambian los íconos o el orden de los beneficios.» (humano, P8). | R25 |
| 2026-11-19 | «Revisar» al editar | La fila «Beneficios» sale solo si cambian, como «antes → después», igual que las demás filas (humano). | R14 |

## Requisitos (EARS)

### Datos y validación

- **R1.** El sistema DEBE guardar para cada plan una lista ordenada de beneficios. Cada beneficio tiene un texto y un
  ícono. La lista puede estar vacía y no tiene tope de cantidad.
- **R2.** SI el texto de un beneficio, sin los espacios de los extremos, está vacío o tiene más de 120 caracteres,
  ENTONCES el sistema DEBE rechazar el guardado. El error va en `beneficios.<i>.texto`:
  - texto vacío: «Escribe el texto del beneficio.»;
  - más de 120: «El texto del beneficio admite hasta 120 caracteres.»

  Un texto válido se guarda sin los espacios de los extremos.
- **R3.** SI el ícono de un beneficio no es uno de los 12 del catálogo, ENTONCES el sistema DEBE rechazar el
  guardado con un error en `beneficios.<i>.icono`.
- **R4.** SI dos beneficios del mismo plan tienen el mismo texto, ENTONCES el sistema DEBE rechazar el guardado con
  «Ya hay un beneficio con ese texto» en `beneficios.<j>.texto` de cada repetido después del primero. Para
  compararlos no cuentan las mayúsculas, las tildes ni los espacios de más: «Soporte  24 h», « soporte 24 H» y
  «Sópórte 24 h» son el mismo texto.
- **R5.** El sistema DEBE ofrecer exactamente estos 12 íconos, en este orden y con estos nombres:

  | Clave | Nombre | Ícono de `lucide-react` |
  |---|---|---|
  | `equipo` | Equipo de trabajo | `Users` |
  | `soporte` | Soporte | `Headphones` |
  | `reloj_24h` | Reloj 24 h | `Clock` |
  | `rayo` | Rayo | `Zap` |
  | `estrella` | Estrella | `Star` |
  | `escudo` | Escudo | `Shield` |
  | `cohete` | Cohete | `Rocket` |
  | `regalo` | Regalo | `Gift` |
  | `grafica` | Gráfica | `ChartColumn` |
  | `camion` | Camión | `Truck` |
  | `check` | Check | `Check` |
  | `corazon` | Corazón | `Heart` |

  El ícono se pinta decorativo (`aria-hidden`), siempre junto al texto del beneficio.
- **R6.** La base DEBE rechazar un beneficio que llegue sin pasar por la app con alguno de estos defectos:
  - texto vacío, de más de 120 caracteres o con espacios en los extremos;
  - un ícono fuera del catálogo;
  - una posición negativa.

  La tabla de beneficios DEBE quedar cerrada al rol de la app (`servi_app`). La empresa solo los lee por
  `plan_de_la_empresa`, y solo los de su plan.

### Formulario por pasos

- **R7.** El formulario del plan DEBE tener un paso «Beneficios» justo después de «Módulos», al crear y al editar.
  Al editar va antes de «Cuándo rige».
- **R8.** En el paso «Beneficios», el superadmin DEBE poder hacer esto con cada beneficio:
  - agregarlo con «Agregar beneficio», al final de la lista y con el ícono «Check»;
  - escribir su texto;
  - elegir su ícono;
  - quitarlo;
  - subirlo y bajarlo.

  El orden en pantalla es el que se guarda.
- **R9.** MIENTRAS la lista está vacía, el paso DEBE mostrar «Este plan no tiene beneficios.» y DEBE dejar guardar
  y continuar con la lista vacía.
- **R10.** CUANDO el superadmin pulsa «Guardar y continuar» en «Beneficios», el sistema DEBE validar el paso con
  R2–R4 y guardarlo en el borrador del servidor. SI hay errores, ENTONCES el formulario no avanza y pinta cada error
  junto al campo de su beneficio.
- **R11.** CUANDO se abre o se retoma un borrador con el paso «Beneficios» guardado, el formulario DEBE mostrar esos
  beneficios en su orden, con su texto y su ícono.
- **R12.** SI se confirma un borrador sin el paso «Beneficios» guardado, ENTONCES el sistema DEBE responder
  `pasos_pendientes` con `beneficios`. Es el caso, por ejemplo, de un borrador empezado antes de esta ficha.
- **R13.** CUANDO se edita un plan sin borrador, el paso «Beneficios» DEBE abrir con los beneficios vigentes del plan.
- **R14.** Al crear, el paso «Revisar» DEBE listar los beneficios con su ícono y en orden. Sin beneficios, dice
  «Sin beneficios». Al editar, la fila «Beneficios» DEBE salir solo si los beneficios cambian, como «antes →
  después», igual que las demás filas; si no cambian, no sale.

### Alta, edición y rastro

- **R15.** CUANDO se confirma la creación de un plan, el plan DEBE quedar con los beneficios del borrador, en su
  orden.
- **R16.** CUANDO se confirma la edición de un plan, los beneficios DEBEN ir en la versión del cambio programado, y
  la lista del plan no cambia al programar. MIENTRAS el cambio está a medias, cada empresa DEBE ver los beneficios
  de la versión que corre:
  - la nueva, si ya recibió el cambio al inicio de su período;
  - la anterior, si todavía no lo recibió.
- **R17.** CUANDO el cambio programado se promueve al plan, la lista de beneficios del plan DEBE quedar igual a la de
  la versión.
- **R18.** SI una versión, programada o propia de una empresa, no trae beneficios, ENTONCES el sistema DEBE tratarla
  como «sin cambio en los beneficios»: valen los del plan. Es el caso de las versiones guardadas antes de esta ficha.
- **R19.** CUANDO una edición cambia los beneficios, sea el texto, el ícono o el orden, el rastro del plan DEBE
  guardar la lista de antes y la de después. CUANDO se crea un plan con al menos un beneficio, la fila «creado» del
  rastro DEBE incluirlos, y el detalle del plan pinta «Beneficios: <texto 1>, <texto 2>, …». Un alta sin beneficios no
  añade nada al rastro.

### Dónde se ven

- **R20.** El listado de planes del superadmin DEBE tener una columna «Beneficios». Cada fila muestra los 3 primeros
  beneficios con su ícono, en orden. Sin beneficios, la celda dice «Sin beneficios».
- **R21.** DONDE una lista muestra solo los 3 primeros beneficios (R20, R24), SI el plan tiene más de 3, ENTONCES
  DEBE haber un botón «Mostrar más» con `aria-expanded="false"`:
  - CUANDO se pulsa «Mostrar más», se muestran todos, la fila o la tarjeta crece de alto y el botón pasa a «Mostrar
    menos» con `aria-expanded="true"`;
  - CUANDO se pulsa «Mostrar menos», vuelven a verse solo los 3 primeros.

  Con 3 beneficios o menos, no hay botón. Cada fila y cada tarjeta se despliega por su cuenta.
- **R22.** El detalle del plan del superadmin DEBE mostrar todos los beneficios del plan con su ícono, en orden. Sin
  beneficios, dice «Sin beneficios».
- **R23.** «Mi plan» DEBE mostrar todos los beneficios de la versión que corre la empresa, con su ícono y en orden.
  Esa versión es la propia de la empresa si la tiene durante un cambio a medias y, si no, la del plan. Sin
  beneficios, la sección no se pinta.
- **R24.** En «Mi plan», la lista de planes para cambiar de plan DEBE mostrar los 3 primeros beneficios de cada
  tarjeta, con R21. Eso incluye el plan activo y el custom activo. Sin beneficios, la tarjeta no pinta la lista.
- **R25.** CUANDO un cambio de plan cambia los beneficios, las líneas «Esto es lo que cambia:» DEBEN incluir:
  - «Se agrega: <texto>» por cada beneficio que está después y no estaba antes;
  - «Se quita: <texto>» por cada beneficio que estaba antes y ya no está.

  Antes y después se comparan con la regla de R4. SI solo cambian íconos, el orden o las mayúsculas, ENTONCES DEBE
  salir una sola línea: «Cambian los íconos o el orden de los beneficios.»

  Esas líneas salen en «Mi plan», en el correo a los maestros, en el rastro del detalle del plan y en el detalle de
  empresa del superadmin.

### De punta a punta

- **R26.** El superadmin DEBE poder hacer este recorrido en el navegador:
  1. crear un plan con 4 beneficios;
  2. verlo en el listado con 3 beneficios y «Mostrar más», y desplegar el cuarto;
  3. verlos todos en el detalle, en orden;
  4. editar los beneficios, y el cambio queda programado con su fecha sin cambiar todavía los del plan.

## Preguntas abiertas

Ninguna.
