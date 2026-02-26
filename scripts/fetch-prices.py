#!/usr/bin/env python3
"""
Fetch historical monthly close prices from Yahoo Finance (via yfinance)
and insert into the price_history table.

Usage:
  python scripts/fetch-prices.py                    # Fetch all companies
  python scripts/fetch-prices.py --limit 100        # Fetch first 100 companies
  python scripts/fetch-prices.py --code RELIANCE    # Fetch single company
  python scripts/fetch-prices.py --period 5y        # Fetch 5 years (default: 10y)
  python scripts/fetch-prices.py --update           # Only fetch companies with no price data
"""

import argparse
import os
import sys
import time
from datetime import datetime

try:
    import yfinance as yf
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Required packages: pip install yfinance psycopg2-binary")
    sys.exit(1)


def get_db_connection():
    """Connect to PostgreSQL using DATABASE_URL or defaults."""
    url = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/screener")
    return psycopg2.connect(url)


def get_companies(conn, limit=None, code=None, update_only=False):
    """Get companies with BSE/NSE codes for Yahoo Finance lookup."""
    cur = conn.cursor()

    if code:
        cur.execute(
            "SELECT id, screener_code, bse_code, nse_code FROM companies WHERE screener_code = %s",
            (code,),
        )
    elif update_only:
        cur.execute(
            """
            SELECT c.id, c.screener_code, c.bse_code, c.nse_code
            FROM companies c
            LEFT JOIN price_history p ON p.company_id = c.id
            WHERE p.id IS NULL
            ORDER BY c.id
            """
            + (f" LIMIT {int(limit)}" if limit else ""),
        )
    else:
        cur.execute(
            "SELECT id, screener_code, bse_code, nse_code FROM companies ORDER BY id"
            + (f" LIMIT {int(limit)}" if limit else ""),
        )

    return cur.fetchall()


def get_yahoo_ticker(bse_code, nse_code, screener_code):
    """Convert BSE/NSE codes to Yahoo Finance ticker format."""
    # Prefer NSE (.NS) over BSE (.BO)
    if nse_code:
        return f"{nse_code}.NS"
    if bse_code:
        return f"{bse_code}.BO"
    # Fallback: try screener code as NSE
    return f"{screener_code}.NS"


def fetch_prices(ticker, period="10y"):
    """Fetch monthly close prices from Yahoo Finance."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period, interval="1mo")
        if hist.empty:
            return None
        # Return list of (date, close_price) tuples
        prices = []
        for date_idx, row in hist.iterrows():
            price_date = date_idx.date()
            close = float(row["Close"])
            if close > 0:
                prices.append((price_date, round(close, 2)))
        return prices
    except Exception as e:
        return None


def insert_prices(conn, company_id, prices):
    """Insert prices into price_history with upsert."""
    if not prices:
        return 0

    cur = conn.cursor()
    values = [(company_id, d, p, "yfinance") for d, p in prices]

    execute_values(
        cur,
        """
        INSERT INTO price_history (company_id, price_date, close_price, source)
        VALUES %s
        ON CONFLICT (company_id, price_date) DO UPDATE SET
            close_price = EXCLUDED.close_price,
            source = EXCLUDED.source
        """,
        values,
    )
    conn.commit()
    return len(values)


def main():
    parser = argparse.ArgumentParser(description="Fetch historical prices from Yahoo Finance")
    parser.add_argument("--limit", type=int, help="Limit number of companies")
    parser.add_argument("--code", type=str, help="Fetch single company by screener code")
    parser.add_argument("--period", type=str, default="10y", help="History period (default: 10y)")
    parser.add_argument("--update", action="store_true", help="Only fetch companies with no price data")
    parser.add_argument("--batch-size", type=int, default=50, help="Companies per batch before pause")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests in seconds")
    args = parser.parse_args()

    conn = get_db_connection()
    companies = get_companies(conn, limit=args.limit, code=args.code, update_only=args.update)

    print(f"Fetching prices for {len(companies)} companies (period: {args.period})")

    total_prices = 0
    succeeded = 0
    failed = 0
    skipped = 0

    for i, (company_id, screener_code, bse_code, nse_code) in enumerate(companies):
        ticker = get_yahoo_ticker(bse_code, nse_code, screener_code)

        prices = fetch_prices(ticker, period=args.period)

        if prices is None or len(prices) == 0:
            # Try alternate ticker
            if nse_code:
                alt_ticker = f"{bse_code}.BO" if bse_code else None
            else:
                alt_ticker = f"{screener_code}.NS"

            if alt_ticker and alt_ticker != ticker:
                prices = fetch_prices(alt_ticker, period=args.period)

        if prices and len(prices) > 0:
            count = insert_prices(conn, company_id, prices)
            total_prices += count
            succeeded += 1
        else:
            failed += 1

        if (i + 1) % 10 == 0:
            print(f"  Progress: {i + 1}/{len(companies)} ({succeeded} ok, {failed} failed, {total_prices} prices)")

        if (i + 1) % args.batch_size == 0:
            time.sleep(2)  # Longer pause between batches
        else:
            time.sleep(args.delay)

    print(f"\nDone: {succeeded} companies, {total_prices} price records inserted, {failed} failed")
    conn.close()


if __name__ == "__main__":
    main()
