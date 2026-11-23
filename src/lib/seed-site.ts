import type { Files } from "./types";

/** Web de partida sobre la que trabaja el equipo en cada ejecución. */
export const SEED_SITE: Files = {
  "index.html": `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Panadería La Espiga</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="logo" href="index.html">La Espiga</a>
    <nav>
      <a href="index.html">Inicio</a>
      <a href="servicios.html">Servicios</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>Pan artesano desde 1987</h1>
      <p>Masa madre, harinas ecológicas y horno de leña en el centro de Las Palmas.</p>
      <a class="button" href="servicios.html">Ver lo que hacemos</a>
    </section>
    <section class="features">
      <article>
        <h2>Cada mañana</h2>
        <p>Hornadas a las 7:00 y a las 12:00.</p>
      </article>
      <article>
        <h2>Encargos</h2>
        <p>Tartas y pan para eventos con 48 h de antelación.</p>
      </article>
    </section>
  </main>
  <footer class="site-footer">
    <p>© Panadería La Espiga · C/ Mayor de Triana 12</p>
  </footer>
</body>
</html>
`,
  "servicios.html": `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Servicios · Panadería La Espiga</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="logo" href="index.html">La Espiga</a>
    <nav>
      <a href="index.html">Inicio</a>
      <a href="servicios.html">Servicios</a>
    </nav>
  </header>
  <main>
    <h1>Servicios</h1>
    <ul class="list">
      <li>Pan de masa madre y espelta</li>
      <li>Bollería del día</li>
      <li>Catering para oficinas</li>
    </ul>
  </main>
  <footer class="site-footer">
    <p>© Panadería La Espiga · C/ Mayor de Triana 12</p>
  </footer>
</body>
</html>
`,
  "styles.css": `:root {
  --brand: #b45309;
  --ink: #1f2937;
  --paper: #fffbeb;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); background: var(--paper); }
.site-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: #fff; border-bottom: 1px solid #f3e8d2; }
.logo { font-weight: 800; color: var(--brand); text-decoration: none; font-size: 1.25rem; }
nav a { margin-left: 1rem; color: var(--ink); text-decoration: none; }
nav a:hover { color: var(--brand); }
main { max-width: 900px; margin: 0 auto; padding: 2rem; }
.hero { padding: 3rem 0; }
.hero h1 { font-size: 2.5rem; margin: 0 0 .5rem; }
.button { display: inline-block; background: var(--brand); color: #fff; padding: .7rem 1.2rem; border-radius: 8px; text-decoration: none; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.features article { background: #fff; padding: 1rem 1.25rem; border-radius: 12px; border: 1px solid #f3e8d2; }
.list li { margin: .4rem 0; }
.site-footer { text-align: center; padding: 2rem; color: #6b7280; font-size: .9rem; }
`,
};
