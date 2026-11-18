# Virasat Setu (विरासत सेतु)

**Local Full-Stack Prototype for Unclaimed Financial Asset Discovery**

Virasat Setu bridges death registration records with financial institutions (Banks, Insurance Companies, and Mutual Fund Houses) so families can discover and initiate claims for unclaimed financial assets held by deceased relatives.

This prototype runs **100% locally on your computer** with zero external cloud services (no Supabase, no external auth, and no external email API keys required). Everything—React frontend, Express API server, persistent SQLite database (`data/virasat_setu.db`), local document storage (`uploads/claim-documents/`), weighted matching engine, and simulated Email/SMS outbox—works out of the box.

> **Important Scope Boundary**: Virasat Setu does **not** hold or transfer money, directly access private bank customer databases, or automatically confer legal ownership. Financial institutions retain custody of records, verify claimants/nominees/legal heirs, and process actual payouts independently.

---

## 1. Run on Your Local Computer

### Prerequisites
- **Node.js** (v18, v20, or v22+ — works cross-platform on Windows, macOS, and Linux with zero native C++ build tools)

### Steps
```bash
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser.

On first startup, the local SQLite database (`data/virasat_setu.db`) is automatically created and seeded with:
- **9 Financial Institutions** (3 Banks, 3 Insurance Companies, 3 Mutual Fund Houses)
- **90 Simulated Financial Assets** (40 Bank, 25 Insurance, 25 Mutual Fund) — including **4 matching assets for Rajesh Kumar (`SIMULATED-123456`)**
- **30 Historical Deceased Records** (`DC-2025-101` to `DC-2025-130`)
- **Pre-configured Demo Accounts** for all three roles

To reset the database back to its initial seeded state at any time, delete `data/virasat_setu.db` and restart `npm run dev`.

---

## 2. Demo Login Credentials

| Role | Email | Password | Scope |
|---|---|---|---|
| **Family User** | `family.demo@virasatsetu.in` | `Virasat@2026` | Submit death records, view discovered assets, verify claimants, track claims |
| **Administrator** | `admin@virasatsetu.in` | `Admin@2026` | Verify death records, trigger matching, review matches, verify claimants, audit logs |
| **Bank Rep (Bharatiya Rashtriya Bank)** | `rep.bank@virasatsetu.in` | `Inst@2026` | Process Savings & Fixed Deposit claims at BRB only |
| **Insurance Rep (Suraksha Jeevan)** | `rep.insurance@virasatsetu.in` | `Inst@2026` | Process Endowment Policy claims at SJIC only |
| **Mutual Fund Rep (Sanchay AMC)** | `rep.mutualfund@virasatsetu.in` | `Inst@2026` | Process Mutual Fund Folio claims at SAM only |

---

## 3. End-to-End Demonstration Walkthrough (Rajesh Kumar)

1. **Family User**: Sign in as `family.demo@virasatsetu.in` (or register a new family account).
2. Open **Add Deceased Member** and click **Load Rajesh Kumar Demo Data** (`Name: Rajesh Kumar`, `DOB: 1960-06-15`, `DOD: 2026-11-10`, `Sample Identity Ref: SIMULATED-123456`, `Certificate Ref: DC-2026-001`), optionally attach a sample death certificate file, and submit.
3. **Administrator**: Sign out and sign in as `admin@virasatsetu.in`. Open **Death Records**, click **Review & Verify** on Rajesh Kumar (`DC-2026-001`), inspect the uploaded document, and click **Approve & Run Asset Matching**.
4. **Automated Weighted Matching**: The backend scans all 90 institutional records (40 Bank + 25 Insurance + 25 Mutual Fund) using the 50/25/15/10 scoring rubric and discovers **4 Strong Potential Matches (100/100)** for Rajesh Kumar:
   - Savings Account at Bharatiya Rashtriya Bank (`₹4,85,200`)
   - Fixed Deposit at Bharatiya Rashtriya Bank (`₹12,50,000`)
   - Endowment Policy at Suraksha Jeevan Insurance Corp (`₹15,00,000`)
   - Mutual Fund Folio at Sanchay Asset Management (`₹8,42,750`)
5. **Notifications & Local Email Outbox**: Open **Notifications** on `family.demo@virasatsetu.in` to view both the in-app alert and the privacy-masked simulated Email & SMS log.
6. **Claimant Verification**: In **Claimant Verification**, review or submit nominee proofs, then approve the claimant as `admin@virasatsetu.in` under **Claimants**.
7. **Initiate Claim**: Log back in as `family.demo@virasatsetu.in`, open **Discovered Assets**, click **View Details** on any of Rajesh Kumar's 4 assets, and click **Initiate Institutional Claim**.
8. **Institution Processing**: Log in as `rep.bank@virasatsetu.in` (or `rep.insurance@virasatsetu.in` / `rep.mutualfund@virasatsetu.in`), open **Claim Processing Queue**, and update the claim status (`Under Review` → `Documents Required` → `Approved` → `Completed`) with comments.
9. **Family Tracking**: Log back in as the Family User and inspect **Claim Tracking** to view the live status history timeline and institution instructions.
