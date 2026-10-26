-- SL-20 — revierte 20261026120000_pais. La política, el índice y la fila de Costa Rica caen con la
-- tabla. Es el último down de SL-20: los de 20261026120100 a 20261026120400 van antes, porque sus FK
-- a `pais` impedirían el DROP.

DROP TABLE "pais";
