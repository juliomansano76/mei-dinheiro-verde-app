export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const CATEGORIAS_RECEITA = ["Vendas", "Serviços Prestados", "Comissões", "Outros"];
  const CATEGORIAS_DESPESA = ["Material", "Transporte", "Alimentação", "Internet / Telefone", "Aluguel", "Marketing", "Contador", "DAS-MEI", "INSS", "Saúde", "Educação", "Outros"];
  const CATEGORIAS_PF_RECEITA = ["Salário", "Freelance", "Aluguel Recebido", "Investimentos", "Outros"];
  const CATEGORIAS_PF_DESPESA = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Contas / Serviços", "Outros"];

  try {
    const { tipo, mensagem, contexto, imagem } = req.body;
    let systemPrompt = "";
    let userMessage = mensagem || "";

    if (tipo === "chat") {
      systemPrompt = "Voce eh o assistente financeiro do app Dinheiro Verde.\n\nDADOS DO USUARIO:\n" + (contexto || "Nenhum dado") + "\n\nREGRAS: Respostas curtas, max 3 paragrafos. NAO use markdown (nada de ** ou *). Use emojis com moderacao. Use os dados acima para responder. Se nao souber, diga Consulte seu contador.";

    } else if (tipo === "lancamento") {
      const todasCats = [...CATEGORIAS_RECEITA, ...CATEGORIAS_DESPESA, ...CATEGORIAS_PF_RECEITA, ...CATEGORIAS_PF_DESPESA];
      systemPrompt = "Converta a frase em JSON. Responda SOMENTE o JSON.\nExemplo: {\"tipo\":\"despesa\",\"valor\":80.00,\"categoria\":\"Alimentacao\",\"data\":\"2026-08-27\",\"descricao\":\"almoco\"}\nCategorias: " + todasCats.join(", ") + "\nHoje: " + new Date().toISOString().split("T")[0] + "\nrecebeu/vendeu=receita. gastou/pagou=despesa. mil=x1000.";

    } else if (tipo === "ocr") {
      systemPrompt = "Extraia dados da imagem. JSON apenas: {\"valor\":0.00,\"data\":\"2026-01-01\",\"descricao\":\"desc\",\"tipo_documento\":\"NF\"}";
    } else {
      return res.status(400).json({ error: "Tipo invalido" });
    }

    const parts = [{ text: userMessage }];

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: parts }],
          generationConfig: {
            temperature: tipo === "chat" ? 0.7 : 0.01,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      return res.status(500).json({ error: "Erro na API" });
    }

    const data = await geminiRes.json();
    var resposta = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("FULL RAW:", JSON.stringify(resposta));

    // Para chat: remove markdown
    if (tipo === "chat") {
      resposta = resposta.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
    }

    // Para lancamento: limpa code blocks mas NAO faz parse/re-stringify
    if (tipo === "lancamento") {
      resposta = resposta.replace(/```json/gi, "").replace(/```/g, "").trim();
    }

    // Envia como texto simples para evitar problemas de encoding
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    var body = JSON.stringify({ resposta: resposta });
    console.log("RESPONSE BODY LENGTH:", body.length);
    return res.status(200).send(body);

  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
