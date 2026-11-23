import type { Check, Files } from "../types";

/** Comprobaciones automáticas que ejecuta el agente Testing antes de la revisión con IA. */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const OPTIONAL_CLOSE = new Set(["html", "head", "body", "p", "li", "option", "tr", "td", "th"]);

export function normalizePath(p: string): string {
  return p.trim().replace(/^\.?\//, "").replace(/\\/g, "/");
}

export function isSafePath(p: string): boolean {
  return /^[a-z0-9_\-/]+\.(html|css|js|svg|json|txt)$/i.test(p) && !p.includes("..") && !p.startsWith("/");
}

function checkTagBalance(path: string, html: string): string[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const stack: string[] = [];
  const issues: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const [, closing, rawName, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || selfClosing) continue;
    if (!closing) {
      stack.push(name);
      continue;
    }
    if (stack[stack.length - 1] === name) {
      stack.pop();
    } else if (stack.includes(name)) {
      while (stack.length && stack[stack.length - 1] !== name) {
        const open = stack.pop()!;
        if (!OPTIONAL_CLOSE.has(open)) issues.push(`${path}: la etiqueta <${open}> no se cierra`);
      }
      stack.pop();
    } else {
      issues.push(`${path}: hay un </${name}> sin etiqueta de apertura`);
    }
  }
  for (const open of stack) if (!OPTIONAL_CLOSE.has(open)) issues.push(`${path}: la etiqueta <${open}> no se cierra`);
  return issues;
}

function checkLinks(path: string, html: string, files: Files): string[] {
  const issues: string[] = [];
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const re = /\b(?:href|src)=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || /^(https?:|\/\/|mailto:|tel:|#|data:|javascript:)/i.test(raw)) continue;
    const target = raw.split(/[?#]/)[0];
    if (!target) continue;
    const resolved = target.startsWith("/") ? target.slice(1) : normalizePath(dir + target);
    if (!(resolved in files)) issues.push(`${path}: enlace roto a «${raw}» (no existe ese archivo)`);
  }
  return issues;
}

function checkLabels(path: string, html: string): string[] {
  const issues: string[] = [];
  const re = /<(input|select|textarea)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, tag, attrs] = m;
    const type = attrs.match(/\btype=["']?([a-z]+)/i)?.[1]?.toLowerCase();
    if (type && ["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    if (/\baria-label(ledby)?=/i.test(attrs)) continue;
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && new RegExp(`<label[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) continue;
    const before = html.slice(0, m.index);
    if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue; // envuelto en <label>
    const name = attrs.match(/\bname=["']([^"']+)["']/i)?.[1] ?? id ?? tag;
    issues.push(`${path}: el campo «${name}» no tiene <label> asociado (accesibilidad)`);
  }
  return issues;
}

/** Revisa toda la web: estructura HTML, enlaces internos y accesibilidad de formularios. */
export function siteChecks(files: Files): string[] {
  const issues: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!content.trim()) {
      issues.push(`${path}: el archivo está vacío`);
      continue;
    }
    if (!path.endsWith(".html")) continue;
    if (!/<title>[^<]+<\/title>/i.test(content)) issues.push(`${path}: falta un <title> con texto`);
    if (!/<html\b[^>]*\blang=/i.test(content)) issues.push(`${path}: falta el atributo lang en <html>`);
    issues.push(...checkTagBalance(path, content), ...checkLinks(path, content, files), ...checkLabels(path, content));
  }
  return issues;
}

/** Comprobaciones concretas que el Orquestador definió para la tarea. */
export function taskChecks(checks: Check[], files: Files): string[] {
  const issues: string[] = [];
  for (const c of checks) {
    const path = normalizePath(c.path);
    const content = files[path];
    if (c.type === "file_exists") {
      if (content === undefined) issues.push(`No existe el archivo ${path}`);
    } else if (content === undefined) {
      issues.push(`No existe el archivo ${path} (necesario para comprobar «${c.text}»)`);
    } else if (c.type === "contains" && !content.toLowerCase().includes(c.text.toLowerCase())) {
      issues.push(`${path} debería contener «${c.text}»`);
    } else if (c.type === "not_contains" && content.toLowerCase().includes(c.text.toLowerCase())) {
      issues.push(`${path} no debería contener «${c.text}»`);
    }
  }
  return issues;
}

/** Valida y limpia las comprobaciones que propone la IA. */
export function sanitizeChecks(raw: unknown): Check[] {
  if (!Array.isArray(raw)) return [];
  const out: Check[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { type, path, text } = c as Record<string, unknown>;
    if (typeof path !== "string" || !isSafePath(normalizePath(path))) continue;
    if (type === "file_exists") out.push({ type, path: normalizePath(path) });
    else if ((type === "contains" || type === "not_contains") && typeof text === "string" && text.trim())
      out.push({ type, path: normalizePath(path), text: text.trim() });
  }
  return out.slice(0, 12);
}
