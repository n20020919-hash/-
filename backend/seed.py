import random
from models import SessionLocal, Expense
from datetime import datetime, timedelta

def seed_data():
    db = SessionLocal()
    # If already has data, skip
    if db.query(Expense).count() > 0:
        print("Data already exists.")
        db.close()
        return

    categories = ['食費', '日用品', '交通費', '趣味・娯楽', '交際費', 'その他']
    stores = ['スーパーABC', 'コンビニ', 'ドラッグストア', '電車・バス', 'レストラン', 'カフェ', 'Amazon']
    
    today = datetime.now()
    
    expenses = []
    for i in range(20):
        random_days = random.randint(0, 30)
        expense_date = (today - timedelta(days=random_days)).strftime("%Y-%m-%d")
        
        category = random.choice(categories)
        
        # Adjust amounts based on category
        if category == '食費':
            amount = random.randint(500, 5000)
            store = random.choice(['スーパーABC', 'コンビニ', 'カフェ'])
        elif category == '交通費':
            amount = random.randint(200, 1500)
            store = '電車・バス'
        else:
            amount = random.randint(1000, 10000)
            store = random.choice(stores)

        expense = Expense(
            date=expense_date,
            amount=float(amount),
            store=store,
            category=category
        )
        db.add(expense)
        expenses.append(expense)

    db.commit()
    print(f"Successfully added 20 dummy expenses.")
    db.close()

if __name__ == "__main__":
    seed_data()
