import express from "express";
import dotenv from "dotenv";
import line from "@line/bot-sdk";

dotenv.config();

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ✅ 你之後會把這段做成 UI 可編輯的 system prompt
const SYSTEM_PROMPT = `
你是一個「內容整理助理」。
目標：把使用者的需求整理成可直接發社群的重點內容。
規則：
1) 用繁體中文輸出
2) 先給【重點摘要】3~7 點
3) 再給【建議貼文文案】一段可直接貼的文字（含 emoji、換行）
4) 若涉及「新聞 / 資訊查證」，請在最後補【參考來源】列出 1~3 個來源（網址可用文字表示）
5) 不要胡編，若不確定請說「需要再確認」
`;

app.get("/", (req, res) => {
  res.send("AI Auto Posting Webhook is running");
});

// --- Gemini helper (使用 Gemini API: generateContent) ---
async function callGemini(userText) {
  if (!GEMINI_API_KEY) {
    return "⚠️ 尚未設定 GEMINI_API_KEY，請到 Zeabur 環境變數新增後重啟服務。";
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" +
    encodeURIComponent(GEMINI_API_KEY);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `SYSTEM:\n${SYSTEM_PROMPT}\n\nUSER:\n${userText}` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return `⚠️ Gemini 呼叫失敗 (${resp.status})：${errText}`;
  }

  const data = await resp.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "⚠️ Gemini 沒有回傳可用內容";

  return text;
}

// --- LINE webhook ---
app.post(
  "/line/webhook",
  line.middleware(lineConfig),
  async (req, res) => {
    try {
      const client = new line.Client(lineConfig);
      const events = req.body.events || [];

      for (const event of events) {
        if (event.type !== "message") continue;
        if (event.message.type !== "text") continue;

        const userText = event.message.text.trim();

        // ✅ 指令分流
        if (userText.includes("生產圖片")) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ 已收到「生產圖片」指令。\n下一步我會：產生圖片提示詞 → 生圖 → 上傳 Cloudinary → 回傳圖片與文案。\n（我們下一步就來接這段）",
          });
          continue;
        }

        if (userText.includes("發布社群")) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ 已收到「發布社群」指令。\n下一步我會：把上一次產出的文案+圖片存到 Notion，並發布到 Threads/FB/IG。\n（我們下一步就來接這段）",
          });
          continue;
        }

        // ✅ 一般訊息 → 丟 Gemini 做整理
        const aiText = await callGemini(userText);

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiText.slice(0, 4900), // LINE text 上限保守
        });
      }

      res.status(200).end();
    } catch (err) {
      console.error("LINE webhook error:", err);
      res.status(500).end();
    }
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
