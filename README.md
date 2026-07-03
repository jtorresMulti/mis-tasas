# Robot de tasas — Mis Finanzas

Este robot arma solo un archivo `rates.json` con las tasas de interés de Colombia y lo publica.
La app **Mis Finanzas** lo lee por internet y muestra **tasa anterior → nueva**. Así ya **no hay que
recompilar la app** ni depender de nadie para actualizar las tasas.

## Qué actualiza solo (fuentes oficiales, sin intervención)
- **Referencia:** Interés Bancario Corriente (IBC) y **Usura** (= 1,5 × IBC) — dataset oficial de la
  Superfinanciera en `datos.gov.co` (`pare-7x5i`).
- **Tasa de política del Banco de la República** y **DTF** — web service SDMX del Banco de la República.
- **CDT por entidad** (a 360 y 180 días) — Formato 441 de la Superfinanciera en `datos.gov.co` (`axk9-g2nh`).

## Qué se edita a mano (una vez cada tanto, sin recompilar la app)
- **Ahorro (bolsillos/cajitas)** y **Créditos**: viven en [`banks-seed.json`](./banks-seed.json).
  Estas tasas de *oferta* por banco no están en una API confiable (salen de prensa/marketing), así que
  se editan a mano en ese archivo. Al editarlo y guardarlo, el robot las recoge y publica.

> El robot **nunca borra**: si una fuente falla, conserva el último valor conocido.

## Puesta en marcha (una sola vez, ~10 min)
1. Crea una cuenta gratis en **GitHub** (github.com) si no tienes.
2. Crea un **repositorio nuevo, público** (ej. `mis-tasas`).
3. Sube a ese repo el contenido de esta carpeta `rates-bot/` (incluida la carpeta `.github/`):
   `build-rates.mjs`, `banks-seed.json`, `rates.json`, `README.md` y `.github/workflows/update-rates.yml`.
4. En el repo → pestaña **Settings → Actions → General → Workflow permissions** → marca
   **"Read and write permissions"** y guarda (para que el robot pueda hacer commit).
5. Ve a la pestaña **Actions**, elige **"Actualizar tasas"** y toca **"Run workflow"** para probarlo.
   Debe generar/actualizar `rates.json`.
6. Copia la **URL cruda** de `rates.json`:
   `https://raw.githubusercontent.com/TU_USUARIO/mis-tasas/main/rates.json`
7. En la app **Mis Finanzas → Más → Tasas de interés → 🤖 Actualización automática**, pega esa URL y
   toca **Guardar**. Listo: la app leerá las tasas solita (al abrir y al tocar Actualizar).

De ahí en adelante, el robot corre **lunes y jueves** (y cuando lo ejecutes a mano) y republica el
archivo; la app muestra los cambios como **anterior → nueva**.

## Correrlo en tu PC (opcional)
Con **Node 18+**: `node build-rates.mjs` (genera/actualiza `rates.json`).

## Cambiar cada cuánto corre
Edita el `cron` en `.github/workflows/update-rates.yml` (formato UTC).
