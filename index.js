import express from "express";
import dotenv from "dotenv";
import line from "@line/bot-sdk";

dotenv.config();

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

app.get("/", (req, res) => {
  res.send("AI Auto Posting Webhook is running");
});

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

        const userText = event.message.text;

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: `我收到了你的訊息：\n${userText}`,
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
