# Payslip Generator

A small Next.js (App Router + TypeScript) web app that generates company salary slips as downloadable PDFs. The PDF layout closely matches the provided reference payslip, using an A4 portrait composition, teal header bars, earnings/deductions tables, a Net Pay box, optional stamp, and a disclaimer footer.

## Tech stack
- Next.js App Router (TypeScript)
- React client components for the form + preview
- HTML-to-PDF using Puppeteer in API route handlers
- Local JSON file storage (`data/payslips.json`) for saving payslips

## Project structure

- `package.json` – dependencies and scripts
- `next.config.mjs` – Next.js configuration
- `tsconfig.json` – TypeScript config
- `src/app/layout.tsx` – root layout
- `src/app/page.tsx` – main page rendering the form and preview
- `src/app/api/payslip/generate/route.ts` – `POST /api/payslip/generate` (generate PDF + save)
- `src/app/api/payslip/[id]/route.ts` – `GET /api/payslip/:id` (re-generate and download PDF)
- `src/components/PayslipApp.tsx` – composite app shell (form + preview + download button)
- `src/components/PayslipPreview.tsx` – payslip layout used in the browser preview
- `src/styles/global.css` – global layout and form shell
- `src/styles/payslip.css` – payslip A4 layout (mirrors the sample design)
- `src/lib/types.ts` – TypeScript domain types
- `src/lib/calculations.ts` – earnings/deductions and gross/net pay calculations
- `src/lib/formatting.ts` – currency and date/timestamp formatting helpers
- `src/lib/db.ts` – JSON file persistence for payslips
- `src/lib/samplePreset.ts` – sample preset approximating the reference payslip
- `src/server/renderPayslipHtml.ts` – server-side HTML template for Puppeteer
- `sample-payslip-payload.json` – example JSON payload for the `/api/payslip/generate` endpoint

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run the dev server:

```bash
npm run dev
```

3. Open the app in your browser (default: `http://localhost:3000`).

On first run, a `data/payslips.json` file will be created in the project root.

## Core workflow

1. Fill out the Company, Employee, and Payroll sections in the left-hand form.
2. Configure earnings components as percentages (the total must be exactly 100%).
3. Configure deduction components as either:
   - **Fixed amounts** (e.g. Provident Fund = 7,165), or
   - **Percent of Gross** (e.g. Income Tax = 5% of gross).
4. The right side shows a live payslip preview that matches the final PDF layout.
5. When validation passes, click **"Download PDF Payslip"** to call `POST /api/payslip/generate` and download the generated PDF.

## Calculation rules

All monetary math is done in integer minor units (no floating rounding drift):

- If **decimals are disabled** (`useDecimals = false`):
  - Net pay, gross pay, and component values are treated as whole currency units (e.g., PKR).
- If **decimals are enabled**: values are internally scaled by 100 and rounded to integer minor units.

### Deductions and gross pay

Let:
- `net` = user input net pay
- `fixed` = sum of fixed deduction values
- `percentComponents` = deductions with `mode = "percent"`
- `totalPercent` = sum of percentage deduction values

Rules:
- If there is at least one percentage deduction:
  - `gross = round((net + fixed) / (1 - totalPercent/100))`
- If there are only fixed deductions:
  - `gross = net + fixed`

Percentage deduction amounts are allocated such that their sum equals `gross * totalPercent/100` after rounding, using the same remainder-distribution strategy as earnings.

### Earnings allocation

Given `gross` and earnings components with percentages that sum to 100:

1. For each earning component `i`, compute `raw_i = gross * pct_i / 100` in minor units.
2. Take `floor(raw_i)` as the base amount and keep fractional remainders.
3. Compute the remainder: `remainder = gross - sum(base_i)`.
4. Distribute +1 unit to components in descending order of their fractional remainder until `remainder` is 0.
5. This ensures `sum(earnings) == gross` exactly.

### Deductions and net pay

- Fixed deduction amounts are used as-is (converted to minor units).
- Percentage deduction amounts are allocated with the same remainder approach and based on `gross`.
- `totalDeductions = sum(all deductions)`.
- `netComputed = gross - totalDeductions`.
- The Net Pay value shown in the PDF is `netComputed`, which will match the input net pay after rounding.

### Validation

- Earnings percentages must sum **exactly** to 100 (within a tiny epsilon); otherwise the UI shows an error and the **Download** button stays disabled.
- Percentage deductions total must be **less than 100**.
- Net pay must be a positive number.
- Basic required fields:
  - Company name
  - Employee full name
  - Pay date and net pay amount

## API endpoints

### POST `/api/payslip/generate`

Input JSON body:

```json
{
  "payload": {
    "company": { /* Company object */ },
    "employee": { /* Employee object */ },
    "payroll": { /* PayrollConfigInput object */ }
  }
}
```

- The structure of `payload` matches `PayslipPayload` (`src/lib/types.ts`).
- The route:
  1. Validates and calculates earnings/deductions via `calculatePayroll`.
  2. Saves the full payslip record, including calculated amounts, in SQLite.
  3. Renders HTML using `renderPayslipHtml`.
  4. Uses Puppeteer to render an A4 PDF with backgrounds enabled.
  5. Returns the PDF bytes with headers:
     - `Content-Type: application/pdf`
     - `Content-Disposition: attachment; filename="payslip-<id>.pdf"`
     - `X-Payslip-Id: <id>`

### GET `/api/payslip/:id`

- Looks up the payslip record by `id` from the JSON store.
- Re-renders the HTML and generates a fresh PDF using Puppeteer.
- Returns the PDF as `application/pdf` with an attachment `Content-Disposition` header.

## Matching the reference layout

The payslip layout (both preview and PDF) includes:

- A4 portrait page with internal margins and clean white background.
- **Header row**:
  - Company logo placeholder on the top left.
  - Teal header bar on the top right with the text **PAYSLIP**.
  - Company name and multi-line address under the PAYSLIP bar.
- **Employee Information panel** on the left with:
  - Section header bar.
  - Bold teal bar showing the employee name.
  - Address, phone, email, and bank/IBAN line.
- **Right-side info panel** listing Pay Date, Title, ID, and CNIC, with teal label cells.
- **Earnings table**:
  - Header row with teal background and white text.
  - Rows for each earnings component with right-aligned amounts.
  - Teal total row labeled **Gross Pay**.
- **Deductions table** below earnings:
  - Similar styling, with a **Total Deductions** teal row.
- **Bottom right Net Pay box**:
  - Prominent teal rectangle that shows "Net Pay" and the currency amount.
- **Bottom left stamp area**:
  - Circular dashed placeholder that you can later replace with a real stamp image.
- **Footer**:
  - Disclaimer text on the left.
  - Timestamp (generation date and time) on the right.

The preview uses `src/styles/payslip.css`, while the PDF uses the same class names and nearly identical CSS embedded via `<style>` in `renderPayslipHtml`.

## Changing earnings and deductions templates

- Default values come from `src/lib/samplePreset.ts`.
- To change the default earnings/deductions shown when the app loads:
  - Edit the `earnings` and `deductions` arrays in `samplePreset`.
- To create different templates programmatically, you can:
  - Extend the JSON store and UI to save/load multiple presets.

## Deployment notes

- The PDF generation uses Puppeteer and requires a Node.js runtime with a Chromium binary available.
- For containerized deployment:
  - Base your image on a Node.js image that includes necessary fonts and libraries for headless Chrome.
  - Ensure the container can run `puppeteer.launch` (no `--no-sandbox` issues as appropriate for your environment).
- The `/api/payslip/*` routes specify `runtime = "nodejs"` to avoid the Edge runtime and enable Puppeteer.

## Acceptance checks

- With `netPay = 85000` and the sample preset deductions (7,165 + 370 + 390), gross pay and total deductions reconcile and `netComputed = 85,000`.
- The app blocks PDF generation if earnings percentages do not sum to 100%.
- Downloaded PDFs open correctly and visually match the on-screen preview, including header bars, tables, Net Pay box, and footer disclaimer.
#   I T 1 - I n v o i c e - G e n e r a t o r  
 