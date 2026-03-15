-- CreateTable
CREATE TABLE IF NOT EXISTS "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'SIMPLE',
    "storeMode" TEXT NOT NULL DEFAULT 'SINGLE_STORE',
    "receiptTemplate" TEXT NOT NULL DEFAULT 'THERMAL_80',
    "printMode" TEXT NOT NULL DEFAULT 'DIRECT_ESC_POS',
    "printerName" TEXT,
    "labelPrintMode" TEXT NOT NULL DEFAULT 'BROWSER_PDF',
    "labelPrinterName" TEXT,
    "labelSize" TEXT NOT NULL DEFAULT 'SHELF_TAG',
    "receiptLogoUrl" TEXT,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "receiptShowVatNumber" BOOLEAN NOT NULL DEFAULT true,
    "receiptShowAddress" BOOLEAN NOT NULL DEFAULT true,
    "socialMediaHandle" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "tinNumber" TEXT,
    "momoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "momoProvider" TEXT,
    "momoNumber" TEXT,
    "openingCapitalPence" INTEGER NOT NULL DEFAULT 0,
    "requireOpenTillForSales" BOOLEAN NOT NULL DEFAULT false,
    "discountApprovalThresholdBps" INTEGER NOT NULL DEFAULT 1500,
    "varianceReasonRequired" BOOLEAN NOT NULL DEFAULT true,
    "inventoryAdjustmentRiskThresholdBase" INTEGER NOT NULL DEFAULT 50,
    "cashVarianceRiskThresholdPence" INTEGER NOT NULL DEFAULT 2000,
    "customerScope" TEXT NOT NULL DEFAULT 'SHARED',
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappPhone" TEXT,
    "whatsappScheduleTime" TEXT DEFAULT '20:00',
    "whatsappBranchScope" TEXT DEFAULT 'ALL',
    "whatsappLowStockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappCashVarianceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappCashVarianceThreshold" DECIMAL(65,30) NOT NULL DEFAULT 50.00,
    "whatsappVoidAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappVoidAlertThreshold" DECIMAL(65,30) NOT NULL DEFAULT 100.00,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "hasDemoData" BOOLEAN NOT NULL DEFAULT false,
    "guidedSetup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Organization_businessId_key" UNIQUE ("businessId"),
    CONSTRAINT "Organization_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Store" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isMainStore" BOOLEAN NOT NULL DEFAULT false,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatRateBps" INTEGER NOT NULL DEFAULT 1500,
    "nhilRateBps" INTEGER NOT NULL DEFAULT 250,
    "getFundRateBps" INTEGER NOT NULL DEFAULT 250,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Store_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Till" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Till_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Till_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "approvalPinHash" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorTempSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_key" UNIQUE ("email"),
    CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_token_key" UNIQUE ("token"),
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_token_key" UNIQUE ("token"),
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'RETAIL',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimitPence" INTEGER NOT NULL DEFAULT 0,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "creditLimitPence" INTEGER NOT NULL DEFAULT 0,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#059669',
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Category_businessId_name_key" UNIQUE ("businessId", "name"),
    CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "sellingPriceBasePence" INTEGER NOT NULL,
    "allowZeroPrice" BOOLEAN NOT NULL DEFAULT false,
    "defaultCostBasePence" INTEGER NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "vatRateBps" INTEGER NOT NULL DEFAULT 0,
    "vatCode" TEXT,
    "reorderPointBase" INTEGER NOT NULL DEFAULT 0,
    "reorderQtyBase" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "promoBuyQty" INTEGER NOT NULL DEFAULT 0,
    "promoGetQty" INTEGER NOT NULL DEFAULT 0,
    "preferredSupplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_barcode_key" UNIQUE ("barcode"),
    CONSTRAINT "Product_businessId_name_key" UNIQUE ("businessId", "name"),
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluralName" TEXT NOT NULL,
    "symbol" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductUnit" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isBaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "conversionToBase" INTEGER NOT NULL DEFAULT 1,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductUnit_productId_unitId_key" UNIQUE ("productId", "unitId"),
    CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InventoryBalance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyOnHandBase" INTEGER NOT NULL DEFAULT 0,
    "avgCostBasePence" INTEGER NOT NULL DEFAULT 0,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryBalance_storeId_productId_key" UNIQUE ("storeId", "productId"),
    CONSTRAINT "InventoryBalance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCashPence" INTEGER NOT NULL DEFAULT 0,
    "expectedCashPence" INTEGER NOT NULL DEFAULT 0,
    "actualCashPence" INTEGER,
    "cardTotalPence" INTEGER NOT NULL DEFAULT 0,
    "transferTotalPence" INTEGER NOT NULL DEFAULT 0,
    "momoTotalPence" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER,
    "closedByUserId" TEXT,
    "closeManagerApprovedByUserId" TEXT,
    "closeManagerApprovalMode" TEXT,
    "varianceReasonCode" TEXT,
    "varianceReason" TEXT,
    "closureSnapshotJson" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "ownerOverride" BOOLEAN NOT NULL DEFAULT false,
    "ownerOverrideReasonCode" TEXT,
    "ownerOverrideJustification" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Shift_openKey_key" UNIQUE ("openKey"),
    CONSTRAINT "Shift_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "Till" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shift_closeManagerApprovedByUserId_fkey" FOREIGN KEY ("closeManagerApprovedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "beforeQtyBase" INTEGER,
    "afterQtyBase" INTEGER,
    "unitCostBasePence" INTEGER,
    "type" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "userId" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "qtyInUnit" INTEGER NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "transactionNumber" TEXT,
    "externalRef" TEXT,
    "shiftId" TEXT,
    "cashierUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "branchId" TEXT,
    "discountPence" INTEGER NOT NULL DEFAULT 0,
    "discountOverrideReasonCode" TEXT,
    "discountOverrideReason" TEXT,
    "discountApprovedByUserId" TEXT,
    "subtotalPence" INTEGER NOT NULL,
    "vatComponentPence" INTEGER NOT NULL DEFAULT 0,
    "nhilComponentPence" INTEGER NOT NULL DEFAULT 0,
    "getFundComponentPence" INTEGER NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "vatPence" INTEGER NOT NULL,
    "totalPence" INTEGER NOT NULL,
    "grossMarginPence" INTEGER NOT NULL DEFAULT 0,
    "cashReceivedPence" INTEGER NOT NULL DEFAULT 0,
    "changeDuePence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesInvoice_businessId_transactionNumber_key" UNIQUE ("businessId", "transactionNumber"),
    CONSTRAINT "SalesInvoice_businessId_externalRef_key" UNIQUE ("businessId", "externalRef"),
    CONSTRAINT "SalesInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "Till" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_discountApprovedByUserId_fkey" FOREIGN KEY ("discountApprovedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesReturn" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reasonCode" TEXT,
    "refundMethod" TEXT,
    "refundAmountPence" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "managerApprovedByUserId" TEXT,
    "managerApprovalMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesReturn_salesInvoiceId_key" UNIQUE ("salesInvoiceId"),
    CONSTRAINT "SalesReturn_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesReturn_managerApprovedByUserId_fkey" FOREIGN KEY ("managerApprovedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "qtyInUnit" INTEGER NOT NULL,
    "conversionToBase" INTEGER NOT NULL DEFAULT 1,
    "qtyBase" INTEGER NOT NULL,
    "unitPricePence" INTEGER NOT NULL,
    "lineDiscountPence" INTEGER NOT NULL DEFAULT 0,
    "promoDiscountPence" INTEGER NOT NULL DEFAULT 0,
    "lineSubtotalPence" INTEGER NOT NULL,
    "lineVatComponentPence" INTEGER NOT NULL DEFAULT 0,
    "lineNhilComponentPence" INTEGER NOT NULL DEFAULT 0,
    "lineGetFundComponentPence" INTEGER NOT NULL DEFAULT 0,
    "lineTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "lineVatPence" INTEGER NOT NULL,
    "lineTotalPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesInvoiceLine_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoiceLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MobileMoneyCollection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "initiatedByUserId" TEXT,
    "provider" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "payerMsisdn" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "idempotencyKey" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "providerTransactionId" TEXT,
    "providerReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerStatus" TEXT,
    "failureReason" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileMoneyCollection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MobileMoneyCollection_idempotencyKey_key" UNIQUE ("idempotencyKey"),
    CONSTRAINT "MobileMoneyCollection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MobileMoneyCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MobileMoneyCollection_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MobileMoneyCollection_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesPayment" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "network" TEXT,
    "payerMsisdn" TEXT,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "collectionId" TEXT,
    "branchId" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,

    CONSTRAINT "SalesPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SalesPayment_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesPayment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MobileMoneyCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "subtotalPence" INTEGER NOT NULL,
    "vatPence" INTEGER NOT NULL,
    "totalPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refundMethod" TEXT,
    "refundAmountPence" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseReturn_purchaseInvoiceId_key" UNIQUE ("purchaseInvoiceId"),
    CONSTRAINT "PurchaseReturn_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseInvoiceLine" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "qtyInUnit" INTEGER NOT NULL,
    "conversionToBase" INTEGER NOT NULL DEFAULT 1,
    "qtyBase" INTEGER NOT NULL,
    "unitCostPence" INTEGER NOT NULL,
    "lineSubtotalPence" INTEGER NOT NULL,
    "lineVatPence" INTEGER NOT NULL,
    "lineTotalPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoiceLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchasePayment" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "recordedByUserId" TEXT,
    "notes" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,

    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchasePayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchasePayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Account_businessId_code_key" UNIQUE ("businessId", "code"),
    CONSTRAINT "Account_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "method" TEXT,
    "dueDate" TIMESTAMP(3),
    "vendorName" TEXT,
    "reference" TEXT,
    "attachmentPath" TEXT,
    "notes" TEXT,
    "qaTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExpensePayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,

    CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExpensePayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpensePayment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpensePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitPence" INTEGER NOT NULL,
    "creditPence" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Stocktake" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Stocktake_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stocktake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedBase" INTEGER NOT NULL,
    "countedBase" INTEGER NOT NULL,
    "varianceBase" INTEGER NOT NULL,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StocktakeLine_stocktakeId_productId_key" UNIQUE ("stocktakeId", "productId"),
    CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StocktakeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionType" TEXT,
    "entity" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "beforeState" TEXT,
    "afterState" TEXT,
    "reason" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "branchId" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT,
    "storeId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Branch_storeId_key" UNIQUE ("storeId"),
    CONSTRAINT "Branch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Branch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Device" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT,
    "branchId" TEXT,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "platform" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Device_deviceKey_key" UNIQUE ("deviceKey"),
    CONSTRAINT "Device_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Device_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MobileMoneyStatusLog" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerStatus" TEXT,
    "notes" TEXT,
    "payloadJson" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileMoneyStatusLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MobileMoneyStatusLog_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MobileMoneyCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CashDrawerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tillId" TEXT NOT NULL,
    "shiftId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "cashierUserId" TEXT,
    "entryType" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "reasonCode" TEXT,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "beforeExpectedCashPence" INTEGER,
    "afterExpectedCashPence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDrawerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashDrawerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerEntry_tillId_fkey" FOREIGN KEY ("tillId") REFERENCES "Till" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerEntry_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockTransfer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockTransferLine" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyBase" INTEGER NOT NULL,
    "unitCostBasePence" INTEGER,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockTransferLine_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockTransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RiskAlert" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "cashierUserId" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "metricValue" INTEGER,
    "thresholdValue" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "contextJson" TEXT,
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RiskAlert_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskAlert_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskAlert_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SyncEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deviceId" TEXT,
    "actorUserId" TEXT,
    "branchId" TEXT,
    "qaTag" TEXT,
    "qaRunId" TEXT,
    "payloadHash" TEXT,
    "resultRef" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SyncEvent_businessId_eventId_key" UNIQUE ("businessId", "eventId"),
    CONSTRAINT "SyncEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DayClosure" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "closedByUserId" TEXT NOT NULL,
    "closureDate" TIMESTAMP(3) NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayClosure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DayClosure_storeId_closureDate_key" UNIQUE ("storeId", "closureDate"),
    CONSTRAINT "DayClosure_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DayClosure_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DayClosure_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "jobName" TEXT NOT NULL,
    "runKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT DEFAULT 'CRON',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "resultJson" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduledJob_runKey_key" UNIQUE ("runKey"),
    CONSTRAINT "ScheduledJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "provider" TEXT NOT NULL DEFAULT 'WHATSAPP_DEEPLINK',
    "recipient" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerStatus" TEXT,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "deepLink" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MessageLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReorderAction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "qtyBase" INTEGER NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReorderAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReorderAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReorderAction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReorderAction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReorderAction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReorderAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Store_businessId_idx" ON "Store"("businessId");
CREATE INDEX IF NOT EXISTS "Till_storeId_active_idx" ON "Till"("storeId", "active");
CREATE INDEX IF NOT EXISTS "Shift_userId_status_idx" ON "Shift"("userId", "status");
CREATE INDEX IF NOT EXISTS "Shift_tillId_openedAt_idx" ON "Shift"("tillId", "openedAt");
CREATE INDEX IF NOT EXISTS "Shift_closedByUserId_closedAt_idx" ON "Shift"("closedByUserId", "closedAt");
CREATE INDEX IF NOT EXISTS "User_businessId_active_idx" ON "User"("businessId", "active");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "Session_userId_createdAt_idx" ON "Session"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "Customer_businessId_name_idx" ON "Customer"("businessId", "name");
CREATE INDEX IF NOT EXISTS "Customer_storeId_name_idx" ON "Customer"("storeId", "name");
CREATE INDEX IF NOT EXISTS "Supplier_businessId_name_idx" ON "Supplier"("businessId", "name");
CREATE INDEX IF NOT EXISTS "Category_businessId_sortOrder_idx" ON "Category"("businessId", "sortOrder");
CREATE INDEX IF NOT EXISTS "Product_businessId_active_createdAt_idx" ON "Product"("businessId", "active", "createdAt");
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "InventoryBalance_productId_idx" ON "InventoryBalance"("productId");
CREATE INDEX IF NOT EXISTS "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX IF NOT EXISTS "StockMovement_storeId_createdAt_idx" ON "StockMovement"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockAdjustment_storeId_createdAt_idx" ON "StockAdjustment"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockAdjustment_productId_createdAt_idx" ON "StockAdjustment"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_businessId_idx" ON "SalesInvoice"("businessId");
CREATE INDEX IF NOT EXISTS "SalesInvoice_storeId_createdAt_idx" ON "SalesInvoice"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_cashierUserId_createdAt_idx" ON "SalesInvoice"("cashierUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_businessId_paymentStatus_createdAt_idx" ON "SalesInvoice"("businessId", "paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_customerId_createdAt_idx" ON "SalesInvoice"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_transactionNumber_idx" ON "SalesInvoice"("transactionNumber");
CREATE INDEX IF NOT EXISTS "SalesInvoice_branchId_createdAt_idx" ON "SalesInvoice"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_customerId_paymentStatus_idx" ON "SalesInvoice"("customerId", "paymentStatus");
CREATE INDEX IF NOT EXISTS "SalesInvoice_businessId_createdAt_idx" ON "SalesInvoice"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesReturn_storeId_createdAt_idx" ON "SalesReturn"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesReturn_userId_createdAt_idx" ON "SalesReturn"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesReturn_managerApprovedByUserId_createdAt_idx" ON "SalesReturn"("managerApprovedByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoiceLine_salesInvoiceId_idx" ON "SalesInvoiceLine"("salesInvoiceId");
CREATE INDEX IF NOT EXISTS "SalesInvoiceLine_productId_idx" ON "SalesInvoiceLine"("productId");
CREATE INDEX IF NOT EXISTS "SalesPayment_salesInvoiceId_receivedAt_idx" ON "SalesPayment"("salesInvoiceId", "receivedAt");
CREATE INDEX IF NOT EXISTS "SalesPayment_receivedAt_idx" ON "SalesPayment"("receivedAt");
CREATE INDEX IF NOT EXISTS "SalesPayment_collectionId_receivedAt_idx" ON "SalesPayment"("collectionId", "receivedAt");
CREATE INDEX IF NOT EXISTS "SalesPayment_status_receivedAt_idx" ON "SalesPayment"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_businessId_createdAt_idx" ON "PurchaseInvoice"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_storeId_createdAt_idx" ON "PurchaseInvoice"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_businessId_paymentStatus_createdAt_idx" ON "PurchaseInvoice"("businessId", "paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_supplierId_createdAt_idx" ON "PurchaseInvoice"("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_storeId_createdAt_idx" ON "PurchaseReturn"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_userId_createdAt_idx" ON "PurchaseReturn"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseInvoiceLine_purchaseInvoiceId_idx" ON "PurchaseInvoiceLine"("purchaseInvoiceId");
CREATE INDEX IF NOT EXISTS "PurchaseInvoiceLine_productId_idx" ON "PurchaseInvoiceLine"("productId");
CREATE INDEX IF NOT EXISTS "PurchasePayment_purchaseInvoiceId_paidAt_idx" ON "PurchasePayment"("purchaseInvoiceId", "paidAt");
CREATE INDEX IF NOT EXISTS "PurchasePayment_paidAt_idx" ON "PurchasePayment"("paidAt");
CREATE INDEX IF NOT EXISTS "Account_businessId_type_idx" ON "Account"("businessId", "type");
CREATE INDEX IF NOT EXISTS "Expense_businessId_paymentStatus_createdAt_idx" ON "Expense"("businessId", "paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Expense_storeId_createdAt_idx" ON "Expense"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Expense_accountId_createdAt_idx" ON "Expense"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExpensePayment_expenseId_paidAt_idx" ON "ExpensePayment"("expenseId", "paidAt");
CREATE INDEX IF NOT EXISTS "ExpensePayment_businessId_paidAt_idx" ON "ExpensePayment"("businessId", "paidAt");
CREATE INDEX IF NOT EXISTS "JournalEntry_businessId_entryDate_idx" ON "JournalEntry"("businessId", "entryDate");
CREATE INDEX IF NOT EXISTS "JournalEntry_businessId_referenceType_referenceId_idx" ON "JournalEntry"("businessId", "referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX IF NOT EXISTS "Stocktake_storeId_createdAt_idx" ON "Stocktake"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Stocktake_status_idx" ON "Stocktake"("status");
CREATE INDEX IF NOT EXISTS "StocktakeLine_stocktakeId_idx" ON "StocktakeLine"("stocktakeId");
CREATE INDEX IF NOT EXISTS "StocktakeLine_productId_idx" ON "StocktakeLine"("productId");
CREATE INDEX IF NOT EXISTS "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actionType_idx" ON "AuditLog"("actionType");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_businessId_action_createdAt_idx" ON "AuditLog"("businessId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "Branch_businessId_active_idx" ON "Branch"("businessId", "active");
CREATE INDEX IF NOT EXISTS "Branch_organizationId_active_idx" ON "Branch"("organizationId", "active");
CREATE INDEX IF NOT EXISTS "Device_businessId_active_idx" ON "Device"("businessId", "active");
CREATE INDEX IF NOT EXISTS "Device_branchId_active_idx" ON "Device"("branchId", "active");
CREATE INDEX IF NOT EXISTS "MobileMoneyCollection_businessId_status_initiatedAt_idx" ON "MobileMoneyCollection"("businessId", "status", "initiatedAt");
CREATE INDEX IF NOT EXISTS "MobileMoneyCollection_storeId_initiatedAt_idx" ON "MobileMoneyCollection"("storeId", "initiatedAt");
CREATE INDEX IF NOT EXISTS "MobileMoneyCollection_salesInvoiceId_idx" ON "MobileMoneyCollection"("salesInvoiceId");
CREATE INDEX IF NOT EXISTS "MobileMoneyCollection_provider_providerRequestId_idx" ON "MobileMoneyCollection"("provider", "providerRequestId");
CREATE INDEX IF NOT EXISTS "MobileMoneyStatusLog_collectionId_observedAt_idx" ON "MobileMoneyStatusLog"("collectionId", "observedAt");
CREATE INDEX IF NOT EXISTS "CashDrawerEntry_businessId_createdAt_idx" ON "CashDrawerEntry"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashDrawerEntry_storeId_tillId_createdAt_idx" ON "CashDrawerEntry"("storeId", "tillId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashDrawerEntry_shiftId_createdAt_idx" ON "CashDrawerEntry"("shiftId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashDrawerEntry_entryType_createdAt_idx" ON "CashDrawerEntry"("entryType", "createdAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_businessId_status_requestedAt_idx" ON "StockTransfer"("businessId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_fromStoreId_requestedAt_idx" ON "StockTransfer"("fromStoreId", "requestedAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_toStoreId_requestedAt_idx" ON "StockTransfer"("toStoreId", "requestedAt");
CREATE INDEX IF NOT EXISTS "StockTransferLine_stockTransferId_idx" ON "StockTransferLine"("stockTransferId");
CREATE INDEX IF NOT EXISTS "StockTransferLine_productId_idx" ON "StockTransferLine"("productId");
CREATE INDEX IF NOT EXISTS "RiskAlert_businessId_occurredAt_idx" ON "RiskAlert"("businessId", "occurredAt");
CREATE INDEX IF NOT EXISTS "RiskAlert_storeId_occurredAt_idx" ON "RiskAlert"("storeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "RiskAlert_cashierUserId_occurredAt_idx" ON "RiskAlert"("cashierUserId", "occurredAt");
CREATE INDEX IF NOT EXISTS "RiskAlert_status_occurredAt_idx" ON "RiskAlert"("status", "occurredAt");
CREATE INDEX IF NOT EXISTS "SyncEvent_businessId_appliedAt_idx" ON "SyncEvent"("businessId", "appliedAt");
CREATE INDEX IF NOT EXISTS "DayClosure_businessId_closureDate_idx" ON "DayClosure"("businessId", "closureDate");
CREATE INDEX IF NOT EXISTS "ScheduledJob_jobName_startedAt_idx" ON "ScheduledJob"("jobName", "startedAt");
CREATE INDEX IF NOT EXISTS "ScheduledJob_businessId_startedAt_idx" ON "ScheduledJob"("businessId", "startedAt");
CREATE INDEX IF NOT EXISTS "ScheduledJob_status_startedAt_idx" ON "ScheduledJob"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "MessageLog_businessId_sentAt_idx" ON "MessageLog"("businessId", "sentAt");
CREATE INDEX IF NOT EXISTS "MessageLog_channel_sentAt_idx" ON "MessageLog"("channel", "sentAt");
CREATE INDEX IF NOT EXISTS "MessageLog_messageType_sentAt_idx" ON "MessageLog"("messageType", "sentAt");
CREATE INDEX IF NOT EXISTS "MessageLog_provider_sentAt_idx" ON "MessageLog"("provider", "sentAt");
CREATE INDEX IF NOT EXISTS "MessageLog_status_sentAt_idx" ON "MessageLog"("status", "sentAt");
CREATE INDEX IF NOT EXISTS "MessageLog_providerMessageId_idx" ON "MessageLog"("providerMessageId");
CREATE INDEX IF NOT EXISTS "ReorderAction_businessId_storeId_status_idx" ON "ReorderAction"("businessId", "storeId", "status");
CREATE INDEX IF NOT EXISTS "ReorderAction_productId_status_idx" ON "ReorderAction"("productId", "status");
