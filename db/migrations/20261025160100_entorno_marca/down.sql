-- SL-43 — revierte 20261025160100_entorno_marca. En QA se pierde la fila de la marca: si se vuelve a
-- aplicar la migración, una persona tiene que reinsertarla o la demo abortará (que es lo seguro).

DROP TABLE "entorno_marca";
