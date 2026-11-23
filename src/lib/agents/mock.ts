/**
 * Modo simulado: agentes deterministas que no llaman a ninguna IA.
 * Sirve para ver el flujo completo (incluido un fallo y su corrección) sin claves ni coste.
 */
import type { Files, Task } from "../types";
import type { Plan } from "./orchestrator";
import type { DevResult } from "./develop";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const MOCK_DELAY = Number(process.env.MOCK_DELAY_MS ?? 1500);

const T_PAGE = "Crear la página contacto.html";
const T_NAV = "Añadir «Contacto» al menú de todas las páginas";
const T_CSS = "Dar estilo al formulario de contacto";
const T_SECTION = "Añadir la sección pedida en la portada";
const T_SECTION_NAV = "Enlazar la nueva sección desde el menú";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function mockPlan(request: string): Promise<Plan> {
  await sleep(MOCK_DELAY);
  if (/contact/i.test(request)) {
    return {
      analysis:
        "La web tiene dos páginas y una hoja de estilos común. Creo la página nueva, la enlazo en el menú de todas las páginas y por último le doy estilo al formulario.",
      tasks: [
        {
          title: T_PAGE,
          description:
            "Crear contacto.html con la misma cabecera y pie que el resto, un título y un formulario con nombre, email y mensaje.",
          criteria: [
            "Usa la misma cabecera, menú y pie que index.html",
            "El formulario tiene campos nombre, email (type=email) y mensaje, todos obligatorios",
            "Cada campo tiene su <label> asociado",
          ],
          checks: [
            { type: "file_exists", path: "contacto.html" },
            { type: "contains", path: "contacto.html", text: "<form" },
            { type: "contains", path: "contacto.html", text: 'type="email"' },
            { type: "contains", path: "contacto.html", text: "styles.css" },
          ],
        },
        {
          title: T_NAV,
          description: "Añadir un enlace a contacto.html en el <nav> de index.html y servicios.html.",
          criteria: ["El enlace aparece en el menú de todas las páginas", "No se rompe ningún enlace existente"],
          checks: [
            { type: "contains", path: "index.html", text: 'href="contacto.html"' },
            { type: "contains", path: "servicios.html", text: 'href="contacto.html"' },
          ],
        },
        {
          title: T_CSS,
          description: "Añadir a styles.css los estilos de .contact-form coherentes con la marca (color --brand).",
          criteria: ["Los campos ocupan el ancho disponible", "El botón usa el color de la marca"],
          checks: [{ type: "contains", path: "styles.css", text: ".contact-form" }],
        },
      ],
    };
  }
  return {
    analysis: "Petición genérica: añado una sección nueva en la portada con el contenido pedido y la enlazo desde el menú.",
    tasks: [
      {
        title: T_SECTION,
        description: `Añadir en index.html una sección con id="peticion" que recoja: ${request}`,
        criteria: ["La sección está dentro de <main>", "Mantiene el estilo de las tarjetas existentes"],
        checks: [{ type: "contains", path: "index.html", text: 'id="peticion"' }],
      },
      {
        title: T_SECTION_NAV,
        description: 'Añadir un enlace "Novedad" a #peticion en el menú de index.html.',
        criteria: ["El menú tiene el enlace a la sección"],
        checks: [{ type: "contains", path: "index.html", text: 'href="#peticion"' }],
      },
    ],
  };
}

function contactPage(fixed: boolean): string {
  const field = (id: string, label: string, input: string) =>
    fixed ? `      <label for="${id}">${label}</label>\n      ${input}` : `      ${input}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contacto · Panadería La Espiga</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <a class="logo" href="index.html">La Espiga</a>
    <nav>
      <a href="index.html">Inicio</a>
      <a href="servicios.html">Servicios</a>
      <a href="contacto.html">Contacto</a>
    </nav>
  </header>
  <main>
    <h1>Contacto</h1>
    <p>¿Un encargo o una duda? Escríbenos y te respondemos en el día.</p>
    <form class="contact-form" action="#" method="post">
${field("nombre", "Nombre", `<input id="nombre" name="nombre" type="text" required${fixed ? "" : ' placeholder="Nombre"'}>`)}
${field("email", "Email", `<input id="email" name="email" type="${fixed ? "email" : "text"}" required${fixed ? "" : ' placeholder="Email"'}>`)}
${field("mensaje", "Mensaje", `<textarea id="mensaje" name="mensaje" rows="5" required></textarea>`)}
      <button type="submit" class="button">Enviar</button>
    </form>
  </main>
  <footer class="site-footer">
    <p>© Panadería La Espiga · C/ Mayor de Triana 12</p>
  </footer>
</body>
</html>
`;
}

const addNavLink = (html: string, link: string) =>
  html.includes(link) ? html : html.replace(/(\s*)<\/nav>/, `\n      ${link}$1</nav>`);

export async function mockDevelop(task: Task, files: Files): Promise<DevResult> {
  await sleep(MOCK_DELAY);
  const attempt = task.attempts + 1;
  switch (task.title) {
    case T_PAGE:
      // Primer intento con errores a propósito, para que se vea el ciclo Develop ⇄ Testing.
      return attempt === 1
        ? { summary: "Creada contacto.html con el formulario (nombre, email y mensaje).", files: [{ path: "contacto.html", content: contactPage(false) }] }
        : {
            summary: "Corregido: añadidos los <label> de cada campo y el email ahora es type=\"email\".",
            files: [{ path: "contacto.html", content: contactPage(true) }],
          };
    case T_NAV:
      return {
        summary: "Añadido el enlace «Contacto» al menú de index.html y servicios.html.",
        files: ["index.html", "servicios.html"].map((p) => ({
          path: p,
          content: addNavLink(files[p], '<a href="contacto.html">Contacto</a>'),
        })),
      };
    case T_CSS:
      return {
        summary: "Añadidos estilos para .contact-form: campos a ancho completo, bordes suaves y foco con el color de marca.",
        files: [
          {
            path: "styles.css",
            content:
              files["styles.css"] +
              `.contact-form { display: grid; gap: .5rem; max-width: 520px; margin-top: 1.5rem; }
.contact-form label { font-weight: 600; margin-top: .5rem; }
.contact-form input, .contact-form textarea { width: 100%; padding: .7rem .8rem; border: 1px solid #e5d3b3; border-radius: 8px; font: inherit; background: #fff; }
.contact-form input:focus, .contact-form textarea:focus { outline: 2px solid var(--brand); border-color: transparent; }
.contact-form .button { justify-self: start; border: 0; cursor: pointer; margin-top: .75rem; font: inherit; }
`,
          },
        ],
      };
    case T_SECTION: {
      const section = `    <section id="peticion" class="features">\n      <article>\n        <h2>Novedad</h2>\n        <p>${escapeHtml(task.description.replace(/^.*recoja: /, ""))}</p>\n      </article>\n    </section>\n  </main>`;
      return {
        summary: "Añadida la sección #peticion al final de la portada.",
        files: [{ path: "index.html", content: files["index.html"].replace("  </main>", section) }],
      };
    }
    case T_SECTION_NAV:
      return {
        summary: "Añadido el enlace «Novedad» al menú de la portada.",
        files: [{ path: "index.html", content: addNavLink(files["index.html"], '<a href="#peticion">Novedad</a>') }],
      };
    default:
      return { summary: "Sin cambios (tarea desconocida en modo simulado).", files: [] };
  }
}
