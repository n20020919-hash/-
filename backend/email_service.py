import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

def send_email(to_email: str, subject: str, message: str):
    if not SMTP_SERVER or not SMTP_USER or not SMTP_PASSWORD:
        print("SMTP is not configured. Skipping email send.")
        return

    msg = MIMEMultipart()
    msg['From'] = SMTP_FROM_EMAIL
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(message, 'plain'))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
            print(f"Email sent to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")

def send_welcome_email(to_email: str):
    subject = "アカウント作成ありがとうございます"
    message = f"{to_email} 様\n\nAI家計簿へのご登録ありがとうございます。\n早速ログインして家計簿を記録してみましょう。\n\n今後ともよろしくお願いいたします。"
    send_email(to_email, subject, message)

def send_password_reset_email(to_email: str, token: str):
    subject = "パスワード再設定のご案内"
    reset_url = f"http://192.168.11.10:3000/reset-password?token={token}"
    message = f"{to_email} 様\n\nパスワードの再設定がリクエストされました。\n以下のリンクをブラウザで開いて、新しいパスワードを設定してください。\n\n{reset_url}\n\nもし心当たりがない場合は、このメールを破棄してください。"
    send_email(to_email, subject, message)
