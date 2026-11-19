# SLT-199 — planes-factura-diseno-anexo-pdf · requirements.md

> **Zona:** fullstack · **Complejidad:** sin fijar en el board · **depends_on:** SLT-136 · **Rama:**
> `feature/SLT-199-planes-factura-diseno-anexo-pdf` · **Ruta propuesta:** completa (motivo en `design.md > Ruta`).
>
> **Alcance:** la factura de la plataforma que se descarga en PDF (SLT-136) pasa a tener el diseño de
> `docs/referencias/Factura-1-Ordenex.pdf`, y el detalle de movimientos deja de ser un Excel: pasa a ser un PDF
> **anexo** con el diseño de `docs/referencias/Factura-1-Ordenex-Detalle.pdf`. Los dos PDF salen de un mismo
> módulo de componentes compartidos (cabecera, barra degradada, tarjetas, tablas, banda de total, pie y colores),
> para que tengan el mismo estilo.
>
> **Lo que NO entra:**
> - cambiar los datos o los cálculos de la factura: vienen de SLT-118 y SLT-136, y la lectura del servidor
>   (`datosDescargaDeLaEmpresa` / `datosDescargaParaPlataforma`) no cambia;
> - el logo real: el humano reemplaza `public/brand/logo-singularis.png` con el mismo nombre, sin tocar código;
> - incrustar Poppins (la letra de la referencia);
> - quién descarga y qué facturas se descargan (SLT-136 R1–R6 y R19 siguen en pie: maestro y superadmin, solo
>   facturas cerradas);
> - el aviso, el push y el correo del cierre (SLT-136 R21–R32);
> - adjuntar los PDF al correo.
>
> Escrito por `spec_author` el 2026-11-18 (F1.2). Las decisiones de la tabla las fijó el humano el 2026-11-18,
> antes del spec; no se reabren.

## Requisitos (EARS)

> «Factura cerrada», «movimiento», «de la base» y la zona horaria significan lo mismo que en SLT-136 (cabecera de
> sus requisitos): los movimientos son los de `cobro_plataforma_traza` con `cobrado_at` en `[desde, hasta)`, en el
> orden de SLT-136 R1; las fechas y los días se leen en la hora de la plataforma; «de la base» es el valor que
> devuelve la base, sin recalcular ni redondear. «Los dos documentos» son la factura y el anexo.

### A. Lo común a los dos documentos

- **R1** — El sistema DEBE dibujar los dos documentos con los mismos componentes. La banda de cabecera, la barra
  degradada, las tarjetas, el título de sección, la cabecera de tabla, las filas alternas, la fila de total, la
  banda de total y el pie DEBEN tener en los dos los mismos colores, la misma altura y la misma posición
  horizontal.
- **R2** — El sistema DEBE escribir el texto de los dos documentos con la Helvetica de jsPDF (normal y negrita) y
  NO DEBE incrustar Poppins ni ninguna otra fuente nueva. SI un texto lleva un carácter que la Helvetica no puede
  escribir (el símbolo de la moneda, comillas tipográficas en un nombre), ENTONCES el sistema DEBE escribir ese
  texto con la fuente embebida que ya usa la app, sin perder el carácter. Un carácter que tampoco cubre esa fuente
  DEBE salir como «?» visible, nunca desaparecer.
- **R3** — El sistema DEBE pintar cada importe de los dos documentos con el formato de la referencia, a partir del
  texto de la base y sin redondear:
  - el símbolo de la moneda delante;
  - la parte entera en grupos de tres cifras separados por un espacio;
  - el separador decimal de la moneda y SIEMPRE dos decimales;
  - un importe negativo, con «-» delante del símbolo.

  Ejemplos: «₡0,00», «₡200,00», «₡473 000,00», «-₡40 400,00». Este formato difiere del dinero del resto de la app
  (`money()`: separador de miles «.» y sin «,00» en un importe redondo): el cambio aplica SOLO a estos dos
  documentos. El símbolo y el separador decimal salen de la configuración de moneda, no de un literal.
- **R4** — El sistema DEBE pintar cada cantidad entera de los dos documentos (conteos, número de movimientos,
  órdenes netas) en grupos de tres cifras separados por un espacio, con «-» delante si es negativa, también en las
  filas de total: «2 567», «2 365», «-15».
- **R5** — Una tabla que no cabe en una página DEBE seguir en la siguiente repitiendo su cabecera, sin perder ni
  duplicar filas. Sus filas DEBEN alternar dos fondos claros. Cada página de los dos documentos DEBE llevar «Página
  <x> de <y>» a la derecha del pie.
- **R6** — SI el logo configurado no se puede cargar, ENTONCES la cabecera de cualquiera de los dos documentos DEBE
  llevar «Singularis» en texto y el documento DEBE generarse igual (como SLT-136 R14).
- **R7** — SI la suma de los importes por día no es igual al `total_ordenes` de la base, o los cargos más los
  reversos contados no son iguales a los `movimientos` de la base, ENTONCES el sistema NO DEBE generar ninguno de
  los dos documentos y DEBE mostrar «No se pudo descargar la factura» (SLT-136 R15, ahora también para el anexo).

### B. La factura

- **R8** — CUANDO el usuario pide la factura de una factura cerrada, el sistema DEBE generar en el navegador un PDF
  A4 vertical. Su cabecera DEBE ser una banda oscura con el logo a la izquierda y, a la derecha, «FACTURA DE
  PLATAFORMA», «Factura N.º <n>» y «Cliente: <empresa>». Bajo la banda DEBE ir la barra degradada.
- **R9** — La factura DEBE llevar seis tarjetas en dos columnas y tres filas, en este orden: «Cliente» y «Estado»;
  «Período facturado» y «Fecha de emisión (cierre)»; «Periodicidad» y «Plan». Cada tarjeta lleva la etiqueta en
  mayúsculas y el valor en negrita. Los valores son los de SLT-136 R8; el estado sigue siendo «Emitida».
- **R10** — La factura DEBE llevar el título «Resumen» y una tabla con las columnas Concepto, Cantidad, Tarifa e
  Importe, y estas filas:
  - «Cargos por orden»: el número de cargos, la tarifa y los `cargos` de la base;
  - «Reversos de cargos»: el número de reversos, la tarifa (en positivo) y los `reversos` de la base en negativo,
    con el importe en rojo;
  - «Total órdenes»: cargos − reversos y el `total_ordenes` de la base, en negrita, con un filete de color encima
    y la celda de tarifa vacía;
  - «Cuota del plan»: «—» en cantidad y en tarifa, y la cuota de la emisión más la primera cuota (o «₡0,00»).

  Enmienda SLT-136 R9 y su decisión «Columna Tarifa del resumen del PDF: se quita».
- **R26** (va aquí por tema; se numeró al cerrar P1, sin renumerar los demás) — El sistema DEBE sacar la tarifa de los movimientos de la factura, sin leer nada nuevo:
  - SI todos los movimientos (cargos y reversos) tienen el mismo valor absoluto, ENTONCES la tarifa es ese valor,
    con el formato de R3;
  - SI hay dos o más valores absolutos distintos, ENTONCES la tarifa es «Varias»;
  - SI la factura no tiene movimientos, ENTONCES la tarifa es «—».
- **R11** — Bajo la tabla, la factura DEBE llevar una banda oscura con «TOTAL A PAGAR» a la izquierda y el `total`
  de la base a la derecha. Debajo DEBE ir esta nota, en este orden:
  - «Movimientos en total: <movimientos de la base>.»;
  - según la tarifa de R26: «Los cargos y reversos se cobran a <tarifa> por orden.» si es única; «Los cargos y
    reversos se cobran con varias tarifas por orden.» si es «Varias»; nada si es «—»;
  - «Montos en <código de la moneda> (<símbolo>).», con el código y el símbolo de la configuración de moneda
    (hoy, «Montos en CRC (₡).»). Ningún nombre de país ni de moneda escrito en el código.
- **R12** — La factura DEBE llevar «Desglose por día» en página nueva:
  - columnas Día, Cargos, Reversos, Órdenes netas e Importe neto;
  - una fila por día con movimientos, de menor a mayor; el importe neto negativo en rojo;
  - una fila «Total» en negrita con filete, con los tres conteos y el `total_ordenes` de la base;
  - debajo, la nota «El detalle completo de los <N> movimientos va en el anexo «Factura <n> · <empresa> · Detalle
    de movimientos».», con N = `movimientos` de la base.

  SI la factura no tiene movimientos, ENTONCES el desglose DEBE decir «Sin movimientos en el período» con su fila
  «Total» en cero. Enmienda la nota de SLT-136 R11, que remitía al Excel.
- **R13** — Cada página de la factura DEBE llevar a la izquierda del pie «Singularis · Plataforma Servi Logistic ·
  Factura N.º <n> · <empresa>».
- **R14** — Los importes, conteos y valores de la factura DEBEN ser los mismos que con SLT-136 para los mismos
  datos: solo cambian el diseño y el formato (R3, R4).

### C. El anexo de movimientos

- **R15** — CUANDO el usuario pide el anexo de una factura cerrada, el sistema DEBE generar en el navegador un PDF
  A4 vertical con los mismos datos que la factura (la misma lectura de SLT-136 R1–R6, sin una consulta nueva).
- **R16** — La primera página del anexo DEBE llevar la banda oscura con el logo y, a la derecha, «ANEXO · FACTURA
  N.º <n>», «Detalle de movimientos» y «Cliente: <empresa>», y bajo ella la barra degradada. Las páginas
  siguientes NO DEBEN llevar la banda.
- **R17** — Bajo la cabecera, el anexo DEBE llevar cuatro tarjetas en una fila:
  - «Movimientos»: los `movimientos` de la base;
  - «Cargos»: «<número de cargos> · <`cargos` de la base>»;
  - «Reversos»: «<número de reversos> · <`reversos` de la base en negativo>»;
  - «Total neto»: el `total_ordenes` de la base.

  Debajo DEBE ir la línea «Periodo facturado: <primer día> al <último día>.» seguida, según la tarifa de R26, de
  «Tarifa: <tarifa> por orden.» si es única, de «Tarifa: varias por orden.» si es «Varias», o de «Tarifa: —.» si
  no hay movimientos.
- **R18** — El anexo DEBE llevar el título «Movimientos» y una tabla con las columnas #, Fecha, Tipo, Guía,
  Remisión e Importe, con una fila por movimiento en el orden de SLT-136 R1:
  - «#»: el número de orden, de 1 al total;
  - «Fecha»: el día del movimiento, `dd/mm/aaaa`;
  - «Tipo»: «Cargo» en verde azulado, o «Reverso» en negrita y en rojo;
  - «Guía»: el número de guía, o «—» si no lo hay;
  - «Remisión»: la del movimiento;
  - «Importe»: el valor con signo; si es negativo, en rojo.
- **R19** — La tabla del anexo DEBE cumplir R5. La última fila DEBE ser «Total neto (<N> movimientos)» con el
  `total_ordenes` de la base, en negrita y con un filete de color encima; N es el `movimientos` de la base.
- **R20** — SI la factura no tiene movimientos, ENTONCES la tabla del anexo DEBE llevar una fila «Sin movimientos
  en el período» y la fila «Total neto (0 movimientos)» con «₡0,00».
- **R21** — Cada página del anexo DEBE llevar a la izquierda del pie «Singularis · Plataforma Servi Logistic ·
  Anexo: detalle de movimientos».

### D. El Excel y los botones

- **R22** — El sistema NO DEBE ofrecer el detalle de movimientos en Excel: no hay botón de Excel, ni módulo que
  arme el `.xlsx` de la factura, ni tests de ese `.xlsx`. Enmienda SLT-136 R16, R17 (la parte del Excel) y R18 (el
  `.xlsx`).
- **R23** — MIENTRAS el detalle muestra una factura cerrada, el sistema DEBE mostrar los botones «Descargar
  factura» y «Descargar anexo», al maestro en «Mi plan» y al superadmin en la pestaña «Facturación». MIENTRAS muestra una no
  cerrada, NO DEBE mostrarlos. CUANDO se pulsa uno, el sistema DEBE deshabilitar los dos hasta que termine. SI la
  lectura o la generación fallan, ENTONCES DEBE mostrar «No se pudo descargar la factura» sin cerrar el detalle.
  Enmienda los textos de SLT-136 R19 y R20.
- **R24** — La factura DEBE llamarse `factura-<n>-<empresa>.pdf` (como SLT-136 R18) y el anexo
  `factura-<n>-<empresa>-anexo.pdf`, con la empresa en minúsculas, sin tildes y con guiones.
- **R25** — CUANDO el maestro abre la factura «N.º 1» cerrada en «Mi plan» y pulsa «Descargar factura» y «Descargar
  anexo», el E2E DEBE
  recibir dos PDF con sus nombres (R24), que empiecen por `%PDF`. El anexo DEBE contener las remisiones de los tres
  movimientos de la factura y «Total neto (3 movimientos)». El superadmin DEBE poder descargar la factura en
  «Facturación», y la factura en curso NO DEBE mostrar los botones. Enmienda SLT-136 R33.

R1–R26: 26 requisitos (R26 está en la sección B).

### Decisiones cerradas → requisitos

| Decisión | R |
|---|---|
| 1. Diseño de la factura | R8–R13 |
| 2. El detalle pasa a PDF anexo; el Excel desaparece | R15–R22, R25 |
| 3. Tipografía Helvetica, sin Poppins | R2 |
| 4. Módulo común de componentes | R1, R5 |
| 5. No cambian datos ni cálculos; logo en el mismo archivo | R6, R7, R14, R15 |
| 6. Formato de montos y números de la referencia | R3, R4 |
| 7. Tarifa (P1) | R10, R11, R17, R26 |
| 8. Botones y archivo del anexo (P2) | R23, R24, R25 |
| 9. Frase de moneda de la nota (P3) | R11 |
| 10. Estado «Emitida» | R9 |

## Preguntas abiertas

Ninguna. P1, P2 y P3 las cerró el humano el 2026-11-18 (filas 7–9 de la tabla de abajo).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-18 | Diseño de la factura PDF | Sigue `Factura-1-Ordenex`: cabecera oscura con logo, «Factura N.º n», «Cliente: X»; barra degradada; seis tarjetas (cliente, estado, período facturado, fecha de emisión (cierre), periodicidad, plan); tabla «Resumen» (concepto, cantidad, tarifa, importe; reversos en rojo; fila «Total órdenes»; «Cuota del plan»); banda oscura «TOTAL A PAGAR»; nota al pie; «Desglose por día» con fila Total; pie «Singularis · Plataforma Servi Logistic · Factura N.º n · cliente» y «Página x de y». |
| 2026-11-18 | Detalle de movimientos | Pasa de Excel a PDF anexo con el diseño de `Factura-1-Ordenex-Detalle`; el Excel desaparece (botón, código y tests). Cuerpo idéntico a la referencia: cabecera «ANEXO · FACTURA N.º n / Detalle de movimientos / Cliente»; cuatro tarjetas (movimientos, cargos «n · ₡», reversos «n · −₡», total neto); línea «Periodo facturado … Tarifa …»; tabla «Movimientos» (#, Fecha, Tipo, Guía, Remisión, Importe; Cargo en verde azulado, Reverso en negrita rojo, guía vacía «—», importe negativo en rojo); cabecera de tabla repetida en cada página; filas alternas; fila final «Total neto (N movimientos)»; pie «Singularis · Plataforma Servi Logistic · Anexo: detalle de movimientos» y «Página x de y». |
| 2026-11-18 | Tipografía | Helvetica (la de jsPDF); NO se incrusta Poppins. Mismo diseño, letra distinta. |
| 2026-11-18 | Estilo común | Los componentes compartidos (cabecera, tarjetas, tablas con cabecera repetida y filas alternas, banda de total, pie con paginación, colores y tokens) van en un módulo común que usan la factura y el anexo. |
| 2026-11-18 | Datos, cálculos y logo | No cambian datos ni cálculos (vienen de SLT-118 y SLT-136). El logo real lo pone el humano en el mismo archivo. |
| 2026-11-18 | Formato de montos y números | El de la referencia: `₡` con espacio de miles y coma decimal («₡473 000,00», «2 567»). Si el formato actual difiere, va como requisito (R3, R4). |
| 2026-11-18 | Tarifa (P1) | Se saca de los movimientos: si todos tienen el mismo valor, esa es la tarifa; si son distintos, «Varias»; sin movimientos, «—». Enmienda la decisión de SLT-136 «Columna Tarifa: se quita». |
| 2026-11-18 | Botones y archivo del anexo (P2) | «Descargar factura» y «Descargar anexo». El anexo se llama `factura-<n>-<empresa>-anexo.pdf`. |
| 2026-11-18 | Frase de moneda de la nota (P3) | «Montos en CRC (₡).», con el código y el símbolo de la configuración de moneda, sin literal de país ni de moneda en el código. |
| 2026-11-18 | Estado en la tarjeta | «Emitida», como decidió SLT-136, no «Cerrada» como la referencia. |
