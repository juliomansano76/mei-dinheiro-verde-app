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
      systemPrompt = `Extraia dados financeiros da frase. Responda SOMENTE com JSON puro. NADA de texto extra.

{"tipo":"receita","valor":1500.00,"categoria":"Servicos Prestados","data":"2026-08-24","descricao":"consultoria"}

Categorias receita: Vendas, Servicos Prestados, Comissoes, Outros
Categorias despesa: Material, Transporte, Alimentacao, Internet / Telefone, Aluguel, Marketing, Contador, DAS - Simples Nacional, Outros

Hoje: ${new Date().toISOString().split("T")[0]}

recebeu/vendeu/faturou = receita. gastou/pagou/comprou = despesa. mil/k = x1000. Valor decimal (80.00).`;

    } else if (tipo === "ocr") {
      systemPrompt = `Extraia dados da imagem. Responda SOMENTE com JSON:
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
      return res.status(500).json({ error: "Erro na API" });
    }

    const data = await geminiRes.json();
    let resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Para lancamento: limpa e valida o JSON no servidor
    // Assim o frontend recebe JSON perfeito sem precisar parsear
    if (tipo === "lancamento" && resposta) {
      try {
        // Remove tudo que nao eh JSON
        let limpo = resposta.replace(/```json/gi, "").replace(/```/g, "").trim();
        // Extrai o objeto JSON
        const match = limpo.match(/\{[\s\S]*\}/);
        if (match) {
          // Parse e re-stringify para garantir JSON valido e limpo
          const obj = JSON.parse(match[0]);
          resposta = JSON.stringify(obj);
          console.log("Lancamento OK:", resposta);
        } else {
          console.error("Sem JSON na resposta:", limpo);
        }
      } catch (e) {
        console.error("Erro ao limpar JSON:", e.message, "resposta:", resposta);
      }
    }

    if (tipo === "chat") {
      // Remove markdown residual
      resposta = resposta.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
    }

    console.log("Resposta final tipo:", tipo, "tamanho:", resposta.length);
    return res.status(200).json({ resposta });

  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
