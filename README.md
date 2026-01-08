# IT1 Payslip Generator

A professional Next.js web application for generating customizable payslip PDFs with pixel-perfect design and automatic calculations.

## Features

- **Live Preview**: Real-time payslip preview with exact PDF rendering
- **PDF Generation**: High-quality A4 PDFs using Puppeteer
- **Smart Calculations**: Automatic gross pay, earnings, and deductions calculation
- **Branding**: Company logo, watermark, and stamp support with auto-injection
- **Professional Design**: Modern UI with Poppins font, teal theme, and clean layout
- **Local Storage**: JSON-based persistence for payslip records
- **Dynamic Naming**: PDFs named as `Payslip-EmployeeName-PayDate.pdf`

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS
- **PDF Engine**: Puppeteer
- **Storage**: JSON file system

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/mhrizvi216/IT1-Payslip-Generator.git
cd IT1-Payslip-Generator

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000` to use the application.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Main page
│   └── api/payslip/
│       ├── generate/route.ts         # PDF generation endpoint
│       └── [id]/route.ts             # Retrieve payslip by ID
├── components/
│   ├── Navbar.tsx                    # Navigation header
│   ├── PayslipApp.tsx                # Main app shell
│   └── PayslipPreview.tsx            # Live preview component
├── lib/
│   ├── calculations.ts               # Payroll calculations
│   ├── db.ts                         # JSON persistence
│   ├── formatting.ts                 # Date & currency formatting
│   ├── samplePreset.ts               # Default form values
│   └── types.ts                      # TypeScript interfaces
├── server/
│   └── renderPayslipHtml.ts          # Server-side HTML template
└── styles/
    ├── global.css                    # Global styles
    └── payslip.css                   # Payslip-specific styles
```

## Usage

### Creating a Payslip

1. **Company Info**: Enter company name, address, and optionally upload a logo
2. **Employee Info**: Fill in employee details (name, address, ID, CNIC, etc.)
3. **Payroll Config**: 
   - Set pay date and net pay amount
   - Configure earnings (must sum to 100%)
   - Add deductions (fixed or percentage-based)
4. **Preview**: Review the live preview on the right
5. **Download**: Click "Download PDF Payslip" to generate the PDF

### Calculation Logic

All calculations use integer minor units to avoid floating-point errors:

**Earnings Distribution**:
- Total earnings percentages must equal 100%
- Each component is allocated proportionally from gross pay
- Remainder distribution ensures exact totals

**Gross Pay Calculation**:
- With percentage deductions: `gross = (net + fixed) / (1 - totalPercent/100)`
- Fixed deductions only: `gross = net + fixed`

**Deductions**:
- Fixed: Direct amounts (e.g., 7,165 PKR)
- Percentage: Applied to gross pay (e.g., 5% of gross)

## Features in Detail

### Branding

The application automatically injects default branding if not provided:

- **Logo**: `public/it1-logo.png` appears in the header
- **Watermark**: Center background watermark with 8% opacity
- **Stamp**: `public/IT1_Stamp.png` appears in the footer (rotated -16°)

### PDF Customization

- **Title**: Dynamic HTML title (`Payslip-EmployeeName-PayDate`)
- **Filename**: Downloads as `Payslip-EmployeeName-PayDate.pdf`
- **Theme**: Customizable theme color (default: #0088c8)
- **Font**: Poppins font family for modern appearance

### Layout Features

- **Single Page Fit**: Optimized margins ensure content fits on one A4 page
- **Split Headers**: Tables use two-column headers with white borders
- **Employee Panel**: Clean layout with gray header and teal name bar
- **Payroll Grid**: 2x2 grid displaying Pay Date, Title, ID, and CNIC
- **Net Pay Box**: Prominent blue bar after deductions
- **Footer**: Disclaimer and timestamp

## API Endpoints

### `POST /api/payslip/generate`

Generate and download a new payslip PDF.

**Request Body**:
```json
{
  "payload": {
    "company": {
      "name": "IT1 Technologies",
      "addressLines": ["Address Line 1", "Address Line 2"],
      "logoDataUrl": "data:image/png;base64,...",
      "watermarkDataUrl": "data:image/png;base64,...",
      "stampDataUrl": "data:image/png;base64,...",
      "themeColor": "#0088c8"
    },
    "employee": {
      "fullName": "John Doe",
      "addressLines": ["Employee Address"],
      "employeeId": "EMP001",
      "nationalId": "12345-6789012-3",
      "title": "Software Engineer",
      "phone": "+92-XXX-XXXXXXX",
      "email": "john@example.com",
      "bankName": "Bank Name",
      "bankAccount": "PKXX-XXXX-XXXX-XXXX-XXXX-XXXX"
    },
    "payroll": {
      "payDate": "2026-01-09",
      "currency": "PKR",
      "netPay": 85000,
      "useDecimals": false,
      "dateFormatStyle": "ordinal-short",
      "earnings": [
        { "key": "basic", "label": "Basic Salary", "percentage": 40.32 },
        { "key": "housing", "label": "Housing Allowance", "percentage": 26.88 }
      ],
      "deductions": [
        { "key": "pf", "label": "Provident Fund", "mode": "fixed", "value": 7165 },
        { "key": "tax", "label": "Income Tax", "mode": "percent", "value": 5 }
      ]
    }
  }
}
```

**Response**: PDF file with headers:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Payslip-John-Doe-09-Jan-26.pdf"`
- `X-Payslip-Id: <uuid>`

### `GET /api/payslip/:id`

Retrieve a previously generated payslip by ID.

**Response**: PDF file

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:18-alpine

# Install Chromium for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

No environment variables required for basic operation. All data is stored locally in `data/payslips.json`.

## Customization

### Changing Theme Color

Edit the company form or set `themeColor` in the API payload:

```typescript
company: {
  themeColor: "#0088c8" // Your brand color
}
```

### Default Preset

Modify `src/lib/samplePreset.ts` to change default form values.

### Styling

- **Preview**: Edit `src/styles/payslip.css`
- **PDF**: Update `PAYSLIP_CSS` in `src/server/renderPayslipHtml.ts`

⚠️ Keep both CSS files synchronized for consistent preview/PDF rendering.

## Validation Rules

- ✅ Company name required
- ✅ Employee full name required
- ✅ Pay date required
- ✅ Net pay must be positive
- ✅ Earnings percentages must sum to exactly 100%
- ✅ Deduction percentages must be less than 100%

## License

MIT

## Author

**IT1 Technologies**

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues or questions, please open a GitHub issue at:
https://github.com/mhrizvi216/IT1-Payslip-Generator/issues