export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const CATEGORIAS_RECEITA = ["Vendas", "Serviços Prestados", "Comissões", "Outros"];
  const CATEGORIAS_DESPESA = ["Material", "Transporte", "Alimentação", "Internet / Telefone", "Aluguel", "Marketing", "Contador", "DAS - Simples Nacional", "INSS", "Saúde", "Educação", "Outros"];

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
2. NAO use markdown. Nada de ** ou * ou #. Texto puro.
3. Use emojis com moderacao
4. Quando perguntarem sobre faturamento, despesas ou saldo, USE os dados acima
5. Se nao souber, diga "Consulte seu contador"
6. Linguagem simples e amigavel`;

    } else if (tipo === "lancamento") {
      systemPrompt = `Converta a frase em JSON. Responda SOMENTE o JSON, nada mais.
Exemplo: {"tipo":"despesa","valor":80.00,"categoria":"Alimentação","data":"2026-08-25","descricao":"almoco"}
Categorias de receita: ${CATEGORIAS_RECEITA.join(", ")}
Categorias de despesa: ${CATEGORIAS_DESPESA.join(", ")}
Hoje: ${new Date().toISOString().split("T")[0]}
recebeu/vendeu = receita. gastou/pagou = despesa. mil = x1000.
Se a despesa for sobre algo especifico como INSS, saude, educacao, use o nome como categoria.
Se nenhuma categoria se encaixar, use "Outros".`;

    } else if (tipo === "ocr") {
      systemPrompt = `Extraia dados da imagem. JSON apenas:
{"valor":0.00,"data":"2026-01-01","descricao":"descricao","tipo_documento":"NF"}`;
    } else {
      return res.status(400).json({ error: "Tipo invalido" });
    }

    const parts = [{ text: userMessage }];

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
            maxOutputTokens: 1024,
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

    console.log("RAW Gemini:", tipo, resposta);

    if (tipo === "lancamento" && resposta) {
      let limpo = resposta.replace(/```json/gi, "").replace(/```/g, "").replace(/\n/g, " ").trim();
      const match = limpo.match(/\{[^}]*\}/);
      if (match) {
        try {
          const obj = JSON.parse(match[0]);
          if (obj.tipo && obj.valor) {
            // Tenta corrigir acento da categoria
            const semAcento = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const todasCats = [...CATEGORIAS_RECEITA, ...CATEGORIAS_DESPESA];
            const encontrada = todasCats.find(c => semAcento(c) === semAcento(obj.categoria));
            if (encontrada) {
              obj.categoria = encontrada;
            }
            // Se nao encontrou, MANTEM o que a IA retornou (pode ser categoria custom do usuario)
            // So forca "Outros" se estiver vazio
            if (!obj.categoria || obj.categoria.trim() === "") {
              obj.categoria = "Outros";
            }
            resposta = JSON.stringify(obj);
            console.log("CLEAN JSON:", resposta);
          }
        } catch (e) {
          console.error("Parse fail:", e.message, "matched:", match[0]);
        }
      }
    }

    if (tipo === "chat") {
      resposta = resposta.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
    }

    return res.status(200).json({ resposta: resposta });

  } catch (error) {
    console.error("Server error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
