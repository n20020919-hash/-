from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import os
import jwt
from datetime import datetime, timedelta
import secrets

from models import SessionLocal, Expense, User, Income, Asset, PasswordResetToken
from ai_service import analyze_receipt
from auth import verify_password, get_password_hash, create_access_token, SECRET_KEY, ALGORITHM
from email_service import send_welcome_email, send_password_reset_email
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI Account Book API")

allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
if allowed_origins_str:
    origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]
else:
    origins = ["http://localhost:3000", "http://localhost:5173", "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

class UserCreate(BaseModel):
    email: str
    password: str
    dob: Optional[str] = None
    age: Optional[int] = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ExpenseCreate(BaseModel):
    date: str
    amount: float
    store: str
    category: str

class ExpenseResponse(ExpenseCreate):
    id: int

    class Config:
        from_attributes = True

class IncomeCreate(BaseModel):
    date: str
    amount: float
    source: str
    category: str

class IncomeResponse(IncomeCreate):
    id: int
    class Config:
        from_attributes = True

class AssetCreate(BaseModel):
    name: str
    amount: float
    note: str = ""
    updated_at: str = ""

class AssetResponse(AssetCreate):
    id: int
    class Config:
        from_attributes = True

@app.post("/api/register", response_model=Token)
def register(user: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_password, dob=user.dob, age=user.age)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send welcome email asynchronously
    background_tasks.add_task(send_welcome_email, new_user.email)
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/forgot-password")
def forgot_password(req: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        return {"message": "If that email exists, a reset link will be sent."}
    
    # Delete old tokens
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()
    
    # Create new token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)
    reset_token = PasswordResetToken(token=token, user_id=user.id, expires_at=expires_at)
    db.add(reset_token)
    db.commit()
    
    # Send email
    background_tasks.add_task(send_password_reset_email, user.email, token)
    return {"message": "If that email exists, a reset link will be sent."}

@app.post("/api/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(PasswordResetToken.token == req.token).first()
    
    if not reset_token or reset_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="無効なトークンか、期限切れです")
        
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="ユーザーが見つかりません")
        
    user.hashed_password = get_password_hash(req.new_password)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()
    db.commit()
    
    return {"message": "パスワードが正常に更新されました"}

@app.get("/api/health")
def health_check():
    api_key_configured = os.getenv("OPENAI_API_KEY") is not None
    return {"status": "ok", "openai_api_configured": api_key_configured}

@app.post("/api/upload")
async def upload_receipt(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    
    contents = await file.read()
    analyzed_data = analyze_receipt(contents, mime_type=file.content_type)
    
    if not analyzed_data or "error" in analyzed_data:
        error_msg = analyzed_data.get("error", "Unknown error") if analyzed_data else "解析結果が返されませんでした"
        raise HTTPException(status_code=500, detail=f"AI解析エラー: {error_msg}")
    
    return {"status": "success", "data": analyzed_data}

class TextAnalyzeRequest(BaseModel):
    text: str

@app.post("/api/analyze-text")
def analyze_text_endpoint(req: TextAnalyzeRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ai_service import analyze_text
    import traceback
    
    print(f"[analyze-text] Received text: {req.text}")
    
    try:
        analyzed_data = analyze_text(req.text)
    except Exception as e:
        print(f"[analyze-text] analyze_text raised exception: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI解析エラー: {str(e)}")
    
    if not analyzed_data or "error" in analyzed_data:
        error_msg = analyzed_data.get("error", "Unknown error") if analyzed_data else "解析結果が返されませんでした"
        print(f"[analyze-text] Error in analyzed_data: {error_msg}")
        raise HTTPException(status_code=500, detail=f"AI解析エラー: {error_msg}")
    
    print(f"[analyze-text] Successfully parsed: {analyzed_data}")
    
    # item / store どちらのキーにも対応
    store_name = analyzed_data.get("item") or analyzed_data.get("store") or "手動入力"
    amount_val = analyzed_data.get("amount", 0)
    date_val = analyzed_data.get("date", __import__("datetime").date.today().isoformat())
    
    # カテゴリ: AIが「その他」や未設定の場合はキーワード辞書で補完
    from ai_service import guess_category
    ai_category = analyzed_data.get("category", "その他")
    if not ai_category or ai_category == "その他":
        # 入力テキスト全体 + 抽出された品名でキーワード判定
        category_val = guess_category(req.text + " " + store_name)
    else:
        category_val = ai_category
    
    # DBに保存
    db_expense = Expense(
        date=str(date_val),
        amount=float(amount_val),
        store=store_name,
        category=category_val,
        user_id=current_user.id
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    
    return {"status": "success", "data": analyzed_data, "saved": True, "id": db_expense.id}

@app.post("/api/expenses", response_model=ExpenseResponse)
def create_expense(expense: ExpenseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ai_service import guess_category
    
    # カテゴリが「その他」や空の場合はキーワード辞書で自動判定
    category = expense.category
    if not category or category == "その他":
        category = guess_category(expense.store)
    
    db_expense = Expense(
        date=expense.date,
        amount=expense.amount,
        store=expense.store,
        category=category,
        user_id=current_user.id
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense

@app.get("/api/expenses", response_model=List[ExpenseResponse])
def get_expenses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expenses = db.query(Expense).filter(Expense.user_id == current_user.id).order_by(Expense.date.desc()).all()
    return expenses

@app.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(expense_id: int, expense: ExpenseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_expense = db.query(Expense).filter(Expense.id == expense_id, Expense.user_id == current_user.id).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db_expense.date = expense.date
    db_expense.amount = expense.amount
    db_expense.store = expense.store
    db_expense.category = expense.category
    db.commit()
    db.refresh(db_expense)
    return db_expense

@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_expense = db.query(Expense).filter(Expense.id == expense_id, Expense.user_id == current_user.id).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(db_expense)
    db.commit()
    return {"status": "success", "message": "Expense deleted"}

# ===== 収入 (Income) API =====

@app.post("/api/incomes", response_model=IncomeResponse)
def create_income(income: IncomeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_income = Income(
        date=income.date,
        amount=income.amount,
        source=income.source,
        category=income.category,
        user_id=current_user.id
    )
    db.add(db_income)
    db.commit()
    db.refresh(db_income)
    return db_income

@app.get("/api/incomes", response_model=List[IncomeResponse])
def get_incomes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Income).filter(Income.user_id == current_user.id).order_by(Income.date.desc()).all()

@app.patch("/api/incomes/{income_id}", response_model=IncomeResponse)
def update_income(income_id: int, income: IncomeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_income = db.query(Income).filter(Income.id == income_id, Income.user_id == current_user.id).first()
    if not db_income:
        raise HTTPException(status_code=404, detail="Income not found")
    db_income.date = income.date
    db_income.amount = income.amount
    db_income.source = income.source
    db_income.category = income.category
    db.commit()
    db.refresh(db_income)
    return db_income

@app.delete("/api/incomes/{income_id}")
def delete_income(income_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_income = db.query(Income).filter(Income.id == income_id, Income.user_id == current_user.id).first()
    if not db_income:
        raise HTTPException(status_code=404, detail="Income not found")
    db.delete(db_income)
    db.commit()
    return {"status": "success"}

# ===== 資産 (Asset) API =====

@app.post("/api/assets", response_model=AssetResponse)
def create_asset(asset: AssetCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import datetime
    db_asset = Asset(
        name=asset.name,
        amount=asset.amount,
        note=asset.note,
        updated_at=datetime.date.today().isoformat(),
        user_id=current_user.id
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset

@app.get("/api/assets", response_model=List[AssetResponse])
def get_assets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Asset).filter(Asset.user_id == current_user.id).all()

@app.patch("/api/assets/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, asset: AssetCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import datetime
    db_asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db_asset.name = asset.name
    db_asset.amount = asset.amount
    db_asset.note = asset.note
    db_asset.updated_at = datetime.date.today().isoformat()
    db.commit()
    db.refresh(db_asset)
    return db_asset

@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(db_asset)
    db.commit()
    return {"status": "success"}
