// Vercel Serverless Function — proxy seguro para a API do Gemini
// A chave da API fica no servidor (env var), nunca exposta no frontend

export default async function handler(req, res) {
  // CORS
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
    let userContent = [];

    if (tipo === "chat") {
      // Assistente MEI - chatbot
      systemPrompt = `Você é o assistente financeiro do app MEI Dinheiro Verde. Responda dúvidas sobre MEI de forma clara, curta e prática. Use linguagem simples que qualquer pessoa entende. Sempre que possível, dê a resposta direta primeiro e depois explique.

Contexto financeiro do usuário:
${contexto || "Não disponível"}

Regras:
- Respostas curtas (máximo 3 parágrafos)
- Use emojis com moderação para tornar amigável
- Se não souber, diga "Consulte seu contador para essa questão específica"
- Foque em: DAS, limite de faturamento (R$ 81k), DASN-SIMEI, categorias de despesa, obrigações do MEI
- Não invente informações tributárias — seja preciso`;

      userContent = [{ type: "text", text: mensagem }];

    } else if (tipo === "lancamento") {
      // Lançamento por texto natural
      systemPrompt = `Você extrai dados de um lançamento financeiro a partir de uma frase em linguagem natural. Responda APENAS com JSON válido, sem markdown, sem explicação.

Formato exato:
{"tipo":"receita ou despesa","valor":1500.00,"categoria":"uma das categorias","data":"YYYY-MM-DD","descricao":"descrição curta"}

Categorias de receita: Vendas, Serviços Prestados, Comissões, Outros
Categorias de despesa: Material, Transporte, Alimentação, Internet / Telefone, Aluguel, Marketing, Contador, DAS - Simples Nacional, Outros

Data de hoje: ${new Date().toISOString().split("T")[0]}

Regras:
- Se não mencionar data, use hoje
- Se não mencionar tipo, deduza pelo contexto (recebeu/vendeu = receita, gastou/pagou/comprou = despesa)
- Valor sempre como número decimal (50.00, não 50)
- Escolha a categoria mais próxima da lista acima
- Descrição: resuma em poucas palavras`;

      userContent = [{ type: "text", text: mensagem }];

    } else if (tipo === "ocr") {
      // Leitura de comprovante por foto
      systemPrompt = `Analise esta imagem de um comprovante financeiro (nota fiscal, recibo, comprovante de Pix, boleto) e extraia os dados. Responda APENAS com JSON válido, sem markdown.

Formato: {"valor":1500.00,"data":"YYYY-MM-DD","descricao":"descrição do documento","tipo_documento":"NF/recibo/pix/boleto"}

Se não conseguir ler algum campo, use null.`;

      userContent = [
        { type: "text", text: "Extraia os dados deste comprovante:" },
      ];
      if (imagem) {
        userContent.push({
          type: "image_url",
          image_url: { url: imagem }
        });
      }

    } else {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    // Chama a API do Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: userContent.map(c => {
            if (c.type === "text") return { text: c.text };
            if (c.type === "image_url") return { inline_data: { mime_type: "image/jpeg", data: c.image_url.url.split(",")[1] } };
            return { text: c.text };
          })}],
          generationConfig: {
            temperature: tipo === "chat" ? 0.7 : 0.1,
            maxOutputTokens: tipo === "chat" ? 500 : 200,
          }
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", err);
      return res.status(500).json({ error: "Erro na API do Gemini" });
    }

    const data = await geminiRes.json();
    const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.status(200).json({ resposta });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}
