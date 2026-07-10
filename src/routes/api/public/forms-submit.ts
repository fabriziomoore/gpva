import { createFileRoute } from "@tanstack/react-router";

// Página pública auto-executável que recebe o formId + entries do Google
// Forms via querystring e faz o POST para
// docs.google.com/forms/d/e/<id>/formResponse assim que carrega. Depois do
// POST, o próprio Google renderiza a tela "Sua resposta foi registrada"
// dentro do mesmo WebView — no app Android abrimos essa URL com o
// @capacitor/inappbrowser, o que dá a sensação de estar dentro do app
// (toolbar customizada, sem barra de endereço) e o envio é automático.
//
// Todos os pares chave/valor da querystring, exceto `formId`, são enviados
// como inputs do formulário. Isso preserva os campos com sufixos
// `_year/_month/_day` (data) e permite múltiplos valores para checkbox
// (formas de pagamento).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(formId: string, pairs: Array<[string, string]>): string {
  const action = `https://docs.google.com/forms/d/e/${encodeURIComponent(formId)}/formResponse`;
  const inputs = pairs
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>GPVA · Enviando negociação</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; height: 100%; background: #1a1d24; color: #f4f4f5; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 16px; }
  .badge { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #a1a1aa; }
  h1 { font-size: 20px; margin: 0; font-weight: 600; }
  p { font-size: 14px; margin: 0; color: #d4d4d8; max-width: 320px; line-height: 1.4; }
  .spinner { width: 44px; height: 44px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.15); border-top-color: #ef4444; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  form { display: none; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="badge">GPVA</div>
    <div class="spinner" aria-hidden="true"></div>
    <h1>Enviando negociação…</h1>
    <p>Aguarde a tela de confirmação do Google Forms. Você pode fechar esta janela quando aparecer.</p>
  </div>
  <form id="f" method="POST" action="${action}" accept-charset="UTF-8">${inputs}</form>
  <script>
    // Envia assim que o DOM estiver montado.
    document.getElementById('f').submit();
  </script>
</body>
</html>`;
}

export const Route = createFileRoute("/api/public/forms-submit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const formId = url.searchParams.get("formId");
        if (!formId || !/^[a-zA-Z0-9_-]+$/.test(formId)) {
          return new Response("Missing or invalid formId", { status: 400 });
        }
        const pairs: Array<[string, string]> = [];
        for (const [k, v] of url.searchParams.entries()) {
          if (k === "formId") continue;
          pairs.push([k, v]);
        }
        const html = renderPage(formId, pairs);
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});