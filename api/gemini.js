export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const { tipo, mensagem, contexto, imagem } = req.body;
    let systemPrompt = "";
    let userMessage = mensagem || "";

    if (tipo === "chat") {
      systemPrompt = `Voce eh o assistente financeiro do app MEI Dinheiro Verde.

DADOS FINANCEIROS DO USUARIO:
${contexto || "Nenhum dado disponivel"}

REGRAS:
1. Respostas curtas, maximo 3 paragrafos
2. NAO use markdown. Nada de ** ou * ou # ou - para listas. Texto puro.
3. Use emojis com moderacao
4. Quando perguntarem sobre faturamento, despesas ou saldo, USE os dados acima
5. Se nao souber, diga "Consulte seu contador"
6. Linguagem simples e amigavel`;

    } else if (tipo === "lancamento") {
      systemPrompt = `Extraia dados de um lancamento financeiro da frase abaixo.

RESPONDA APENAS COM JSON. Nada de texto, nada de explicacao, nada de markdown, nada de crases.

Formato exato do JSON:
{"tipo":"receita","valor":1500.00,"categoria":"Servicos Prestados","data":"2026-08-24","descricao":"consultoria"}

Categorias validas de receita: Vendas, Servicos Prestados, Comissoes, Outros
Categorias validas de despesa: Material, Transporte, Alimentacao, Internet / Telefone, Aluguel, Marketing, Contador, DAS - Simples Nacional, Outros

Data de hoje: ${new Date().toISOString().split("T")[0]}

Regras:
- recebeu/vendeu/faturou = tipo "receita"
- gastou/pagou/comprou = tipo "despesa"
- Se nao mencionar data, use a data de hoje
- "mil" ou "k" significa multiplicar por 1000
- Valor sempre como numero decimal com duas casas (80.00, nao 80)
- descricao em 2-3 palavras resumindo`;

    } else if (tipo === "ocr") {
      systemPrompt = `Analise a imagem e extraia dados. Responda SOMENTE com JSON:
{"valor":0.00,"data":"2026-01-01","descricao":"descricao","tipo_documento":"NF"}`;
    } else {
      return res.status(400).json({ error: "Tipo invalido" });
    }

    const parts = [{ text: userMessage }];
    if (tipo === "ocr" && imagem) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: imagem.split(",")[1] || imagem } });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: tipo === "chat" ? 0.7 : 0.01,
            maxOutputTokens: tipo === "chat" ? 1024 : 256,
          }
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini HTTP error:", geminiRes.status, errText);
      return res.status(500).json({ error: "Erro na API do Gemini" });
    }

    const data = await geminiRes.json();
    let resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Log para debug
    console.log("Gemini tipo:", tipo, "resposta:", resposta);

    // Para lancamento: tenta limpar a resposta e garantir JSON valido
    if (tipo === "lancamento" && resposta) {
      // Remove markdown code blocks se existirem
      resposta = resposta.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      // Se ainda nao comeca com {, tenta extrair
      if (!resposta.startsWith("{")) {
        const match = resposta.match(/\{[^}]+\}/);
        if (match) resposta = match[0];
      }
    }

    return res.status(200).json({ resposta });

  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
