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
      systemPrompt = `Voce eh o assistente financeiro do app MEI Dinheiro Verde. Voce responde duvidas sobre MEI.

IMPORTANTE - DADOS FINANCEIROS DO USUARIO (use para responder perguntas sobre numeros):
${contexto || "Nenhum dado disponivel"}

REGRAS OBRIGATORIAS:
1. Respostas curtas, maximo 3 paragrafos
2. NAO use markdown. Nada de ** ou * ou # ou - para listas. Escreva texto puro.
3. Use emojis com moderacao
4. Quando perguntarem sobre faturamento, despesas ou saldo, SEMPRE use os dados acima
5. Se nao souber algo especifico, diga "Consulte seu contador"
6. Linguagem simples, como se estivesse conversando com um amigo`;

    } else if (tipo === "lancamento") {
      systemPrompt = `Voce extrai dados financeiros de frases em portugues. Responda SOMENTE com JSON puro. Nenhum texto antes ou depois. Nenhum markdown. Apenas o JSON.

Exemplo de entrada: "recebi 3 mil de consultoria"
Exemplo de saida: {"tipo":"receita","valor":3000.00,"categoria":"Servicos Prestados","data":"2026-08-24","descricao":"consultoria"}

Categorias de receita: Vendas, Servicos Prestados, Comissoes, Outros
Categorias de despesa: Material, Transporte, Alimentacao, Internet / Telefone, Aluguel, Marketing, Contador, DAS - Simples Nacional, Outros

Data de hoje: ${new Date().toISOString().split("T")[0]}

Regras:
- recebeu/vendeu/faturou/entrou = tipo receita
- gastou/pagou/comprou/saiu = tipo despesa
- Se nao mencionar data, use hoje
- "mil" ou "k" = x1000 (3 mil = 3000)
- Valor sempre numero decimal (3000.00)
- descricao: resuma em 2-3 palavras`;

      userMessage = mensagem;

    } else if (tipo === "ocr") {
      systemPrompt = `Analise a imagem e extraia dados financeiros. Responda SOMENTE com JSON puro:
{"valor":0.00,"data":"2026-01-01","descricao":"descricao do documento","tipo_documento":"NF ou recibo ou pix ou boleto"}
Se nao conseguir ler, use null nos campos.`;

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
            temperature: tipo === "chat" ? 0.7 : 0.05,
            maxOutputTokens: tipo === "chat" ? 1024 : 256,
          }
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      return res.status(500).json({ error: `Gemini API error: ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ resposta });

  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
