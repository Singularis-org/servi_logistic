# SLT-136 — planes-aviso-descarga-factura · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-118, SLT-119 · **Rama:** `feature/SLT-136-planes-aviso-descarga-factura`
>
> **Alcance:** al cerrarse una factura de la plataforma, cada maestro activo de la empresa recibe un
> aviso en la campanita y un correo con el resumen y un enlace a «Mi plan». Desde el detalle de una
> factura cerrada (pantallas de SLT-119), el maestro y el superadmin descargan un PDF (resumen y
> desglose por día, según la plantilla de referencia `docs/referencias/Factura-1-Ordenex.pdf`) y un
> Excel con cada movimiento.
>
> **Lo que NO entra:** los correos del pago a la plataforma (SLT-132); que el admin de la empresa vea o
> descargue facturas (sigue la regla de SLT-91: «Mi plan» solo para el maestro); la descarga de la
> factura en curso; adjuntar el PDF al correo; subir o cambiar el logo desde una pantalla.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-17 (F1.2). «Factura cerrada» = `estado = 'cerrada'`, con número. «Movimiento»
> = una fila de `cobro_plataforma_traza` con `cobrado_at` en `[desde, hasta)` de la factura (SLT-119 R7). Las fechas y
> los días se leen en la hora de la plataforma (`ZONA_CR`), como en las pantallas de SLT-119. «De la base» = el valor
> que devuelve la base, sin recalcular ni redondear (decisión «Montos»).

### A. Los datos de la descarga

- **R1** — CUANDO el maestro pide la descarga de una factura cerrada de su empresa, el sistema DEBE devolver la factura
  (la misma cabecera que la lista de SLT-119), el nombre de la empresa y TODOS los movimientos de la factura, sin
  paginar, cada uno con su instante, su número de guía (o vacío), el número de remisión de su orden, su tipo (cargo o
  reverso) y su valor con signo, ordenados por instante y, a igual instante, por id. La empresa DEBE ser la de la
  sesión, nunca una que mande el cliente.
- **R2** — CUANDO el superadmin pide la descarga de una factura cerrada de una empresa, el sistema DEBE devolver lo mismo
  que R1 para esa empresa. La empresa DEBE ser la que liga el servidor en la página, no una que mande el cliente.
- **R3** — SI quien pide la descarga por la vía del maestro no tiene el rol de `ROLES_MI_PLAN`, o quien la pide por la
  vía del superadmin no es superadmin (incluidos el admin de la empresa y una petición sin sesión), ENTONCES el sistema
  DEBE responder `forbidden` sin leer la base.
- **R4** — SI la factura pedida no existe, es de otra empresa o no está cerrada (en curso o por cerrar), ENTONCES el
  sistema DEBE responder `not_found`.
- **R5** — SI la entrada de la descarga no es válida (un id que no es uuid), ENTONCES el sistema DEBE responder
  `validation_error` sin leer la base.
- **R6** — El sistema DEBE devolver la remisión de un movimiento también cuando su orden está eliminada (el reverso de
  una orden borrada lleva la remisión de esa orden).

### B. El PDF

- **R7** — CUANDO el usuario pulsa «Descargar PDF» en una factura cerrada, el sistema DEBE generar en el navegador un
  PDF A4 vertical. Su cabecera DEBE llevar el logo configurado, «FACTURA DE PLATAFORMA», «Factura N.º <n>» y
  «Cliente: <nombre de la empresa>».
- **R8** — El PDF DEBE llevar seis tarjetas:
  - «Cliente»: el nombre de la empresa;
  - «Estado»: «Emitida»;
  - «Período facturado»: «<primer día> al <último día>» en `dd/mm/aaaa`, donde el último día es el de `hasta` − 1 ms;
  - «Fecha de emisión (cierre)»: el día de `hasta`, en `dd/mm/aaaa`;
  - «Periodicidad»: la etiqueta de la periodicidad («Quincenal», «Mensual»);
  - «Plan»: el nombre del plan de las órdenes, o «Sin plan asignado»; si la factura no lleva cuota, seguido de
    «· sin cuota de plan».
- **R9** — El PDF DEBE llevar la tabla «Resumen» con las columnas Concepto, Cantidad e Importe, sin columna de tarifa,
  y estas cuatro filas:
  - «Cargos por orden»: el número de movimientos de tipo cargo y los `cargos` de la base;
  - «Reversos de cargos»: el número de reversos y los `reversos` de la base, en negativo;
  - «Total órdenes»: cargos − reversos en cantidad y el `total_ordenes` de la base;
  - «Cuota del plan»: «—» en cantidad y la cuota de la emisión más la primera cuota, o ₡0,00 si no lleva ninguna.
- **R10** — El PDF DEBE llevar la franja «Total a pagar» con el `total` de la base. Debajo DEBE ir una nota con
  «Movimientos en total: <movimientos de la base>.», sin citar ninguna tarifa.
- **R11** — El PDF DEBE llevar «Desglose por día»:
  - una fila por cada día con al menos un movimiento, de menor a mayor;
  - columnas: día (`dd/mm/aaaa`), número de cargos, número de reversos, órdenes netas (cargos − reversos, que puede ser
    negativo) e importe neto (la suma exacta de los valores de ese día);
  - una fila «Total» con los tres conteos y el `total_ordenes` de la base;
  - debajo, una nota que remite al Excel para ver cada movimiento.
- **R12** — Cada página del PDF DEBE llevar un pie con «Singularis · Plataforma Servi Logistic · Factura N.º <n> ·
  <empresa>» y «Página <n> de <m>». Una tabla que no cabe en una página DEBE seguir en la siguiente repitiendo su
  cabecera, sin perder ni duplicar filas.
- **R13** — El PDF DEBE pintar cada importe con el formato de dinero de la app, a partir del texto de la base, sin
  redondear, y DEBE imprimir el símbolo `₡`. Un carácter que la fuente embebida no cubre DEBE salir como «?» visible,
  nunca desaparecer.
- **R14** — SI el logo configurado no se puede cargar, ENTONCES la cabecera DEBE llevar «Singularis» en texto y el PDF
  DEBE generarse igual.
- **R15** — SI la suma de los importes por día no es igual al `total_ordenes` de la base, o los cargos más los reversos
  contados no son iguales a los `movimientos` de la base, ENTONCES el sistema NO DEBE generar el archivo y DEBE mostrar
  «No se pudo descargar la factura».

### C. El Excel

- **R16** — CUANDO el usuario pulsa «Descargar Excel» en una factura cerrada, el sistema DEBE generar en el navegador un
  `.xlsx` con una hoja «Movimientos». La hoja DEBE llevar una fila por movimiento, en el orden de R1, con estas
  columnas:
  - Fecha: `dd/mm/aaaa HH:mm`;
  - Guía: vacía si no la hay;
  - Remisión;
  - Tipo: «Cobrado» o «Reverso»;
  - Valor: un número con signo, con formato `#,##0.00`, igual al de la base.
- **R17** — SI la factura cerrada no tiene movimientos, ENTONCES el Excel DEBE llevar solo la fila de cabeceras, y el
  desglose del PDF DEBE decir «Sin movimientos en el período» con su fila «Total» en cero.
- **R18** — Los archivos DEBEN llamarse `factura-<n>-<empresa>.pdf` y `factura-<n>-<empresa>.xlsx`, con el nombre de la
  empresa en minúsculas, sin tildes y con guiones.

### D. Los botones

- **R19** — MIENTRAS el detalle muestra una factura cerrada, el sistema DEBE mostrar los botones «Descargar PDF» y
  «Descargar Excel», al maestro en «Mi plan» y al superadmin en la pestaña «Facturación». MIENTRAS muestra una factura
  no cerrada, NO DEBE mostrarlos.
- **R20** — CUANDO se pulsa uno de los dos botones, el sistema DEBE deshabilitar ambos hasta que termine la descarga.
  SI la lectura lanza o devuelve un estado distinto de `ok`, o la generación falla, ENTONCES DEBE mostrar «No se pudo
  descargar la factura» sin cerrar el detalle.

### E. El aviso al cerrar (campanita y push)

- **R21** — CUANDO el cierre de facturas cierra una o más facturas de una empresa, el sistema DEBE encolar un trabajo de
  aviso por cada factura cerrada, con esa empresa, en la misma transacción que el cierre:
  - si el cierre no se confirma, no DEBE quedar ningún trabajo;
  - si se confirma, DEBE quedar exactamente uno por factura, aunque el encolado se repita.

  Enmienda R25 de SLT-118, que decía «NO DEBE enviar correos ni avisos al cerrar».
- **R22** — CUANDO corre el trabajo de aviso de una factura cerrada, el sistema DEBE crear un aviso en la campanita
  dirigido al rol `maestro` de esa empresa. El aviso DEBE nombrar el número y el período de la factura, sin montos. Si
  el trabajo corre otra vez, NO DEBE crear un segundo aviso.
- **R23** — El aviso de factura emitida DEBE llevar el atajo «Ver factura» a «Mi plan» y DEBE ser elegible para push al
  maestro.
- **R24** — El sistema NO DEBE dirigir el aviso, el push ni el correo de una factura cerrada al superadmin, al admin ni a
  ningún otro rol.
- **R25** — El sistema DEBE avisar igual una factura cerrada con `total` de ₡0 (R21–R23 y R26).

### F. El correo

- **R26** — CUANDO corre el trabajo de aviso de una factura cerrada, el sistema DEBE enviar un correo con la plantilla de
  marca a cada maestro activo de la empresa. El correo DEBE llevar:
  - el número y el período;
  - la cuota (la cuota de la emisión más la primera cuota, o ₡0,00);
  - los cargos y los reversos;
  - el total a pagar, de la base;
  - un botón «Ver factura» que abre «Mi plan».

  El correo NO DEBE llevar adjuntos.
- **R27** — SI un envío falla, ENTONCES el sistema DEBE seguir con los demás maestros y después fallar el trabajo para que
  se reintente, sin el correo del maestro en el motivo. El reintento NO DEBE crear un segundo aviso en la campanita.
- **R28** — SI la empresa no tiene maestros activos, ENTONCES el trabajo DEBE crear el aviso de la campanita y terminar
  sin enviar correos. SI la factura ya no existe, ENTONCES el trabajo DEBE terminar sin avisar ni enviar.
- **R29** — SI la app no tiene su URL configurada, ENTONCES el correo DEBE ir sin el botón y DEBE decir que la factura está
  en «Mi plan».
- **R30** — El trabajo de aviso DEBE tener su manejador en la cola y DEBE ser de núcleo: ningún módulo apagado lo
  descarta.

### G. Base, enmiendas y E2E

- **R31** — La migración DEBE añadir solo tres valores: el evento de la campanita, su tipo de entidad y el tipo de
  trabajo. No DEBE tener backfill. Su `down.sql` DEBE quitar solo esos tres valores y DEBE abortar sin borrar nada si
  alguna fila los usa.
- **R32** — La guardia de SLT-91 R10 DEBE seguir prohibiendo nombrar `/mi-plan` fuera de su lista. Esa lista DEBE
  admitir, además de los de hoy, solo el catálogo de avisos (el atajo de R23) y la plantilla del correo (el botón de
  R26).
- **R33** — CUANDO el maestro abre la factura «N.º 1» cerrada en «Mi plan» y pulsa los dos botones, el E2E DEBE recibir
  `factura-1-<empresa>.pdf` y `factura-1-<empresa>.xlsx`. El Excel DEBE tener las tres filas de la factura, con sus
  guías, remisiones, tipos y valores. El superadmin DEBE poder descargar el PDF de la misma factura en «Facturación», y
  la factura en curso NO DEBE mostrar los botones.

### Decisiones cerradas → requisitos

| Decisión | R |
|---|---|
| ¿Quién descarga la factura? | R1, R2, R3, R19 |
| ¿Qué facturas se descargan? | R4, R19 |
| Contenido del PDF | R7–R12, R17 |
| Contenido del Excel | R16, R17 |
| Marca del PDF | R7, R12, R14 |
| Aviso al cerrar una factura | R21–R24 |
| Contenido del correo | R26, R29 |
| E2E | R33 |
| Tamaño del PR | — (lo mide el gate con el marcador de `progress/features/SLT-136.md`) |
| Columna «Tarifa» del resumen del PDF | R9, R10 |
| Estado en la tarjeta del PDF | R8 |
| Primera cuota en el PDF | R9 |
| ¿Se avisa una factura de ₡0? | R25 |
| Push | R23 |
| Guardia de SLT-91 R10 | R32 |
| Montos | R9, R10, R13, R15, R16, R26 |
| Naturaleza de la factura | R7 (número), R4 (solo cerradas) |
| Cómo se arman los archivos | R7, R13, R16 |
| Envío del correo | R26, R27, R30 |

## Preguntas abiertas

- **Logo de Singularis — ya no bloquea (2026-11-17).** El humano dejó un logo PROVISIONAL (rectángulo
  negro de 400×100) en `docs/referencias/logo-singularis.png` y `.svg` del checkout principal. La tarea del
  logo lo copia a `public/brand/` con un nombre estable (el PNG: jsPDF no pinta SVG) y su ruta va en
  `lib/config/marca.ts`; queda marcado como provisional. El humano lo reemplazará por el real con el mismo
  nombre, sin tocar código.
- La plantilla de referencia (`docs/referencias/Factura-1-Ordenex.pdf`) vive solo en el checkout
  principal del humano, fuera de git. Ruta absoluta:
  `C:\Users\Cristian\Documents\trabajo\arc\servi_logistic\docs\referencias\Factura-1-Ordenex.pdf`.

### Tamaño: resuelto (2026-11-17)

`spec_author` estimó ~63 archivos (~34 de producción, ~29 de tests) y ~1 470 líneas de producción,
por encima de `gate.tamano_pr`. El humano eligió **un solo PR por encima del tope**, sin partir la ficha
(precedente: SLT-60). Las preguntas que salieron al estimar están cerradas abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Quién descarga la factura? | El maestro, las de su empresa, en «Mi plan»; y el superadmin, las de cualquier empresa, en Plataforma > Empresas > pestaña Facturación. El admin de la empresa no ve ni descarga: se mantiene `ROLES_MI_PLAN = ["maestro"]` (SLT-91). |
| 2026-11-17 | ¿Qué facturas se descargan? | Solo las cerradas, con número. La factura en curso no se descarga. |
| 2026-11-17 | Contenido del PDF | Igual a la plantilla de referencia: cabecera con marca, «Factura de plataforma», número y cliente; tarjetas de cliente, estado, período facturado, fecha de emisión (cierre), periodicidad y plan; tabla «Resumen» (cargos por orden, reversos de cargos, total órdenes, cuota del plan) con cantidad e importe (sin columna «Tarifa», ver abajo); franja «Total a pagar»; nota con el total de movimientos; «Desglose por día» con cargos, reversos, órdenes netas e importe neto, más su fila de total. Pie con el texto de marca, el número de factura, el cliente y «Página n de m». |
| 2026-11-17 | Contenido del Excel | Detallado: una fila por movimiento con fecha, número de guía, número de remisión de la orden, tipo (cobrado o reverso) y valor. |
| 2026-11-17 | Marca del PDF | Singularis y Servi Logistic, como en la referencia («Singularis · Plataforma Servi Logistic»). El logo de la cabecera es configurable en código: un archivo en `public/brand/` con su ruta en `lib/config/marca.ts`; cambiarlo es reemplazar el archivo y desplegar. El logo en el pie no es obligatorio. |
| 2026-11-17 | Aviso al cerrar una factura | Aviso en la campanita (con push) y correo a cada maestro activo de la empresa. El superadmin no recibe nada. Enmienda R25 de SLT-118 («Aviso al cerrar: No por ahora»). |
| 2026-11-17 | Contenido del correo | Resumen del cobro (período, cuota, cargos, reversos y total a pagar) y un enlace «Ver factura» que abre «Mi plan». Sin PDF adjunto. |
| 2026-11-17 | E2E | No es flujo crítico de `docs/checkpoints-proyecto.md`. Se extiende `e2e/facturas-plataforma.spec.ts` con la descarga. |
| 2026-11-17 | Tamaño del PR | Un solo PR por encima del tope (~63 archivos, ~1 470 líneas de producción). No se parte. |
| 2026-11-17 | Columna «Tarifa» del resumen del PDF | Se quita. El resumen queda Concepto · Cantidad · Importe. La nota al pie no cita una tarifa única. |
| 2026-11-17 | Estado en la tarjeta del PDF | «Emitida», igual que las pantallas de SLT-119 (R2), no «Cerrada» como la plantilla. |
| 2026-11-17 | Primera cuota en el PDF | Va sumada en la fila «Cuota del plan», sin fila aparte. |
| 2026-11-17 | ¿Se avisa una factura de ₡0? | Sí: toda factura cerrada avisa (campanita, push y correo), aunque su total sea ₡0. |
| 2026-11-17 | Push | El aviso de factura cerrada es elegible para push, además de campanita y correo. |
| 2026-11-17 | Guardia de SLT-91 R10 (`/mi-plan` solo en el menú) | Se enmienda de forma explícita para admitir el atajo de la campanita y el enlace del correo, que este alcance pide. |
| heredado de SLT-119 | Montos | Los de la base, sin recalcular ni redondear al pintarlos (R5 de SLT-119). |
| heredado de SLT-118 | Naturaleza de la factura | Estado de cuenta interno, sin impuestos ni Hacienda. Número correlativo por empresa, asignado al cerrar. |
| heredado (exportes e informes existentes) | Cómo se arman los archivos | PDF con jsPDF y Excel con exceljs, en el navegador, como los informes de tránsito (fuente embebida que trae el `₡`) y `lib/utils/xlsx-template.ts`. Sin dependencias nuevas: las dos ya están aprobadas en `docs/dependencias.md`. |
| heredado de SLT-128 | Envío del correo | Un correo por maestro activo, con la plantilla de marca, por job como `plan_aviso_correo`. |
