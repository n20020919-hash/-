import base64
import os
from openai import OpenAI
from dotenv import load_dotenv
import json

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

def encode_image(image_bytes):
    return base64.b64encode(image_bytes).decode('utf-8')

# キーワードベースのカテゴリ自動推定（AIフォールバック用）
CATEGORY_KEYWORDS = {
    "食費": [
        "コーヒー", "ランチ", "ディナー", "朝食", "昼食", "夕食", "ラーメン", "寿司", "ピザ", "バーガー",
        "カフェ", "レストラン", "弁当", "おにぎり", "スナック", "ケーキ", "スイーツ", "アイス", "パン",
        "パスタ", "カレー", "そば", "うどん", "牛丼", "定食", "居酒屋", "飲食", "食事", "食料",
        "スーパー", "コンビニ", "惣菜", "野菜", "肉", "魚", "飲み物", "お菓子", "チョコ",
        "アップルパイ", "ドーナツ", "クッキー", "サンドイッチ", "サラダ", "ビール", "酒", "ワイン",
        "吉野家", "マクドナルド", "スタバ", "マツキヨ", "セブン", "ローソン", "ファミマ",
    ],
    "日用品": [
        "シャンプー", "洗剤", "トイレ", "ティッシュ", "タオル", "石鹸", "歯ブラシ", "歯磨き",
        "ボディソープ", "コンタクト", "電池", "文具", "ペン", "ノート", "消耗品", "掃除",
        "除菌", "消毒", "マスク", "ラップ", "袋", "ゴミ袋",
    ],
    "交通費": [
        "電車", "バス", "タクシー", "交通", "IC", "Suica", "PASMO", "定期", "切符", "高速",
        "ガソリン", "駐車", "駐輪", "地下鉄", "新幹線", "飛行機", "フェリー",
    ],
    "趣味・娯楽": [
        "ゲーム", "映画", "漫画", "音楽", "コンサート", "ライブ", "スポーツ", "ジム", "フィットネス",
        "本", "雑誌", "書籍", "DVD", "配信", "サブスク", "Netflix", "Spotify", "YouTube",
        "旅行", "ホテル", "宿泊", "観光", "遊園地", "アミューズメント", "ゴルフ", "テニス",
        "フィギュア", "ガチャ", "グッズ", "人形", "おもちゃ", "プラモ", "カード",
    ],
    "交際費": [
        "プレゼント", "ギフト", "贈り物", "お祝い", "飲み会", "宴会", "接待", "会食", "祝儀", "香典",
    ],
    "被服・美容": [
        "服", "洋服", "靴", "バッグ", "アクセサリー", "化粧", "コスメ", "美容院", "ヘアサロン",
        "ネイル", "エステ", "ファッション", "帽子", "下着", "ジャケット", "コート", "スニーカー",
    ],
    "住居費": [
        "家賃", "管理費", "引越", "修繕", "インテリア", "家具", "電球", "カーテン",
    ],
    "水道・光熱費": [
        "電気", "ガス", "水道", "光熱", "電力", "電気代", "ガス代", "水道代",
    ],
    "医療費": [
        "病院", "医院", "クリニック", "薬局", "薬", "処方", "健康診断", "歯科", "眼科", "整形",
        "接骨院", "サプリ", "ビタミン",
    ],
}

def guess_category(text: str) -> str:
    """キーワードマッチングでカテゴリを推測する"""
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return category
    return "その他"

def analyze_receipt(image_bytes: bytes, mime_type: str = "image/jpeg"):
    """
    画像をGPT-4oに送信し、JSON形式で「日付」「金額」「店舗名」「カテゴリ」を抽出します。
    """
    base64_image = encode_image(image_bytes)
    
    prompt = """
    あなたは優秀な家計簿のデータ入力アシスタントです。
    提供されたレシートや明細の画像から、以下の4つの情報を抽出し、必ず指定されたJSONフォーマットのみで返答してください。余計な文字列やマークダウンコードブロック（```json など）は一切含めないでください。

    【抽出項目】
    - date: 日付 (YYYY-MM-DDの形式。年が不明な場合は現在の年を使用)
    - amount: 金額 (数値のみ。カンマなどは除く。例: 1500)
    - store: 店舗名または支払先
    - category: 以下のカテゴリから最も適切なものを1つ選んでください。
      (食費, 日用品, 交通費, 趣味・娯楽, 交際費, 被服・美容, 住居費, 水道・光熱費, 医療費, その他)

    【出力フォーマット】
    {
      "date": "2023-10-25",
      "amount": 1500,
      "store": "スーパーABC",
      "category": "食費"
    }
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=300
        )
        
        # 応答テキストからJSONを取り出してパース
        response_text = response.choices[0].message.content.strip()
        # 万が一マークダウンブロックが付いていた場合の除去
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()

        data = json.loads(response_text)
        return data

    except Exception as e:
        print(f"Error in analyze_receipt: {e}")
        return {"error": str(e)}

def analyze_text(text: str):
    """
    文章をGPT-4oに送信し、JSON形式で「日付」「金額」「物品名（純粋な名詞のみ）」「カテゴリ」を抽出します。
    response_format="json_object" を使ってJSONパースエラーを完全に防ぎます。
    """
    import datetime
    import traceback
    today = datetime.date.today().isoformat()
    
    system_prompt = """あなたは優秀な家計簿データ入力アシスタントです。
ユーザーの入力文から以下の4つの情報を抽出し、必ずJSON形式のみで返してください。

【重要な抽出ルール】
- item: 購入物・支払先の「純粋な名詞のみ」。助詞（を・に・で・は・が）、動詞（買った・購入・支払い）、副詞（昨日・今日）は一切含めない。「アップルパイを買いました」→「アップルパイ」、「コーヒー を昨日飲みました」→「コーヒー」、「人形を 分買いました」→「人形」
- amount: 必ず整数の数値のみ（単位・記号なし）。金額が不明な場合は0。
  【重要】日本語の数量単位を必ず変換すること:
  - 「万」= ×10000 → 「30万」→ 300000、「30万円」→ 300000、「3万5千」→ 35000
  - 「千」= ×1000 → 「5千」→ 5000、「5千円」→ 5000
  - 「億」= ×100000000
  - 数字＋単位の組み合わせ例: 「30万」→ 300000、「1万5000」→ 15000、「2千500」→ 2500
- category: 食費/日用品/交通費/趣味・娯楽/交際費/被服・美容/住居費/水道・光熱費/医療費/その他 から1つ選択。
- date: YYYY-MM-DD形式。「昨日」「今日」「一昨日」など相対的な表現は今日の日付を基準に変換。不明な場合は今日の日付。

出力するJSONのキー名は必ず item, amount, category, date にしてください。"""


    user_message = f"""今日の日付: {today}

入力文: {text}

JSONを返してください。"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            response_format={"type": "json_object"},
            max_tokens=200
        )
        
        response_text = response.choices[0].message.content.strip()
        print(f"[analyze_text] LLM raw response: {response_text}")
        
        data = json.loads(response_text)
        
        # キー名の正規化: LLMが "store" で返した場合も "item" に統一
        if "store" in data and "item" not in data:
            data["item"] = data.pop("store")
        
        print(f"[analyze_text] Parsed data: {data}")
        return data

    except json.JSONDecodeError as je:
        print(f"[analyze_text] JSON parse error: {je}")
        print(f"[analyze_text] Raw response was: {response_text if 'response_text' in dir() else 'N/A'}")
        traceback.print_exc()
        return {"error": f"JSON parse error: {str(je)}"}
    except Exception as e:
        print(f"[analyze_text] Unexpected error: {e}")
        traceback.print_exc()
        return {"error": str(e)}
