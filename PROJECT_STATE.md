# Project State & Time-Based Billing Specifications

This file documents the application's billing architecture rules and specifications, ensuring that any future refactoring or AI coding sessions are aligned with the established design principles.

## Billing System Rules (Time-Based)

In July 2026, the application pivoted from a legacy "coin/credit" billing model (where 1 request = 1 coin) to a serverless GPU **Time-Based Billing System** to optimize serverless unit economics.

### 1. Free Tier Signup Bonus
- **Default Balance**: All newly created users are credited with **`900.0` seconds** (exactly 15 free minutes of GPU processing time).
- **Model Field**: Defined as `balance_seconds` (`Float`) in the `User` model (`db_models.py`).

### 2. Pay-As-You-Go / Recharge Rates
- **Exchange Rate**: **10,000 VND = 900 seconds of GPU execution time** (exactly 15 minutes).
- **Conversion Helper**: Defined as `calculate_credits(amount_vnd)` in `main.py`, returning the equivalent seconds of GPU time.
- **Topups**: Processed securely via PayOS integration webhooks and transaction polling.

### 3. Balance Checks & Deductions
- **Pre-Task Check**:
  - Middleware/dependency checks user balance before starting any GPU or resource-heavy task: `await check_balance_before_task(db, user_id)`.
  - If `user.balance_seconds <= 0`, the request is immediately blocked, raising an **`HTTP 402 Payment Required`** with the message:
    `"Your time balance is empty. Please purchase a minute package to continue."`
  - PRO users (`user.is_pro == True`) bypass this check and are not billed.
- **Post-Task Deduction**:
  - Exact time duration is recorded using `time.time() - start_time` around AI/GPU operations (PaddleOCR, LaMa, Real-ESRGAN).
  - Deductions are performed atomically using PostgreSQL row-level locking:
    - **FastAPI (async)**: `await deduct_balance(db, user_id, execution_time_seconds, description)`.
    - **Celery Worker (sync)**: `deduct_balance(user_id, execution_time_seconds, description)`.
  - Transaction histories and balance variations are recorded in the `UserTransaction` and `CreditLog` tables.
- **Error Handling & Refunds**:
  - Because deductions are performed *after* successful execution, upfront token charge/refund cycles have been deprecated and removed. If a task fails, no balance is deducted and no refund processing is required.
